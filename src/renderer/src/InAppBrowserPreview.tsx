import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SideBrowserTab } from "../../shared/side-browser";

type Point = { x: number; y: number };

/** A page preview only; clicking focuses the existing native tab without navigation. */
export function InAppBrowserPreview({ tab, visible, capture, onOpen }: {
  tab: SideBrowserTab | null;
  visible: boolean;
  capture: (id: number) => Promise<string | null>;
  onOpen: (id: number) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<Point | null>(null);
  const [frame, setFrame] = useState<{ key: string; src: string } | null>(null);
  const drag = useRef<{ pointer: number; start: Point; origin: Point; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const active = visible && !!tab && tab.working && tab.controlled && !tab.help;
  const key = tab ? `${tab.root}:${tab.id}` : "";
  const clamp = (point: Point): Point => {
    const button = buttonRef.current, parent = button?.parentElement;
    if (!button || !parent) return point;
    return { x: Math.max(12, Math.min(point.x, parent.clientWidth - button.offsetWidth - 12)), y: Math.max(12, Math.min(point.y, parent.clientHeight - button.offsetHeight - 12)) };
  };
  useLayoutEffect(() => {
    if (!active) return;
    const button = buttonRef.current, parent = button?.parentElement;
    if (!button || !parent) return;
    const resize = () => setPosition(current => clamp(current ?? { x: parent.clientWidth - button.offsetWidth - 16, y: 16 }));
    resize();
    const observer = new ResizeObserver(resize); observer.observe(parent); observer.observe(button);
    return () => observer.disconnect();
  }, [active]);
  useEffect(() => {
    if (!active || !tab) return;
    let cancelled = false, capturing = false, timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (cancelled || capturing || document.visibilityState === "hidden") return;
      capturing = true;
      try {
        const src = await capture(tab.id);
        if (!cancelled && src) setFrame({ key, src });
      } catch { /* Closing or switching a tab can cancel a capture. */ }
      finally { capturing = false; }
      if (!cancelled) timer = setTimeout(() => void refresh(), 650);
    };
    const visibility = () => {
      if (timer) clearTimeout(timer);
      if (document.visibilityState !== "hidden") void refresh();
    };
    void refresh(); document.addEventListener("visibilitychange", visibility);
    return () => { cancelled = true; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [active, key, capture]);
  if (!active || !tab) return null;
  const src = frame?.key === key ? frame.src : null;
  return <button
    ref={buttonRef}
    type="button"
    data-browser-preview={tab.id}
    aria-label="Open active in-app browser"
    title="Open active in-app browser · drag to move"
    onClick={event => {
      if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return; }
      onOpen(tab.id);
    }}
    onPointerDown={event => {
      if (event.button !== 0) return;
      const button = event.currentTarget;
      drag.current = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: { x: button.offsetLeft, y: button.offsetTop }, moved: false };
      suppressClick.current = false;
      button.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const current = drag.current;
      if (!current || current.pointer !== event.pointerId) return;
      const dx = event.clientX - current.start.x, dy = event.clientY - current.start.y;
      if (Math.hypot(dx, dy) > 4) current.moved = true;
      if (current.moved) setPosition(clamp({ x: current.origin.x + dx, y: current.origin.y + dy }));
    }}
    onPointerUp={event => {
      if (drag.current?.pointer !== event.pointerId) return;
      suppressClick.current = drag.current.moved; drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={() => { drag.current = null; suppressClick.current = true; }}
    onKeyDown={event => {
      if (!position || event.metaKey || event.ctrlKey || event.altKey) return;
      const steps: Record<string, Point> = { ArrowLeft: { x: -12, y: 0 }, ArrowRight: { x: 12, y: 0 }, ArrowUp: { x: 0, y: -12 }, ArrowDown: { x: 0, y: 12 } };
      const step = steps[event.key];
      if (step) { event.preventDefault(); event.stopPropagation(); setPosition(clamp({ x: position.x + step.x, y: position.y + step.y })); }
    }}
    style={{ position: "absolute", left: position?.x, top: position?.y ?? 16, right: position ? undefined : 16, zIndex: 15, width: 260, maxWidth: "calc(100% - 24px)", padding: 0, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--panel)", color: "var(--fg)", boxShadow: "0 8px 32px #0005, 0 2px 6px #0003", textAlign: "left", font: "inherit", cursor: "grab", touchAction: "none", userSelect: "none" }}
  >
    <span style={{ display: "block", width: "100%", aspectRatio: "16 / 10", background: "var(--panel-2)", pointerEvents: "none" }}>
      {src ? <img src={src} alt="" draggable={false} style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--dim)", fontSize: 12 }}>Preparing preview…</span>}
    </span>
    <span style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", minWidth: 0, pointerEvents: "none" }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
      <span style={{ minWidth: 0, flex: 1 }}><span style={{ display: "block", fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tab.title || "In-app browser"}</span><span style={{ display: "block", color: "var(--dim)", fontSize: 11, marginTop: 2 }}>In-app browser · Working</span></span>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="M6 3H3v10h10v-3M9 2h5v5M14 2 7 9" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  </button>;
}
