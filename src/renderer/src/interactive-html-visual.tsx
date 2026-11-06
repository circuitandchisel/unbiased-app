import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { interactiveVisualSourceIssue } from "../../shared/interactive-visual";
import { VisualHtmlPreview } from "./visual-html-preview";

const INITIAL_HEIGHT = 440;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 1600;
const MAX_EXPANDED_HEIGHT = 100_000;
const measuredHeights = new Map<string, number>();
const MAX_CACHED_HEIGHTS = 32;

function rememberHeight(source: string, height: number): void {
  measuredHeights.delete(source);
  measuredHeights.set(source, height);
  if (measuredHeights.size > MAX_CACHED_HEIGHTS) measuredHeights.delete(measuredHeights.keys().next().value!);
}

function visualThemeSource(frame: HTMLElement): HTMLElement {
  for (let element = frame.parentElement; element; element = element.parentElement) {
    if (element.style.getPropertyValue("--bg")) return element;
  }
  return document.documentElement;
}

function colorScheme(background: string): "light" | "dark" {
  const channels = /^#([0-9a-f]{6})$/i.exec(background)?.[1];
  if (!channels) return "dark";
  const values = [0, 2, 4].map((offset) => {
    const value = parseInt(channels.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722 > 0.179 ? "light" : "dark";
}

export function InteractiveHtmlVisual({ source, previewSource, incomplete = false }: { source: string | null; previewSource?: string; incomplete?: boolean }) {
  const previewRef = useRef(previewSource ?? source ?? "");
  previewRef.current = previewSource ?? source ?? previewRef.current;
  const registeredSourceRef = useRef<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [height, setHeight] = useState(() => source ? measuredHeights.get(source) ?? INITIAL_HEIGHT : INITIAL_HEIGHT);
  const [expanded, setExpanded] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const sendExpanded = (value: boolean) => {
    frameRef.current?.contentWindow?.postMessage({ type: "unbiased-visual-expanded", expanded: value }, "*");
  };

  useEffect(() => {
    if (!url) return;
    const viewport = frameRef.current?.closest<HTMLElement>(".app-generated-visual-viewport");
    if (!viewport) return;
    const sync = (event: Event) => {
      const value = (event as ToggleEvent).newState === "open";
      setExpanded(value);
      sendExpanded(value);
    };
    viewport.addEventListener("toggle", sync);
    const initial = viewport.matches(":popover-open");
    setExpanded(initial);
    return () => viewport.removeEventListener("toggle", sync);
  }, [url]);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setFailure(null);
    setReady(false);
    setHeight(source ? measuredHeights.get(source) ?? INITIAL_HEIGHT : INITIAL_HEIGHT);
    registeredSourceRef.current = null;
    if (!source) return () => { active = false; };
    const issue = interactiveVisualSourceIssue(source);
    if (issue) { setFailure(issue); return () => { active = false; }; }
    void window.unbiased.registerVisual(source).then((nextUrl) => {
      if (!active) return;
      if (nextUrl) {
        registeredSourceRef.current = source;
        setUrl(nextUrl);
      }
      else setFailure("registration-rejected");
    }).catch(() => { if (active) setFailure("registration-failed"); });
    return () => { active = false; };
  }, [source, attempt]);

  useEffect(() => {
    if (!url || ready || failure) return;
    const timer = window.setTimeout(() => setFailure("ready-timeout"), 8000);
    return () => window.clearTimeout(timer);
  }, [url, ready, failure]);

  useEffect(() => {
    if (failure) console.warn("[visual] HTML visual failed:", failure);
  }, [failure]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== "null") return;
      if (event.data?.type === "unbiased-visual-ready") {
        if (event.data.hasContent === false) return;
        setReady(true);
        setFailure(previous => (previous === "empty-render" || previous === "ready-timeout") ? null : previous);
      } else if (event.data?.type === "unbiased-visual-error") {
        const kind = event.data.kind === "empty-render" ? "empty-render" : event.data.kind === "unhandled-rejection" ? "unhandled-rejection" : "runtime-error";
        const detail = typeof event.data.detail === "string" ? event.data.detail.slice(0, 300) : "";
        console.warn(`[visual] HTML ${kind}:`, detail);
        setFailure(previous => kind === "empty-render" && (previous === "runtime-error" || previous === "unhandled-rejection") ? previous : kind);
      } else if (event.data?.type === "unbiased-visual-height") {
        const next = event.data.height;
        if (typeof next === "number" && Number.isFinite(next)) {
          const measured = Math.max(MIN_HEIGHT, Math.min(MAX_EXPANDED_HEIGHT, Math.ceil(next)));
          if (registeredSourceRef.current) rememberHeight(registeredSourceRef.current, measured);
          setHeight(measured);
        }
      } else if (event.data?.type === "unbiased-visual-wheel") {
        const viewport = frameRef.current?.closest<HTMLElement>(".app-generated-visual-viewport:popover-open");
        const delta = event.data.deltaY;
        if (viewport && typeof delta === "number" && Number.isFinite(delta)) {
          const mode = event.data.deltaMode;
          const pixels = delta * (mode === 1 ? 16 : mode === 2 ? viewport.clientHeight : 1);
          viewport.scrollBy({ top: pixels, behavior: "instant" });
        }
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  const sendTheme = () => {
    if (!frameRef.current) return;
    const source = visualThemeSource(frameRef.current);
    const style = window.getComputedStyle(source);
    const color = (name: string) => style.getPropertyValue(name).trim() || source.style.getPropertyValue(name).trim();
    const bg = color("--panel") || color("--bg");
    frameRef.current?.contentWindow?.postMessage({
      type: "unbiased-visual-theme",
      colors: {
        bg,
        fg: color("--fg-msg"),
        muted: color("--dim"),
        accent: color("--accent"),
      },
      scheme: colorScheme(bg),
    }, "*");
  };

  useEffect(() => {
    if (!url) return;
    const source = frameRef.current ? visualThemeSource(frameRef.current) : document.documentElement;
    const observer = new MutationObserver(sendTheme);
    observer.observe(source, { attributes: true, attributeFilter: ["style"] });
    return () => observer.disconnect();
  }, [url]);

  const showPreview = Boolean(previewRef.current && !ready && !failure);
  const partialFailure = ready && (failure === "runtime-error" || failure === "unhandled-rejection");
  return (
    <div
      aria-label="Interactive visual"
      className="app-interactive-html-visual"
      style={{
        width: "100%", minWidth: 0, margin: "16px 0 20px", overflow: "hidden", position: "relative",
        minHeight: ready || failure ? undefined : Math.min(MAX_HEIGHT, height),
        border: "1px solid var(--border)", borderRadius: 28,
        background: "var(--panel)", boxShadow: "0 14px 36px rgba(0, 0, 0, 0.28)",
      }}
    >
      {showPreview && <VisualHtmlPreview source={previewRef.current} incomplete={incomplete} />}
      {url ? (
        <iframe
          ref={frameRef}
          title="Interactive visual"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          src={url}
          onLoad={() => {
            sendTheme();
            sendExpanded(Boolean(frameRef.current?.closest(".app-generated-visual-viewport:popover-open")));
          }}
          onError={() => setFailure("frame-load")}
          style={{ display: "block", width: "100%", height: ready ? (expanded ? height : Math.min(MAX_HEIGHT, height)) : 96, border: 0, background: "var(--panel)", visibility: ready ? "visible" : "hidden", position: ready ? "static" : "absolute", inset: ready ? undefined : 0 }}
        />
      ) : null}
      {!ready && !failure && !showPreview && <div role="status" style={{ minHeight: 96, padding: 24, color: "var(--dim)", fontFamily: "var(--font-ui)", fontSize: 14, position: url ? "absolute" : "static", inset: url ? 0 : undefined }}>
        Preparing visual...
      </div>}
      {failure && <div role="alert" style={{ minHeight: 96, padding: 24, color: "var(--dim)", fontFamily: "var(--font-ui)", fontSize: 14 }}>
        <div>{partialFailure ? "The visual is available, but some interactions may not work." : failure.startsWith("The generated HTML") ? failure : failure === "empty-render" ? "The generated visual is empty." : "This visual couldn't load. The rest of the answer is still available."}</div>
        <div style={{ marginTop: 6, fontSize: 12 }}>Ask the assistant to fix this visual. Reloading runs the same generated code.</div>
        <button type="button" onClick={() => setAttempt((value) => value + 1)} title="Reload visual" aria-label="Reload visual" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--panel-2)", color: "var(--fg-msg)", cursor: "pointer" }}>
          <RefreshCw size={14} /> Reload visual
        </button>
      </div>}
    </div>
  );
}
