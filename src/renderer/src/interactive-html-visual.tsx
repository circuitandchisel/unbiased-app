import { useContext, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { VisualReadyContext } from "./visual-ready-context";
import { afterVisibleVisualPaint } from "./visible-visual-paint";

const INITIAL_HEIGHT = 440;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 8000;

function surfaceInk(color: string): string | null {
  const hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(color);
  if (!hex && !rgb) return null;
  if (rgb?.[4] && Number(rgb[4]) !== 1) return null;
  const channels = hex
    ? hex.slice(1).map((value) => parseInt(value, 16))
    : rgb!.slice(1, 4).map(Number);
  if (channels.some((value) => value > 255)) return null;
  const [red, green, blue] = channels.map((value) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722 > 0.179 ? "#000000" : "#ffffff";
}

export function InteractiveHtmlVisual({ source }: { source: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [height, setHeight] = useState(INITIAL_HEIGHT);
  const [surface, setSurface] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const onVisualReady = useContext(VisualReadyContext);

  useEffect(() => {
    if (!ready || !onVisualReady) return;
    return afterVisibleVisualPaint(document, onVisualReady, frameRef.current);
  }, [ready, onVisualReady]);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setFailure(null);
    setReady(false);
    setHeight(INITIAL_HEIGHT);
    setSurface(null);
    void window.unbiased.registerVisual(source).then((nextUrl) => {
      if (!active) return;
      if (nextUrl) setUrl(nextUrl);
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
    const viewport = frameRef.current?.closest<HTMLElement>(".app-generated-visual-viewport");
    const ink = surface && surfaceInk(surface);
    if (!viewport || !ink || !surface) return;
    viewport.style.setProperty("--visual-control-bg", surface);
    viewport.style.setProperty("--visual-control-fg", ink);
    return () => {
      viewport.style.removeProperty("--visual-control-bg");
      viewport.style.removeProperty("--visual-control-fg");
    };
  }, [surface]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== "null") return;
      if (event.data?.type === "unbiased-visual-ready") {
        setReady(true);
      } else if (event.data?.type === "unbiased-visual-error") {
        const kind = event.data.kind === "unhandled-rejection" ? "unhandled-rejection" : "runtime-error";
        const detail = typeof event.data.detail === "string" ? event.data.detail.slice(0, 300) : "";
        console.warn(`[visual] HTML ${kind}:`, detail);
        setFailure(kind);
      } else if (event.data?.type === "unbiased-visual-height") {
        const next = event.data.height;
        if (typeof next === "number" && Number.isFinite(next)) {
          setHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.ceil(next))));
        }
      } else if (event.data?.type === "unbiased-visual-surface") {
        const color = event.data.color;
        if (typeof color === "string" && /^(?:#[0-9a-f]{6}|rgba?\([\d.,\s%]+\))$/i.test(color)) {
          setSurface(color);
        }
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  const sendTheme = () => {
    const style = getComputedStyle(document.documentElement);
    frameRef.current?.contentWindow?.postMessage({
      type: "unbiased-visual-theme",
      colors: {
        bg: style.getPropertyValue("--bg").trim() || style.getPropertyValue("--panel").trim(),
        fg: style.getPropertyValue("--fg-msg").trim(),
        muted: style.getPropertyValue("--dim").trim(),
        accent: style.getPropertyValue("--accent").trim(),
      },
    }, "*");
  };

  const sendViewScale = () => {
    const viewport = frameRef.current?.closest<HTMLElement>(".app-generated-visual-viewport");
    const expanded = viewport?.matches(":popover-open");
    const requestedScale = Number(viewport?.style.getPropertyValue("--visual-zoom"));
    frameRef.current?.contentWindow?.postMessage({
      type: "unbiased-visual-view-scale",
      scale: expanded ? (requestedScale || (window.innerWidth > 900 ? 1.35 : 1)) : 1,
    }, "*");
  };

  useEffect(() => {
    if (!url) return;
    const observer = new MutationObserver(sendTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    return () => observer.disconnect();
  }, [url]);

  useEffect(() => {
    const viewport = frameRef.current?.closest(".app-generated-visual-viewport");
    if (!viewport) return;
    viewport.addEventListener("toggle", sendViewScale);
    viewport.addEventListener("visual-zoom-change", sendViewScale);
    window.addEventListener("resize", sendViewScale);
    return () => {
      viewport.removeEventListener("toggle", sendViewScale);
      viewport.removeEventListener("visual-zoom-change", sendViewScale);
      window.removeEventListener("resize", sendViewScale);
    };
  }, [url]);

  return (
    <div
      aria-label="Interactive visual"
      style={{
        width: "100%", minWidth: 0, margin: "16px 0 20px", overflow: "hidden", position: "relative",
        background: surface ?? "transparent",
      }}
    >
      {url && !failure ? (
        <iframe
          ref={frameRef}
          title="Interactive visual"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          src={url}
          onLoad={() => { sendTheme(); sendViewScale(); }}
          onError={() => setFailure("frame-load")}
          style={{ display: "block", width: "100%", height: ready ? height : 96, border: 0, background: surface ?? "transparent", visibility: ready ? "visible" : "hidden" }}
        />
      ) : null}
      {!ready && !failure && <div role="status" style={{ minHeight: 96, padding: 24, color: "var(--dim)", fontFamily: "var(--font-ui)", fontSize: 14, position: url ? "absolute" : "static", inset: url ? 0 : undefined }}>
        Preparing visual...
      </div>}
      {failure && <div role="alert" style={{ minHeight: 96, padding: 24, color: "var(--dim)", fontFamily: "var(--font-ui)", fontSize: 14 }}>
        <div>This visual couldn't load. The rest of the answer is still available.</div>
        <button type="button" onClick={() => setAttempt((value) => value + 1)} title="Reload visual" aria-label="Reload visual" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--panel-2)", color: "var(--fg-msg)", cursor: "pointer" }}>
          <RefreshCw size={14} /> Reload visual
        </button>
      </div>}
    </div>
  );
}
