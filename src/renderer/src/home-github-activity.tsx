import { useEffect, useId, useState } from "react";
import { ArrowUpRight, AtSign, CircleDot, GitPullRequest, MessageCircle } from "lucide-react";
import type { GithubActivityEvent, GithubActivityKind, HomeGithubInput, HomeGithubResult } from "../../shared/home-github";

const tabs = [{ id: "all", label: "All" }, { id: "prs", label: "PRs" }, { id: "issues", label: "Issues" }, { id: "comments", label: "Comments" }, { id: "mentions", label: "Mentions" }] as const;
type Tab = "all" | GithubActivityKind;
const icons = { prs: GitPullRequest, issues: CircleDot, comments: MessageCircle, mentions: AtSign };
export function HomeGithubActivity({ input, github, pullRequests, onOpenLink }: {
  input: HomeGithubInput; github: HomeGithubResult | null; pullRequests: GithubActivityEvent[]; onOpenLink: (url: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [loaded, setLoaded] = useState<{ key: string; result: HomeGithubResult } | null>(null);
  const id = useId(), key = JSON.stringify(input);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => { void window.unbiased.homeGithub({ ...JSON.parse(key), includeActivity: true }).then(result => {
      if (!cancelled) setLoaded({ key, result });
    }).catch(() => { if (!cancelled) setLoaded({ key, result: { ok: false, error: "GitHub activity couldn’t load. Try another date or return shortly." } }); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [key]);
  const result = loaded?.key === key ? loaded.result : null;
  const details = result?.ok ? result.activity : null;
  const events = [...new Map([...pullRequests, ...(details?.events ?? [])].map(event => [event.id, event])).values()].sort((a,b) => Date.parse(b.at)-Date.parse(a.at));
  const visible = tab === "all" ? events : events.filter(event => event.kind === tab);
  const pending = result === null;
  return <div className="home-day-github-activity">
    <h3>GitHub activity</h3>
    <div className="home-github-tabs" role="tablist" aria-label="GitHub activity types">
      {tabs.map(({ id: value, label }, index) => <button key={value} role="tab" id={`${id}-${value}`} aria-selected={tab === value} aria-controls={`${id}-panel`} tabIndex={tab === value ? 0 : -1}
        onClick={() => setTab(value)} onKeyDown={event => {
          let next = index;
          if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
          else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = tabs.length - 1;
          else return;
          event.preventDefault(); setTab(tabs[next].id); document.getElementById(`${id}-${tabs[next].id}`)?.focus();
        }}>{label}<span>{pending && value !== "prs" ? "…" : value === "all" ? events.length : events.filter(event => event.kind === value).length}</span></button>)}
    </div>
    <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`} tabIndex={0}>
      {visible.length > 0 && <div className="home-pr-list home-pr-list-details" role="region" aria-label="GitHub activity on selected date" tabIndex={0}>{visible.map(event => {
        const Icon = icons[event.kind];
        return <button key={event.id} className="home-pr-event" onClick={() => onOpenLink(event.url)}>
          <Icon size={14} className={event.action === "Merged" ? "home-pr-merged" : undefined} /><span><span>{event.title}</span><small>{event.action} · {event.repository} · <time dateTime={event.at}>{new Date(event.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></small></span><ArrowUpRight size={12} />
        </button>;
      })}</div>}
      <p className="home-empty" role="status">{pending ? "Loading more GitHub activity…" : result && !result.ok ? result.error : visible.length ? "" : `No ${tab === "all" ? "GitHub activity" : tabs.find(item => item.id === tab)?.label.toLowerCase()} found for this date in the available history.`}</p>
      {details?.notices.map(notice => <p className="home-usage-scope" key={notice}>{notice}</p>)}
    </div>
    {github?.ok && <p className="home-usage-scope">@{github.login} · Your GitHub activity{github.partial || details?.partial ? " · Partial history" : ""}</p>}
  </div>;
}
