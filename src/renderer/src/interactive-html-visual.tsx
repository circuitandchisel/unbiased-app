import { useEffect, useRef, useState } from "react";

const INITIAL_HEIGHT = 440;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 1600;

export function InteractiveHtmlVisual({ source }: { source: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [height, setHeight] = useState(INITIAL_HEIGHT);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setFailed(false);
    setHeight(INITIAL_HEIGHT);
    void window.unbiased.registerVisual(source).then((nextUrl) => {
      if (!active) return;
      if (nextUrl) setUrl(nextUrl);
      else setFailed(true);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [source]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== "null" ||
          event.data?.type !== "unbiased-visual-height") return;
      const next = event.data.height;
      if (typeof next === "number" && Number.isFinite(next)) {
        setHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.ceil(next))));
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
        width: "100%", minWidth: 0, margin: "16px 0 20px", overflow: "hidden",
        border: "1px solid var(--border)", borderRadius: 28,
        background: "var(--panel)", boxShadow: "0 14px 36px rgba(0, 0, 0, 0.28)",
      }}
    >
      {url ? (
        <iframe
          ref={frameRef}
          title="Interactive visual"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          src={url}
          onLoad={sendTheme}
          style={{ display: "block", width: "100%", height, border: 0, background: "var(--panel)" }}
        />
      ) : (
        <div role="status" style={{ minHeight: 96, padding: 24, color: "var(--dim)", fontFamily: "var(--font-ui)", fontSize: 14 }}>
          {failed ? "Could not display this visual." : "Preparing visual..."}
        </div>
      )}
    </div>
  );
}
