import { Component, Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ImageGenerationHandle } from "img-fx";

// Keep Three and the shader out of startup and chats without image generation.
const ImageGeneration = lazy(() => import("img-fx").then(module => ({ default: module.ImageGeneration })));

class EffectBoundary extends Component<{ children: ReactNode; onUnavailable: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onUnavailable(); }
  render() { return this.state.failed ? null : this.props.children; }
}

function Shader({ url, onRevealed }: { url: string | null; onRevealed: () => void }) {
  const effect = useRef<ImageGenerationHandle>(null);
  const images = useMemo(() => url ? [url] : [], [url]);
  useEffect(() => {
    // img-fx updates its image pool before this parent effect runs.
    if (url) effect.current?.triggerReveal({ hold: "manual" });
  }, [url]);
  return <ImageGeneration ref={effect} preset="pixels-organic" images={images} autoReveal={false}
    onCycle={event => { if (event.phase === "visible") onRevealed(); }}
    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
    <div style={{ width: "100%", height: "100%", borderRadius: 12 }} />
  </ImageGeneration>;
}

/** One stable-size preview: pending churn, actual result reveal, then static pixels. */
export function ImageGenerationPreview({ path, running = false, reveal = false, onRevealed, onOpen }: {
  path?: string;
  running?: boolean;
  reveal?: boolean;
  onRevealed?: () => void;
  onOpen?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<{ path: string; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [effectUnavailable, setEffectUnavailable] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [active, setActive] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const url = image && image.path === path ? image.url : null;
  const finish = () => { setRevealed(true); onRevealed?.(); };

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setRevealed(false);
    if (path) void window.unbiased.readImage(path).then(result => {
      if (cancelled) return;
      if (result.dataUrl) setImage({ path, url: result.dataUrl });
      else setFailed(true);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [path]);

  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(motion.matches);
    motion.addEventListener("change", update);
    return () => motion.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    let intersecting = false;
    const update = () => setActive(intersecting && document.visibilityState !== "hidden");
    const observer = new IntersectionObserver(entries => { intersecting = entries[0]?.isIntersecting ?? false; update(); });
    const element = host.current;
    const contextLost = () => setEffectUnavailable(true);
    if (element) { observer.observe(element); element.addEventListener("webglcontextlost", contextLost, true); }
    document.addEventListener("visibilitychange", update);
    return () => { observer.disconnect(); element?.removeEventListener("webglcontextlost", contextLost, true); document.removeEventListener("visibilitychange", update); };
  }, []);

  const animate = !failed && !reducedMotion && !effectUnavailable && !revealed && (running || reveal);
  useEffect(() => {
    if (!url || !reveal || revealed) return;
    if (reducedMotion || effectUnavailable) { finish(); return; }
    // An interrupted WebGL context or failed shader reveal must never hide a result.
    if (!active) return;
    const timeout = window.setTimeout(finish, 8000);
    return () => window.clearTimeout(timeout);
  }, [url, reveal, revealed, reducedMotion, effectUnavailable, active]);

  return <div ref={host} data-image-generation-path={path} data-image-generation-reveal={revealed ? "complete" : reveal ? "pending" : "static"} data-image-generation-preview={running ? "running" : failed ? "failed" : url ? "ready" : "loading"}
    style={{ width: "min(320px, 100%)", margin: "10px 0", flexShrink: 0 }}>
    <div style={{ position: "relative", aspectRatio: "1", borderRadius: 12, overflow: "hidden", background: "var(--panel-2)", border: "1px solid var(--border)" }}>
      {url && !failed && <button type="button" aria-label="Open generated image" onClick={onOpen} disabled={!onOpen}
        style={{ position: "absolute", inset: 0, padding: 0, border: 0, background: "transparent", cursor: onOpen ? "zoom-in" : "default" }}>
        <img src={url} alt="Generated image" onError={() => setFailed(true)} style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }} />
      </button>}
      {(!url || failed) && <div role="status" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--dim)", fontSize: 13 }}>
        {failed ? "This image couldn’t load." : running ? "Creating image…" : "Loading image…"}
      </div>}
      {animate && active && <div aria-hidden="true">
        <EffectBoundary onUnavailable={() => setEffectUnavailable(true)}><Suspense fallback={null}>
          <Shader url={url} onRevealed={finish} />
        </Suspense></EffectBoundary>
      </div>}
    </div>
  </div>;
}
