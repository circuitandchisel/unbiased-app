import { readFileSync, writeFileSync, renameSync } from "node:fs";
import type { GithubActivityDetails, GithubActivityEvent } from "../shared/home-github";
type Execute = (command: string, args: string[], cwd?: string) => Promise<string>;
const subject = "number title url createdAt author{login} repository{nameWithOwner}";
const timeline = `timelineItems(first:100,since:$since,itemTypes:[ASSIGNED_EVENT,ISSUE_COMMENT,CLOSED_EVENT,REOPENED_EVENT]){pageInfo{hasNextPage} nodes{__typename ... on AssignedEvent{id createdAt assignee{... on User{login}}} ... on IssueComment{id createdAt url author{login}} ... on ClosedEvent{id createdAt actor{login}} ... on ReopenedEvent{id createdAt actor{login}}}}`;
const query = `query($search:String!,$since:DateTime!){viewer{login} search(query:$search,type:ISSUE,first:40){pageInfo{hasNextPage} nodes{... on Issue{${subject} ${timeline}} ... on PullRequest{${subject} ${timeline} reviews(first:20){pageInfo{hasNextPage} nodes{id submittedAt url author{login} state comments(first:20){pageInfo{hasNextPage} nodes{id createdAt url author{login}}}}}}}}}`;
const validUrl = (url: unknown): url is string => typeof url === "string" && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(?:issues|pull)\/\d+(?:#[\w-]+)?$/.test(url);
export function timelineActivity(data: any, login: string, start: number, end: number): GithubActivityDetails {
  const events: GithubActivityEvent[] = []; let partial = !!data.search.pageInfo.hasNextPage;
  for (const node of data.search.nodes) {
    if (!node?.repository || typeof node.title !== "string" || !validUrl(node.url)) continue;
    const repository = node.repository.nameWithOwner, issue = node.url.includes("/issues/");
    const add = (id: string, kind: GithubActivityEvent["kind"], action: string, at: string, url = node.url) => {
      const time = Date.parse(at); if (time < start || time >= end || !Number.isFinite(time) || !validUrl(url)) return;
      events.push({ id, kind, action, at, url, title: node.title, repository });
    };
    if (issue && node.author?.login === login) add(`opened:${node.url}`, "issues", "Opened issue", node.createdAt);
    partial ||= !!node.timelineItems?.pageInfo.hasNextPage || !!node.reviews?.pageInfo.hasNextPage;
    for (const item of node.timelineItems?.nodes ?? []) {
      if (item.__typename === "AssignedEvent" && item.assignee?.login === login) add(item.id, issue ? "issues" : "prs", issue ? "Assigned to you" : "PR assigned to you", item.createdAt);
      if (item.__typename === "IssueComment" && item.author?.login === login) add(item.id, "comments", "You commented", item.createdAt, item.url);
      if (issue && item.actor?.login === login && ["ClosedEvent", "ReopenedEvent"].includes(item.__typename)) add(item.id, "issues", item.__typename === "ClosedEvent" ? "You closed issue" : "You reopened issue", item.createdAt);
    }
    for (const review of node.reviews?.nodes ?? []) {
      if (review.author?.login === login && review.submittedAt && review.state !== "PENDING") add(review.id, "prs", "You reviewed", review.submittedAt, review.url);
      partial ||= !!review.comments?.pageInfo.hasNextPage;
      for (const comment of review.comments?.nodes ?? []) if (comment.author?.login === login) add(comment.id, "comments", "You commented on code", comment.createdAt, comment.url);
    }
  }
  return { events, partial, notices: partial ? ["Some GitHub timelines exceed the fetched history; this is a partial activity list."] : [] };
}
/** Notifications are thread updates, never presented as the date of an original mention. */
export function notificationActivity(notifications: any[], repos: string[], start: number, end: number): GithubActivityEvent[] {
  return notifications.flatMap(item => {
    const reason = item.reason, repository = item.repository?.full_name, time = Date.parse(item.updated_at);
    if (!["mention", "team_mention", "review_requested"].includes(reason) || !repository || (repos.length && !repos.includes(repository)) || time < start || time >= end || !Number.isFinite(time)) return [];
    const match = /^https:\/\/api\.github\.com\/repos\/([\w.-]+\/[\w.-]+)\/(issues|pulls)\/(\d+)$/.exec(item.subject?.url ?? "");
    if (!match || match[1] !== repository) return [];
    return [{ id: `notification:${item.id}:${item.updated_at}`, kind: "mentions" as const, action: reason === "review_requested" ? "Review-request thread updated" : reason === "team_mention" ? "Team-mention thread updated" : "Mention thread updated", title: item.subject.title, repository, at: item.updated_at, precision: "thread-update" as const, url: `https://github.com/${repository}/${item.subject.type === "PullRequest" ? "pull" : "issues"}/${match[3]}` }];
  });
}
export async function readGithubActivity(execute: Execute, gh: string, login: string, window: {start:string;end:string}, repos: string[], file?: string): Promise<GithubActivityDetails> {
  const start = Date.parse(window.start), end = Date.parse(window.end), notices: string[] = [];
  let events: GithubActivityEvent[] = [], partial = false;
  const search = `involves:${login} updated:>=${window.start} ${repos.map(repo => `repo:${repo}`).join(" ")} sort:updated-asc`;
  const results = await Promise.allSettled([
    execute(gh, ["api", "--hostname", "github.com", "graphql", "-f", `query=${query}`, "-f", `search=${search}`, "-f", `since=${window.start}`]),
    execute(gh, ["api", "--hostname", "github.com", `notifications?all=true&per_page=100&since=${encodeURIComponent(window.start)}&before=${encodeURIComponent(window.end)}`]),
  ]);
  try {
    const current = (await execute(gh, ["api", "--hostname", "github.com", "user", "--jq", ".login"])).trim();
    if (current !== login) return { events: [], partial: true, notices: ["The GitHub account changed. Select the date again to refresh."] };
  } catch { return { events: [], partial: true, notices: ["GitHub identity couldn’t be verified. Try again shortly."] }; }
  if (results[0].status === "fulfilled") {
    try {
      const response = JSON.parse(results[0].value);
      if (response.errors?.length || response.data.viewer.login !== login) throw new Error();
      const timeline = timelineActivity(response.data, login, start, end); events.push(...timeline.events); partial ||= timeline.partial; notices.push(...timeline.notices);
    } catch { partial = true; notices.push("Issue, comment, and review history couldn’t load."); }
  } else { partial = true; notices.push("Issue, comment, and review history couldn’t load."); }
  if (results[1].status === "fulfilled") {
    try {
      const notifications = JSON.parse(results[1].value); if (!Array.isArray(notifications)) throw new Error();
      events.push(...notificationActivity(notifications, repos, start, end));
      if (notifications.length === 100) { partial = true; notices.push("Only the first 100 matching notification threads were fetched."); }
    } catch { partial = true; notices.push("Mentions are unavailable with the current GitHub login."); }
  } else { partial = true; notices.push("Mentions are unavailable with the current GitHub login."); }
  notices.push("History covers matching issues and PRs you’re involved in; events outside the fetched timelines may be missing.");
  notices.push("Mentions show a thread’s latest update, not the original mention time. Older mention history may be incomplete.");
  // Retain observed metadata only, partitioned by the CLI user. Never store comment bodies.
  if (file) {
    try {
      let records: Record<string, GithubActivityEvent[]> = {};
      try { records = JSON.parse(readFileSync(file, "utf8")); } catch {}
      const saved = Array.isArray(records[login]) ? records[login].filter(event => event && typeof event.id === "string" && ["prs", "issues", "comments", "mentions"].includes(event.kind) && typeof event.title === "string" && typeof event.action === "string" && typeof event.repository === "string" && Number.isFinite(Date.parse(event.at)) && validUrl(event.url)) : [];
      const combined = new Map(saved.map(event => [event.id, event]));
      for (const event of events) combined.set(event.id, event);
      const retained = [...combined.values()].filter(event => validUrl(event.url) && Date.parse(event.at) > Date.now() - 186 * 86400_000).sort((a,b) => Date.parse(b.at)-Date.parse(a.at)).slice(0, 5000);
      records[login] = retained;
      writeFileSync(`${file}.tmp`, JSON.stringify(records), { mode: 0o600 }); renameSync(`${file}.tmp`, file);
      events = retained.filter(event => Date.parse(event.at) >= start && Date.parse(event.at) < end && (!repos.length || repos.includes(event.repository)));
    } catch { notices.push("Activity is available, but couldn’t be saved locally."); }
  }
  return { events: [...new Map(events.map(event => [event.id, event])).values()].sort((a,b) => Date.parse(b.at)-Date.parse(a.at)), partial, notices };
}
