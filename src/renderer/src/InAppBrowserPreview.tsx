import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SideBrowserTab } from "../../shared/side-browser";

type Point = { x: number; y: number };
const STEP = 16;
const documentVisible = () => document.visibilityState !== "hidden";
const tabKey = (tab: SideBrowserTab) => `${tab.root}:${tab.id}`;

/** One movable stack; each card focuses its existing native tab without navigation. */
export function InAppBrowserPreview({ tabs, visible, capture, onOpen }: {
  tabs: SideBrowserTab[];
  visible: boolean;
  capture: (id: number) => Promise<string | null>;
  onOpen: (id: number) => void;
}) {
  const stackRef = useRef<HTMLDivElement>(null);
  const preferredPosition = useRef<Point | null>(null);
  const [position, setPosition] = useState<Point | null>(null);
  const [frames, setFrames] = useState<Record<string, string>>({});
  const [moreOpen, setMoreOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ pointer: number; element: HTMLElement; start: Point; origin: Point; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  // Keep hit targets steady while a pointer is dragging the stack.
  const heldOrder = useRef<string[]>([]);
  const available = visible ? tabs.filter(tab => tab.working && tab.controlled && !tab.help) : [];
  const rank = (tab: SideBrowserTab) => { const index = heldOrder.current.indexOf(tabKey(tab)); return index < 0 ? Number.MAX_SAFE_INTEGER : index; };
  const working = dragging ? [...available].sort((a, b) => rank(a) - rank(b)) : available;
  const cards = working.slice(0, 3), overflow = working.slice(3);
  const active = cards.length > 0;
  const key = cards.map(tabKey).join("|");
  const offset = Math.max(cards.length - 1, 0) * STEP;
  const clamp = (point: Point): Point => {
    const stack = stackRef.current, parent = stack?.parentElement;
    if (!stack || !parent) return point;
    return { x: Math.max(12, Math.min(point.x, parent.clientWidth - stack.offsetWidth - 12)), y: Math.max(12, Math.min(point.y, parent.clientHeight - stack.offsetHeight - 12)) };
  };
  useLayoutEffect(() => {
    if (!active) return;
    const stack = stackRef.current, parent = stack?.parentElement;
    if (!stack || !parent) return;
    const resize = () => {
      preferredPosition.current ??= { x: parent.clientWidth - stack.offsetWidth - 16, y: 16 };
      setPosition(clamp(preferredPosition.current));
    };
    resize();
    const observer = new ResizeObserver(resize); observer.observe(parent); observer.observe(stack);
    return () => observer.disconnect();
  }, [active]);
  useEffect(() => {
    if (!active) { drag.current = null; setDragging(false); }
    if (!active || overflow.length === 0) setMoreOpen(false);
  }, [active, overflow.length]);
  useEffect(() => {
    if (!moreOpen) return;
    const outside = (event: PointerEvent) => { if (!stackRef.current?.contains(event.target as Node)) setMoreOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [moreOpen]);
  useEffect(() => {
    if (!active) return;
    let cancelled = false, capturing = false, timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (cancelled || capturing || !documentVisible()) return;
      capturing = true;
      const updates: Record<string, string> = {};
      try {
        // Serialize the three small captures; hidden overflow tabs cost no frames.
        for (const tab of cards) {
          if (cancelled || !documentVisible()) break;
          try { const src = await capture(tab.id); if (src) updates[tabKey(tab)] = src; }
          catch { /* Closing or switching a tab can cancel a capture. */ }
        }
        if (!cancelled) setFrames(current => Object.fromEntries(cards.flatMap(tab => {
          const id = tabKey(tab), src = updates[id] ?? current[id];
          return src ? [[id, src]] : [];
        })));
      } finally { capturing = false; }
      if (!cancelled) timer = setTimeout(() => void refresh(), 650);
    };
    const visibility = () => {
      if (timer) clearTimeout(timer);
      if (documentVisible()) void refresh();
    };
    void refresh(); document.addEventListener("visibilitychange", visibility);
    return () => { cancelled = true; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [active, key, capture]);
  if (!active) return null;
  const open = (id: number) => { setMoreOpen(false); onOpen(id); };
  return <div
    ref={stackRef}
    data-browser-preview-stack
    role="group"
    aria-label="Background browser tabs"
    onPointerDown={event => {
      if (event.button !== 0 || (event.target as Element).closest("[data-preview-control]")) return;
      const element = (event.target as Element).closest<HTMLElement>("[data-browser-preview]");
      if (!element) return;
      const stack = event.currentTarget;
      drag.current = { pointer: event.pointerId, element, start: { x: event.clientX, y: event.clientY }, origin: { x: stack.offsetLeft, y: stack.offsetTop }, moved: false };
      heldOrder.current = working.map(tabKey);
      suppressClick.current = false; setDragging(true);
      element.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const current = drag.current;
      if (!current || current.pointer !== event.pointerId || !event.buttons) return;
      const dx = event.clientX - current.start.x, dy = event.clientY - current.start.y;
      if (Math.hypot(dx, dy) > 4) current.moved = true;
      if (current.moved) { const next = clamp({ x: current.origin.x + dx, y: current.origin.y + dy }); preferredPosition.current = next; setPosition(next); }
    }}
    onPointerUp={event => {
      const current = drag.current;
      if (!current || current.pointer !== event.pointerId) return;
      suppressClick.current = current.moved; drag.current = null; setDragging(false);
      if (current.element.hasPointerCapture(event.pointerId)) current.element.releasePointerCapture(event.pointerId);
    }}
    onLostPointerCapture={() => { drag.current = null; setDragging(false); }}
    onPointerCancel={() => { drag.current = null; suppressClick.current = true; setDragging(false); }}
    onKeyDown={event => {
      if (event.key === "Escape" && moreOpen) { event.preventDefault(); event.stopPropagation(); setMoreOpen(false); return; }
      if (!position || event.metaKey || event.ctrlKey || event.altKey || (event.target as Element).closest("[data-preview-control]")) return;
      const steps: Record<string, Point> = { ArrowLeft: { x: -12, y: 0 }, ArrowRight: { x: 12, y: 0 }, ArrowUp: { x: 0, y: -12 }, ArrowDown: { x: 0, y: 12 } };
      const step = steps[event.key];
      if (step) { event.preventDefault(); event.stopPropagation(); const next = clamp({ x: position.x + step.x, y: position.y + step.y }); preferredPosition.current = next; setPosition(next); }
    }}
    style={{ position: "absolute", left: position?.x, top: position?.y ?? 16, right: position ? undefined : 16, zIndex: 15, width: 260 + offset, maxWidth: "calc(100% - 24px)", aspectRatio: `${260 + offset} / ${260 / 1.6 + offset}`, cursor: dragging ? "grabbing" : "grab", touchAction: "none", userSelect: "none" }}
  >
    {cards.map((tab, index) => <button
      key={tabKey(tab)}
      inert={moreOpen}
      type="button"
      data-browser-preview={tab.id}
      data-preview-front={index === 0 ? "true" : undefined}
      aria-label={`Open ${tab.title || "page"} in in-app browser`}
      title={`${tab.title || "In-app browser"} · click to open, drag to move stack`}
      onClick={event => {
        if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return; }
        open(tab.id);
      }}
      style={{ position: "absolute", left: index * STEP, top: offset - index * STEP, zIndex: cards.length - index, width: `calc(100% - ${offset}px)`, aspectRatio: "16 / 10", boxSizing: "border-box", padding: 0, border: `1px solid ${index === 0 ? "#FF776470" : "#ffffff30"}`, borderRadius: 16, overflow: "hidden", isolation: "isolate", background: "var(--panel)", color: "#fff", boxShadow: "0 10px 32px #0007, 0 2px 8px #0005", textAlign: "left", font: "inherit", cursor: "inherit", touchAction: "none" }}
    >
      <span style={{ display: "block", width: "100%", height: "100%", background: "var(--panel-2)", pointerEvents: "none" }}>
        {frames[tabKey(tab)] ? <img src={frames[tabKey(tab)]} alt="" draggable={false} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} /> : <span style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--dim)", fontSize: 12 }}>Preparing preview…</span>}
      </span>
      {index > 0 && <span style={{ position: "absolute", inset: "0 0 auto", height: STEP, padding: "0 16px", background: "#000b", fontSize: 10, lineHeight: `${STEP}px`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", pointerEvents: "none" }}>{tab.title || "In-app browser"}</span>}
      <span aria-hidden="true" style={{ position: "absolute", inset: "28% 0 0", background: "linear-gradient(to bottom, transparent, #0009 55%, #000d)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", maskImage: "linear-gradient(to bottom, transparent, #000 55%)", pointerEvents: "none" }} />
      <span aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: "inherit", boxShadow: "inset 0 0 0 1px #ffffff12, inset 0 -12px 28px #0003", pointerEvents: "none" }} />
      <span style={{ position: "absolute", inset: "auto 0 0", display: "flex", alignItems: "center", gap: 8, padding: "12px", paddingRight: index === 0 && overflow.length ? 58 : 12, minWidth: 0, color: "#fff", textShadow: "0 1px 4px #000b", pointerEvents: "none" }}>
        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
        <span style={{ minWidth: 0, flex: 1 }}><span style={{ display: "block", fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tab.title || "In-app browser"}</span><span style={{ display: "block", color: "#ffffffbf", fontSize: 11, marginTop: 2 }}>In-app browser · Working</span></span>
        {!(index === 0 && overflow.length) && <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="M6 3H3v10h10v-3M9 2h5v5M14 2 7 9" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </span>
    </button>)}
    {overflow.length > 0 && <button data-preview-control type="button" aria-label={`Show ${overflow.length} more browser tabs`} aria-expanded={moreOpen} onClick={() => setMoreOpen(value => !value)} style={{ position: "absolute", right: offset + 10, bottom: 10, zIndex: 4, padding: "4px 7px", borderRadius: 8, border: "1px solid #ffffff40", color: "#fff", background: "#ffffff24", font: "inherit", fontSize: 11, cursor: "pointer" }}>+{overflow.length} tabs</button>}
    {moreOpen && <div data-preview-control role="group" aria-label="More background browser tabs" style={{ position: "absolute", inset: 0, zIndex: 5, padding: 10, boxSizing: "border-box", overflowY: "auto", borderRadius: 16, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--fg)", boxShadow: "0 8px 28px #0006", cursor: "default" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}><span style={{ fontSize: 12, fontWeight: 600 }}>More browser tabs</span><button type="button" aria-label="Close tab list" onClick={() => setMoreOpen(false)} style={{ border: 0, background: "transparent", color: "var(--dim)", fontSize: 18, cursor: "pointer" }}>×</button></div>
      {overflow.map(tab => <button key={tabKey(tab)} type="button" data-preview-overflow={tab.id} onClick={() => open(tab.id)} style={{ display: "block", width: "100%", padding: "10px 8px", border: 0, borderRadius: 8, background: "transparent", color: "inherit", textAlign: "left", font: "inherit", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}>{tab.title || "In-app browser"}</button>)}
    </div>}
  </div>;
}
