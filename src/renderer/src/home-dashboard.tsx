import { HomeGithubActivity } from "./home-github-activity";
import type { HomeGithubResult } from "../../shared/home-github";
import { LiquidMenuSurface } from "./liquid-menu";
import { RefreshCWIcon, type RefreshCWIconHandle } from "./refresh-cw-icon";
import { motion } from "motion/react";
import { MessageCircleMoreIcon } from "./message-circle-more-icon";
import { HomeWorkSnapshot } from "./home-work-snapshot";
import { ProjectIcon } from "./project-icon";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, CalendarDays, ChartNoAxesColumn, Compass, Gauge, GitPullRequest, Hammer, History, Bug, X, Check, ChevronDown } from "lucide-react";
import { epochMillis, formatConversationTime, formatRecentConversationTime } from "../../shared/conversation-time";
import { homeActivity, homeChats, homeDayKey, chatsOnHomeDay, type HomeProject, type HomeThread } from "./home-dashboard-data";
import "./home-dashboard.css";

type Billing = { ok: true; organization: { name: string }; balanceCents: number | null; monthToDateSpendCents: number | null; spendSyncedAt: string | null; tokens: { input: number; cached: number; output: number } | null } | { ok: false; error: string };
const money = (cents: number | null) => cents === null ? "Unavailable" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const prompts = [
  { label: "Explore code", icon: Compass, text: "Explore this codebase and explain how it works at a high level." },
  { label: "Build something", icon: Hammer, text: "Help me build a new feature: " },
  { label: "Review changes", icon: GitPullRequest, text: "Review the current changes and suggest improvements." },
  { label: "Fix an issue", icon: Bug, text: "Help me find and fix issues or failing tests." },
];

function HomeProjectFilter({ projects, value, onChange }: { projects: HomeProject[]; value: string; onChange: (value: string) => void }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const options: { id: string; name: string; icon?: string; color?: string | null }[] = [{ id: "", name: "All projects" }, ...projects];
  const selected = options.find(option => option.id === value) ?? options[0];
  const label = selected.name;
  const close = () => { popup.current?.hidePopover(); trigger.current?.focus({ preventScroll: true }); };
  const position = () => {
    const button = trigger.current, menu = popup.current;
    if (!button || !menu) return;
    const rect = button.getBoundingClientRect();
    const width = Math.min(240, window.innerWidth - 24);
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width))}px`;
    const below = window.innerHeight - rect.bottom - 20;
    const above = rect.top - 20;
    const upwards = below < 160 && above > below;
    menu.style.maxHeight = `${Math.max(60, Math.min(320, upwards ? above : below))}px`;
    menu.style.top = upwards ? "auto" : `${rect.bottom + 6}px`;
    menu.style.bottom = upwards ? `${window.innerHeight - rect.top + 6}px` : "auto";
    menu.dataset.direction = upwards ? "up" : "down";
  };
  const focusSelected = () => popup.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
  const show = () => { position(); popup.current?.showPopover(); focusSelected(); };
  useEffect(() => {
    const menu = popup.current;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !menu?.matches(":popover-open")) return;
      event.preventDefault(); event.stopPropagation();
      menu.hidePopover(); trigger.current?.focus({ preventScroll: true });
    };
    const toggle = (event: Event) => {
      const active = (event as ToggleEvent).newState === "open";
      setOpen(active);
    };
    const dismiss = () => { if (menu?.matches(":popover-open")) menu.hidePopover(); };
    const scroll = (event: Event) => {
      if (event.target instanceof Node && menu?.contains(event.target)) return;
      dismiss();
    };
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const motionPreference = () => setReducedMotion(preference.matches);
    preference.addEventListener("change", motionPreference);
    document.addEventListener("scroll", scroll, true);
    menu?.addEventListener("toggle", toggle);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("resize", dismiss);
    return () => { preference.removeEventListener("change", motionPreference); document.removeEventListener("scroll", scroll, true); menu?.removeEventListener("toggle", toggle); window.removeEventListener("keydown", escape, true); window.removeEventListener("resize", dismiss); };
  }, []);
  return <div className="home-project-filter">
    <motion.button ref={trigger} type="button" className="home-project-filter-trigger" whileTap={reducedMotion ? undefined : { scale: .94 }} transition={{ duration: .12 }} aria-label={`Filter home activity by project: ${label}`} aria-haspopup="listbox" aria-expanded={open} aria-controls="home-project-options" popoverTarget="home-project-options" popoverTargetAction="toggle"
      onClick={() => {
        if (!popup.current?.matches(":popover-open")) {
          position();
          // Let the native invoker open first, then focus without waiting for
          // its asynchronous toggle event (which can race arrow navigation).
          queueMicrotask(() => { if (popup.current?.matches(":popover-open")) { focusSelected(); } });
        }
      }} onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); show(); } }}><ProjectIcon icon={selected.icon} color={selected.color} size={13} /><span>{label}</span><ChevronDown size={12} /></motion.button>
    <div ref={popup} id="home-project-options" className="home-project-options u-liquid-menu-shell" data-liquid-align="right" data-liquid-open={open} popover="auto" role="listbox" aria-label="Filter home activity by project" data-popover
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
        const buttons = Array.from(popup.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        let next = index;
        if (event.key === "ArrowDown") next = (index + 1) % buttons.length;
        else if (event.key === "ArrowUp") next = (index - 1 + buttons.length) % buttons.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = buttons.length - 1;
        else return;
        event.preventDefault(); event.stopPropagation(); buttons[next]?.focus();
      }}>
      {/* One shape, and no filter on it: a blur could only damage it.
          The liquid is in the timing. Width, height and corners share one
          curve; staggering the axes reads as two queued animations.
          LIQUID_STILL raises stiffness with damping: no corner overshoot,
          landing in about 180ms instead of creeping toward the target.
          Text stays on its own unfiltered layer so it remains crisp. */}
      <LiquidMenuSurface open={open} host={popup} anchor={trigger} className="home-project-liquid-body" />
      <div className="home-project-menu-ink u-liquid-menu-content" data-open={open || undefined}>
      <div className="home-project-menu-heading" role="presentation">Show activity for</div>
      {options.map((option, index) => <button style={{ transitionDelay: open && !reducedMotion ? `${30 + Math.min(index, 6) * 22}ms` : "0ms" }} type="button" role="option" aria-selected={value === option.id} tabIndex={value === option.id ? 0 : -1} key={option.id} data-project-id={option.id} className={option.id ? undefined : "home-project-option-all"} onClick={() => { onChange(option.id); close(); }}><span className="home-project-option-icon"><ProjectIcon icon={option.icon} color={option.color} size={14} /></span><span className="home-project-option-label">{option.name}</span><span className="home-project-option-check">{value === option.id && <Check size={13} />}</span></button>)}
      </div>
    </div>
  </div>;
}

export function HomeDashboard({ projects, recents, selectedProjectId, running, readBilling, onOpenThread, onOpenLink, onPick }: {
  projects: HomeProject[]; recents: HomeThread[]; selectedProjectId: string | null; running: ReadonlySet<string>;
  readBilling: () => Promise<Billing>; onOpenThread: (id: string) => void; onOpenLink: (url: string) => void; onPick: (text: string) => void;
}) {
  const [scope, setScope] = useState(selectedProjectId ?? "");
  const [billing, setBilling] = useState<Billing | null>(null);
  const [retry, setRetry] = useState(0);
  const refreshIcon = useRef<RefreshCWIconHandle>(null);
  const [githubState, setGithubState] = useState<{ key: string; result: HomeGithubResult } | null>(null);
  const [githubRetry, setGithubRetry] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [focusedDay, setFocusedDay] = useState(() => homeDayKey(new Date()));
  const calendar = useRef<HTMLDivElement>(null);
  useEffect(() => setScope(selectedProjectId ?? ""), [selectedProjectId]);
  useEffect(() => {
    let cancelled = false;
    setBilling(null);
    void readBilling().then(result => { if (!cancelled) setBilling(result); }).catch(() => { if (!cancelled) setBilling({ ok: false, error: "Could not reach the account service" }); });
    return () => { cancelled = true; };
  }, [readBilling, retry]);
  const all = useMemo(() => homeChats(projects, recents), [projects, recents]);
  const chats = scope ? all.filter(chat => chat.projectId === scope) : all;
  const activity = homeActivity(chats);
  const monthLabels = activity.days.flatMap(({ date, future }, index) => !future && (index === 0 || date.getDate() === 1)
    ? [{ date, column: Math.floor(index / 7) + 1 }] : []);
  // A very short partial month at the left edge should not crowd the next label.
  const visibleMonths = monthLabels.filter((label, index) => !monthLabels[index + 1] || monthLabels[index + 1].column - label.column >= 3);
  const recent = chats.slice(0, 3);
  const dayChats = selectedDay ? chatsOnHomeDay(chats, selectedDay) : [];
  const selectedDate = activity.days.find(day => homeDayKey(day.date) === selectedDay)?.date;
  const rangeStart = selectedDate ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const rangeEnd = selectedDate ? new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + 1) : new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, 1);
  const githubKey = JSON.stringify({ start: rangeStart.toISOString(), end: rangeEnd.toISOString(), ...(scope ? { projectId: scope } : {}) });
  const github = githubState?.key === githubKey ? githubState.result : null;
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void window.unbiased.homeGithub(JSON.parse(githubKey)).then(result => {
        if (!cancelled) setGithubState({ key: githubKey, result });
      }).catch(() => { if (!cancelled) setGithubState({ key: githubKey, result: { ok: false, error: "GitHub activity couldn’t load. Try again shortly." } }); });
    }, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [githubKey, githubRetry]);
  const prEvents = github?.ok ? github.pullRequests.flatMap(pr => [
    ...(Date.parse(pr.createdAt) >= rangeStart.getTime() && Date.parse(pr.createdAt) < rangeEnd.getTime() ? [{ pr, action: "Opened", at: pr.createdAt }] : []),
    ...(pr.mergedAt && Date.parse(pr.mergedAt) >= rangeStart.getTime() && Date.parse(pr.mergedAt) < rangeEnd.getTime() ? [{ pr, action: "Merged", at: pr.mergedAt }] : []),
  ]).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)) : [];
  const renderPullRequests = (limit: number) => prEvents.slice(0, limit).map(({ pr, action, at }) => <button key={`${pr.url}-${action}`} className="home-pr-event" onClick={() => onOpenLink(pr.url)}>
    <GitPullRequest size={14} className={action === "Merged" ? "home-pr-merged" : "home-pr-opened"} />
    <span><span>{pr.title}</span><small>{action} · {pr.repository} #{pr.number} · {selectedDate ? new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : new Date(at).toLocaleDateString([], { month: "short", day: "numeric" })}</small></span><ArrowUpRight size={12} />
  </button>);
  const dayGroups = new Map<string, typeof dayChats>();
  for (const chat of dayChats) {
    const key = chat.projectId ?? "";
    const group = dayGroups.get(key) ?? [];
    group.push(chat); dayGroups.set(key, group);
  }
  const month = new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date());
  return <div className="home-dashboard" aria-label="Workspace overview">
    <div className="home-suggestions">{prompts.map(({ label, icon: Icon, text }) => <button key={label} onClick={() => onPick(text)}><Icon size={13} />{label}</button>)}</div>
    <div className="home-section-heading"><span>At a glance</span><HomeProjectFilter projects={projects} value={scope} onChange={setScope} /></div>
    <div className="home-grid">
      <section className="home-card home-activity"><h2><CalendarDays size={14} />Chat activity<span>Last 26 weeks</span></h2>
        <div ref={calendar} className="home-calendar" role="group" aria-label="Chat activity by date. Use arrow keys to move between dates, then Enter to select.">
          {activity.days.map(({ date, count, future }, i) => {
            const day = homeDayKey(date);
            const label = `${date.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}: ${count} chat${count === 1 ? "" : "s"} started`;
            return <button key={day} type="button" data-home-day-index={i} data-home-day={day}
              className={`home-day level-${Math.min(4, count)}${future ? " future" : ""}`}
              disabled={future} tabIndex={day === focusedDay ? 0 : -1}
              aria-label={label} title={future ? undefined : label} aria-pressed={selectedDay === day}
              aria-controls="home-day-activity" onFocus={() => setFocusedDay(day)}
              onClick={() => { setSelectedDay(day); setFocusedDay(day); }}
              onKeyDown={event => {
                let next = i;
                if (event.key === "ArrowLeft") next -= 7;
                else if (event.key === "ArrowRight") next += 7;
                else if (event.key === "ArrowUp") next--;
                else if (event.key === "ArrowDown") next++;
                else if (event.key === "Home") next -= i % 7;
                else if (event.key === "End") next += 6 - i % 7;
                else return;
                event.preventDefault();
                next = Math.max(0, Math.min(activity.days.findLastIndex(day => !day.future), next));
                calendar.current?.querySelector<HTMLButtonElement>(`[data-home-day-index="${next}"]`)?.focus();
              }} />;
          })}
        </div>
        <div className="home-calendar-months" aria-label="Months in the activity calendar">
          {visibleMonths.map(({ date, column }, index) => <span key={`${date.getFullYear()}-${date.getMonth()}`}
            title={date.toLocaleDateString([], { month: "long", year: "numeric" })}
            style={{ gridColumn: `${Math.min(column, 25)} / ${visibleMonths[index + 1]?.column ?? 27}`, textAlign: column > 24 ? "right" : undefined }}>
            {date.toLocaleDateString([], { month: "short" })}
          </span>)}
        </div><div className="home-activity-footer"><span><strong>{activity.total}</strong> chats started · <strong>{activity.activeDays}</strong> active days</span><span className="home-legend">Less{[0,1,2,3,4].map(level => <i key={level} className={`home-day level-${level}`} />)}More</span></div>
      </section>
      <section className="home-card home-recent"><h2><History size={14} />Recent chats</h2>
        {recent.length === 0 ? <p className="home-empty">Your recent chats will appear here.</p> : recent.map(chat => {
          const at = epochMillis(chat.updatedAt) ?? epochMillis(chat.createdAt);
          return <button className="home-chat" key={chat.id} onClick={() => onOpenThread(chat.id)}><MessageCircleMoreIcon size={14} /><span><span>{chat.title}</span><small>{[chat.projectName, at !== null ? formatRecentConversationTime(at) : null].filter(Boolean).join(" · ")}</small></span>{running.has(chat.id) ? <small className="home-working">Working</small> : <ArrowUpRight size={13} />}</button>;
        })}
      </section>
      <section className="home-card home-usage"><h2><Gauge size={14} />Account usage<button aria-label="Refresh account usage" onMouseEnter={() => refreshIcon.current?.startAnimation()} onMouseLeave={() => refreshIcon.current?.stopAnimation()} onFocus={() => refreshIcon.current?.startAnimation()} onBlur={() => refreshIcon.current?.stopAnimation()} onClick={() => setRetry(value => value + 1)} disabled={billing === null}><RefreshCWIcon ref={refreshIcon} size={12} /></button></h2>
        {billing === null ? <p className="home-empty" role="status">Loading account usage…</p> : !billing.ok ? <p className="home-empty" role="status">Usage unavailable. {billing.error}</p> : <>
          <div className="home-amount">{money(billing.monthToDateSpendCents)}</div><p className="home-metric-label">Spent this month</p>
          <p className="home-token-count">{billing.tokens ? `${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(billing.tokens.input + billing.tokens.cached + billing.tokens.output)} tokens` : "Token usage unavailable"}</p>
          <div className="home-balance"><span>Credit balance</span><strong>{money(billing.balanceCents)}</strong></div>
          <p className="home-usage-scope">{billing.organization.name || "Account"} · All projects{billing.spendSyncedAt && Number.isFinite(Date.parse(billing.spendSyncedAt)) ? ` · Updated ${formatConversationTime(Date.parse(billing.spendSyncedAt))}` : ""}</p>
        </>}
      </section>
      <section className="home-card home-prs"><h2><GitPullRequest size={14} />Pull requests<button aria-label="Refresh pull requests" onClick={() => { setGithubState(null); setGithubRetry(value => value + 1); }} disabled={github === null}><RefreshCWIcon size={12} /></button></h2>
        {github === null ? <p className="home-empty" role="status">Loading GitHub activity…</p> : !github.ok ? <p className="home-empty" role="status">{github.error}</p> : <>
          <p className="home-pr-counts">{github.opened} opened · {github.merged} merged<span>{selectedDate ? selectedDate.toLocaleDateString([], { month: "short", day: "numeric" }) : "This month"}</span></p>
          {prEvents.length ? <div className="home-pr-list" role="region" aria-label="Pull request activity" tabIndex={0}>{renderPullRequests(200)}</div> : <p className="home-empty">No pull requests opened or merged {selectedDate ? "on this date" : "this month"}.</p>}
          <p className="home-usage-scope">@{github.login} · Your PRs · {scope ? "Project repositories" : "All repositories"}{github.partial ? " · Showing a partial list" : ""}</p>
        </>}
      </section>
      <section className="home-card home-month"><h2><ChartNoAxesColumn size={14} />{selectedDate ? selectedDate.toLocaleDateString([], { month: "short", day: "numeric" }) : month}</h2><div className="home-amount">{selectedDate ? dayChats.length : activity.monthCount}</div><p className="home-metric-label">Chats started{selectedDate ? " this day" : " this month"}</p><div className={`home-amount${github?.ok ? "" : " home-unavailable"}`}>{github?.ok ? github.merged : "—"}</div><p className="home-metric-label">PRs merged{github && !github.ok ? " · Unavailable" : ""}</p></section>
    </div>
    <HomeWorkSnapshot chats={all} projects={projects} onOpenThread={onOpenThread} onProject={setScope} />
    <section id="home-day-activity" className="home-day-activity" aria-label="Activity on selected date" hidden={!selectedDate}>
      {selectedDate && <>
        <div className="home-day-heading"><div><h2>Activity</h2><p>{selectedDate.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p></div><button type="button" aria-label="Clear selected activity date" onClick={() => { calendar.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus(); setSelectedDay(null); }}><X size={15} /></button></div>
        <p className="home-day-summary" role="status">{dayChats.length ? `Started ${dayChats.length} chat${dayChats.length === 1 ? "" : "s"}${dayGroups.size > 1 ? ` across ${dayGroups.size} groups` : ""}.` : "No chats were started on this date in the available history."}</p>
        <HomeGithubActivity input={JSON.parse(githubKey)} github={github} pullRequests={prEvents.map(({pr,action,at}) => ({ id: `${pr.url}-${action}`, kind: "prs", action, at, title: pr.title, repository: pr.repository, url: pr.url }))} onOpenLink={onOpenLink} />
        {[...dayGroups].map(([key, group]) => {
          const project = projects.find(project => project.id === key);
          return <div key={key} className="home-day-group" data-project-id={key}><div className="home-day-group-heading"><span className="home-activity-icon">{project ? <ProjectIcon icon={project.icon} color={project.color} size={14} /> : <MessageCircleMoreIcon size={14} />}</span><h3>{group[0].projectName ?? "Chat"}</h3><span>{group.length} chat{group.length === 1 ? "" : "s"}</span></div>
          {group.map(chat => <button key={chat.id} className="home-day-chat" title={chat.title} onClick={() => onOpenThread(chat.id)}><span>{chat.title}</span><time dateTime={new Date(epochMillis(chat.createdAt)!).toISOString()}>{new Date(epochMillis(chat.createdAt)!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>{running.has(chat.id) && <small>Working</small>}<ArrowUpRight size={13} /></button>)}
        </div>; })}
      </>}
    </section>
    <p className="home-data-note">Chat activity reflects creation dates in available local history. Account usage covers the whole account.</p>
  </div>;
}
