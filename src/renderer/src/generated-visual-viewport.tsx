import { useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minimize2, Minus, Plus } from "lucide-react";

const ZOOM_LEVELS = [0.75, 1, 1.15, 1.35, 1.6, 2];

export function GeneratedVisualViewport({ children, streaming }: { children: ReactNode; streaming: boolean }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const scrollPositionRef = useRef<{ element: HTMLElement; top: number } | null>(null);
  const restoreFrameRef = useRef<number | null>(null);
  const wasExpanded = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null);

  const changeZoom = (direction: -1 | 1) => {
    const current = zoom ?? (window.innerWidth > 900 ? 1.35 : 1);
    const index = ZOOM_LEVELS.indexOf(current);
    const next = ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, index + direction))];
    if (next === current) return;
    viewportRef.current?.style.setProperty("--visual-zoom", String(next));
    setZoom(next);
    viewportRef.current?.dispatchEvent(new window.Event("visual-zoom-change"));
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const sync = (event: Event) => {
      const active = (event as ToggleEvent).newState === "open";
      setExpanded(active);
      if (wasExpanded.current && !active) {
        viewport.removeAttribute("popover");
        buttonRef.current?.focus({ preventScroll: true });
        const saved = scrollPositionRef.current;
        if (saved) {
          saved.element.scrollTop = saved.top;
          restoreFrameRef.current = window.requestAnimationFrame(() => {
            saved.element.scrollTop = saved.top;
            restoreFrameRef.current = null;
            scrollPositionRef.current = null;
          });
        }
      }
      wasExpanded.current = active;
    };
    viewport.addEventListener("toggle", sync);
    return () => {
      viewport.removeEventListener("toggle", sync);
      if (restoreFrameRef.current !== null) window.cancelAnimationFrame(restoreFrameRef.current);
    };
  }, []);

  const toggleExpanded = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    try {
      if (expanded) viewport.hidePopover();
      else {
        if (restoreFrameRef.current !== null) window.cancelAnimationFrame(restoreFrameRef.current);
        const scrollElement = viewport.closest<HTMLElement>("[data-transcript-scroll]");
        scrollPositionRef.current = scrollElement ? { element: scrollElement, top: scrollElement.scrollTop } : null;
        if (zoom === null) {
          const initialZoom = window.innerWidth > 900 ? 1.35 : 1;
          viewport.style.setProperty("--visual-zoom", String(initialZoom));
          setZoom(initialZoom);
        }
        viewport.setAttribute("popover", "auto");
        viewport.showPopover();
      }
    } catch (error) {
      viewport.removeAttribute("popover");
      console.warn("[visual] Could not change expanded state:", error);
    }
  };

  return (
    <div ref={viewportRef} className="app-generated-visual-viewport">
      {!streaming && (
        <div className="app-generated-visual-viewport__toolbar">
          {expanded && <>
            <button type="button" aria-label="Zoom out" title="Zoom out" disabled={zoom === ZOOM_LEVELS[0]}
              onClick={(event) => { event.stopPropagation(); changeZoom(-1); }}>
              <Minus size={17} aria-hidden="true" />
            </button>
            <output aria-label="Zoom level">{Math.round((zoom ?? 1) * 100)}%</output>
            <button type="button" aria-label="Zoom in" title="Zoom in" disabled={zoom === ZOOM_LEVELS.at(-1)}
              onClick={(event) => { event.stopPropagation(); changeZoom(1); }}>
              <Plus size={17} aria-hidden="true" />
            </button>
          </>}
          <button
            ref={buttonRef}
            type="button"
            className="app-generated-visual-viewport__toggle"
            aria-label={expanded ? "Close expanded visual" : "Expand visual"}
            title={expanded ? "Close expanded visual" : "Expand visual"}
            onClick={(event) => { event.stopPropagation(); toggleExpanded(); }}
          >
            {expanded ? <Minimize2 size={17} aria-hidden="true" /> : <Maximize2 size={17} aria-hidden="true" />}
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
