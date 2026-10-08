import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

const INITIAL_HEIGHT = 440;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 1600;

export function InteractiveHtmlVisual({ source }: { source: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [height, setHeight] = useState(INITIAL_HEIGHT);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setFailure(null);
    setReady(false);
    setHeight(INITIAL_HEIGHT);
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
        bg: style.getPropertyValue("--panel").trim(),
        fg: style.getPropertyValue("--fg-msg").trim(),
        muted: style.getPropertyValue("--dim").trim(),
        accent: style.getPropertyValue("--accent").trim(),
      },
    }, "*");
  };

  useEffect(() => {
    if (!url) return;
    const observer = new MutationObserver(sendTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    return () => observer.disconnect();
  }, [url]);

  return (
    <div
      aria-label="Interactive visual"
      style={{
        width: "100%", minWidth: 0, margin: "16px 0 20px", overflow: "hidden", position: "relative",
        border: "1px solid var(--border)", borderRadius: 28,
        background: "var(--panel)", boxShadow: "0 14px 36px rgba(0, 0, 0, 0.28)",
      }}
    >
      {url && !failure ? (
        <iframe
          ref={frameRef}
          title="Interactive visual"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          src={url}
          onLoad={sendTheme}
          onError={() => setFailure("frame-load")}
          style={{ display: "block", width: "100%", height: ready ? height : 96, border: 0, background: "var(--panel)", visibility: ready ? "visible" : "hidden" }}
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
