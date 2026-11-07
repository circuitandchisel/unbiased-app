import { useEffect, useRef, useState, type CSSProperties } from "react";
import { GeneratedVisualViewport } from "./generated-visual-viewport";

export type ImageLightboxSource = {
  name: string;
  path: string;
  returnFocus?: HTMLElement | null;
  scrollPosition?: { element: HTMLElement; top: number } | null;
};

/** Reuse Visualize's top-layer viewer and zoom controls, independent of transcript folds. */
export function ImageLightbox({ image, onClose }: { image: ImageLightboxSource; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [ratio, setRatio] = useState(1);
  const [fitWidth, setFitWidth] = useState(1);
  const canvas = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(image.returnFocus ?? document.activeElement as HTMLElement | null);
  useEffect(() => {
    let cancelled = false;
    void window.unbiased.readImage(image.path).then(result => {
      if (cancelled) return;
      if (result.dataUrl) setUrl(result.dataUrl);
      else setError(true);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [image.path]);
  useEffect(() => () => {
    // Removing a top-layer popover also updates browser focus. Restore the
    // attachment button after that removal rather than racing the native step.
    const element = returnFocus.current;
    const saved = image.scrollPosition;
    const restoreScroll = () => { if (saved?.element.isConnected) saved.element.scrollTop = saved.top; };
    requestAnimationFrame(() => {
      restoreScroll();
      // Virtualization or a completed Work fold can replace the original button.
      const replacement = Array.from(document.querySelectorAll<HTMLElement>("[data-image-generation-path]"))
        .find(node => node.dataset.imageGenerationPath === image.path && node.getClientRects().length)
        ?.querySelector<HTMLButtonElement>("button");
      const target = replacement ?? (element?.isConnected && element.getClientRects().length ? element : null);
      target?.focus({ preventScroll: true });
      requestAnimationFrame(restoreScroll);
    });
  }, []);
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", dismiss, true);
    return () => document.removeEventListener("keydown", dismiss, true);
  }, [onClose]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const update = () => setFitWidth(Math.max(1, Math.floor(Math.min(element.clientWidth - 2, (element.clientHeight - 2) * ratio))));
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, [ratio]);

  return <GeneratedVisualViewport initiallyExpanded onClose={onClose} className="app-image-lightbox" label="Image preview">
    <div ref={canvas} className="app-image-lightbox__canvas">
      <div className="app-image-lightbox__content">
        {url && !error ? <img src={url} alt={image.name} onLoad={event => setRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)}
          onError={() => setError(true)} style={{ "--image-fit-width": `${fitWidth}px` } as CSSProperties} />
          : <div role="status">{error ? "This image couldn’t load." : "Loading image…"}</div>}
      </div>
    </div>
  </GeneratedVisualViewport>;
}
