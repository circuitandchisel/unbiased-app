import { MessageCircleMoreIcon } from "./message-circle-more-icon";
import { useEffect, useRef, useState } from "react";
import type { HomeRecapResult } from "../../shared/home-recap";
import { ArrowUpRight, Sparkles, Flame } from "lucide-react";
import { ProjectIcon } from "./project-icon";
import { homeWorkSnapshot, type HomeChat, type HomeProject } from "./home-dashboard-data";

export function HomeWorkSnapshot({ chats, projects, onOpenThread, onProject }: {
  chats: HomeChat[]; projects: HomeProject[]; onOpenThread: (id: string) => void; onProject: (id: string) => void;
}) {
  const snapshot = homeWorkSnapshot(chats);
  const [recap, setRecap] = useState<HomeRecapResult | null>(null);
  const [streamText, setStreamText] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const sources = JSON.stringify({ chats: snapshot.recent.slice(0, 20).map(chat => ({ id: chat.id, title: chat.title.slice(0, 200), project: chat.projectName?.slice(0, 80) ?? null })) });
  const previousSources = useRef(sources);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ids = new Set(JSON.parse(sources).chats.map((chat: { id: string }) => chat.id));
    if (typeof window.unbiased.onConversationMetadata !== "function") return;
    const unsubscribe = window.unbiased.onConversationMetadata(({ threadId }) => {
      if (!ids.has(threadId)) return;
      clearTimeout(timer); timer = setTimeout(() => setRetry(value => value + 1), 750);
    });
    return () => { unsubscribe(); clearTimeout(timer); };
  }, [sources]);
  useEffect(() => {
    let cancelled = false;
    const requestId = crypto.randomUUID();
    setStreamText(null);
    const unsubscribe = window.unbiased.onHomeRecapProgress?.(event => {
      if (!cancelled && event.requestId === requestId) setStreamText(event.text);
    });
    const changed = previousSources.current !== sources;
    previousSources.current = sources;
    setRecap(current => changed || !current?.ok ? null : current);
    if (JSON.parse(sources).chats.length) void Promise.resolve().then(() => window.unbiased.homeRecap(JSON.parse(sources), requestId)).then(result => {
      if (!cancelled) { setStreamText(null); setRecap(current => result.ok || !current?.ok ? result : current); }
    }).catch(() => { if (!cancelled) { setStreamText(null); setRecap(current => current?.ok ? current : { ok: false, error: "Your recap couldn’t load." }); } });
    return () => { cancelled = true; unsubscribe?.(); };
  }, [sources, retry]);
  return <section className="home-card home-work-snapshot" aria-label="About you lately">
    <h2><Sparkles size={14} />About you lately<span>Last 14 days</span></h2>
    {snapshot.recent.length ? <>
      {streamText !== null ? <p className="home-work-lead" aria-busy="true">{streamText}</p> : recap?.ok ? <p className="home-work-lead">{recap.text}</p> : <p className="home-work-lead" role="status">{recap ? recap.error : "Your recent-work recap will appear here as you chat."}{recap && !recap.pending && <button className="home-recap-retry" onClick={() => setRetry(value => value + 1)}>Try again</button>}</p>}

      <div className="home-work-body"><div className="home-work-topics"><p className="home-work-label">Recent threads</p>{snapshot.recent.slice(0, 3).map(chat => <button key={chat.id} onClick={() => onOpenThread(chat.id)} title={chat.title}><MessageCircleMoreIcon size={12} /><span>{chat.title}</span><ArrowUpRight size={12} /></button>)}</div>
        <div className="home-work-highlight"><span className="home-work-label">A little momentum</span><div><Flame size={16} /><strong>{snapshot.longestStreak > 1 ? `${snapshot.longestStreak}-day streak` : `${snapshot.started} new chat${snapshot.started === 1 ? "" : "s"}`}</strong></div><p>{snapshot.longestStreak > 1 ? "Your longest run of consecutive chat-start days in the last two weeks." : "Fresh starts in the last two weeks. Keep following your curiosity."}</p></div>
      </div>
      {snapshot.projects.length > 0 && <div className="home-work-projects">{snapshot.projects.slice(0, 4).map(item => { const project = projects.find(project => project.id === item.id); return <button key={item.id} onClick={() => onProject(item.id)}><ProjectIcon icon={project?.icon} color={project?.color} size={12} /><span>{item.name}</span><small>{item.count}</small></button>; })}</div>}
      <p className="home-work-source">AI-written from conversation context, decisions, and recent progress. {recap?.ok && <>Updated {new Date(recap.generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}{recap.stale ? " · Earlier snapshot" : ""}.</>}</p>
    </> : <div className="home-work-empty"><p>A picture of your work, one chat at a time.</p><span>Your recent projects, conversations, and a small activity highlight will appear here as you work.</span></div>}
  </section>;
}
