import { readGithubActivity } from "./home-github-activity";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import type { HomeGithubInput, HomeGithubResult, HomePullRequest } from "../shared/home-github";

type Run = (command: string, args: string[], cwd?: string) => Promise<string>;
const run: Run = (command, args, cwd) => new Promise((resolve, reject) => execFile(command, args, {
  cwd, timeout: 20_000, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: "1" },
}, (error, stdout) => error ? reject(error) : resolve(stdout)));
export function githubRepository(remote: string): string | null {
  return /^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(remote.trim())?.[1] ?? null;
}
export function githubWindow(input: HomeGithubInput): { start: string; end: string } {
  const start = Date.parse(input?.start), end = Date.parse(input?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 32 * 86400_000) throw new Error("Invalid activity dates");
  return { start: new Date(start).toISOString().replace(".000Z", "Z"), end: new Date(end).toISOString().replace(".000Z", "Z") };
}
const fields = "number title url createdAt mergedAt state repository { nameWithOwner }";
const query = `query($opened:String!,$merged:String!){viewer{login} opened:search(query:$opened,type:ISSUE,first:100){issueCount pageInfo{hasNextPage} nodes{... on PullRequest{${fields}}}} merged:search(query:$merged,type:ISSUE,first:100){issueCount pageInfo{hasNextPage} nodes{... on PullRequest{${fields}}}}}`;
/** Read-only GitHub metadata through the user's existing CLI login; never reads PR bodies. */
export class HomeGithub {
  private cache = new Map<string, { at: number; result: HomeGithubResult }>();
  private pending = new Map<string, Promise<HomeGithubResult>>();
  constructor(private execute: Run = run, private now = Date.now, private activityFile?: () => string) {}
  async get(input: HomeGithubInput, folders?: string[]): Promise<HomeGithubResult> {
    let window: ReturnType<typeof githubWindow>;
    try { window = githubWindow(input); } catch { return { ok: false, error: "Choose a valid activity date." }; }
    const gh = ["/opt/homebrew/bin/gh", "/usr/local/bin/gh"].find(path => existsSync(path)) ?? "gh";
    if (input.includeActivity) {
      const base = await this.get({ ...input, includeActivity: false }, folders);
      if (!base.ok) return base;
      const key = JSON.stringify(["activity", base.login, window, base.repositories]);
      const cached = this.cache.get(key); if (cached && this.now() - cached.at < 60_000) return { ...base, ...cached.result };
      const pending = this.pending.get(key); if (pending) return pending;
      const task = readGithubActivity(this.execute, gh, base.login, window, base.repositories ?? [], this.activityFile?.()).then(activity => {
        const result = { ...base, activity };
        this.cache.set(key, { at: this.now(), result });
        while (this.cache.size > 32) this.cache.delete(this.cache.keys().next().value!);
        return result;
      }).finally(() => this.pending.delete(key));
      this.pending.set(key, task); return task;
    }

    try {
      // Resolve identity before serving cache, so changing CLI accounts cannot reuse another user's PRs.
      const login = (await this.execute(gh, ["api", "--hostname", "github.com", "user", "--jq", ".login"])).trim();
      if (!/^[\w-]+$/.test(login)) throw new Error("Invalid GitHub account");
      const repos = folders ? [...new Set((await Promise.all(folders.map(async folder => {
        try { return githubRepository(await this.execute("git", ["config", "--get", "remote.origin.url"], folder)); } catch { return null; }
      }))).filter((repo): repo is string => !!repo))].sort() : [];
      if (folders && !repos.length) return { ok: false, error: "This project has no GitHub origin repository." };
      const key = JSON.stringify([login, window, repos]);
      const cached = this.cache.get(key); if (cached && this.now() - cached.at < 60_000) return cached.result;
      const pending = this.pending.get(key); if (pending) return pending;
      const base = `is:pr author:${login} ${repos.map(repo => `repo:${repo}`).join(" ")}`;
      // GitHub applies only one value for repeated date qualifiers. Use an inclusive
      // second-precision range to preserve our exclusive local-midnight end.
      const lastSecond = new Date(Date.parse(window.end) - 1000).toISOString().replace(".000Z", "Z");
      const opened = `${base} created:${window.start}..${lastSecond} sort:created-desc`;
      const merged = `${base} merged:${window.start}..${lastSecond} sort:updated-desc`;
      const task = this.execute(gh, ["api", "--hostname", "github.com", "graphql", "-f", `query=${query}`, "-f", `opened=${opened}`, "-f", `merged=${merged}`]).then(raw => {
        const response = JSON.parse(raw);
        if (response.errors?.length || !response.data || response.data.viewer.login !== login) throw new Error("GitHub activity unavailable");
        const data = response.data;
        const prs = new Map<string, HomePullRequest>();
        for (const pr of [...data.opened.nodes, ...data.merged.nodes]) {
          if (!pr?.repository?.nameWithOwner || typeof pr.title !== "string" || !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(pr.url)) continue;
          prs.set(pr.url, { number: pr.number, title: pr.title, url: pr.url, repository: pr.repository.nameWithOwner, createdAt: pr.createdAt, mergedAt: pr.mergedAt, state: pr.state });
        }
        const result: HomeGithubResult = { ok: true, login, opened: data.opened.issueCount, merged: data.merged.issueCount, pullRequests: [...prs.values()], partial: data.opened.pageInfo.hasNextPage || data.merged.pageInfo.hasNextPage, repositories: repos };
        this.cache.set(key, { at: this.now(), result });
        while (this.cache.size > 32) this.cache.delete(this.cache.keys().next().value!);
        return result;
      }).finally(() => this.pending.delete(key));
      this.pending.set(key, task); return await task;
    } catch { return { ok: false, error: "GitHub activity unavailable. Sign in with gh auth login, or try again shortly." }; }
  }
}
