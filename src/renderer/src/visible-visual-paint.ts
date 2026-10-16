export function afterVisibleVisualPaint(doc: Document, onPaint: () => void, target?: Element | null): () => void {
  const win = doc.defaultView;
  if (!win) return () => {};

  let firstFrame: number | null = null;
  let secondFrame: number | null = null;
  let done = false;
  let onscreen = !target || !win.IntersectionObserver;
  const observer = target && win.IntersectionObserver
    ? new win.IntersectionObserver(([entry]) => {
      onscreen = Boolean(entry?.isIntersecting);
      schedule();
    })
    : null;

  const cancelPending = () => {
    if (firstFrame !== null) win.cancelAnimationFrame(firstFrame);
    if (secondFrame !== null) win.cancelAnimationFrame(secondFrame);
    firstFrame = null;
    secondFrame = null;
  };
  const schedule = () => {
    cancelPending();
    if (done || doc.visibilityState !== "visible" || !onscreen) return;
    firstFrame = win.requestAnimationFrame(() => {
      firstFrame = null;
      if (doc.visibilityState !== "visible" || !onscreen) return;
      secondFrame = win.requestAnimationFrame(() => {
        secondFrame = null;
        if (doc.visibilityState !== "visible" || !onscreen) return;
        done = true;
        doc.removeEventListener("visibilitychange", schedule);
        observer?.disconnect();
        onPaint();
      });
    });
  };

  // A ready visual can finish loading while its window is hidden or it is offscreen.
  doc.addEventListener("visibilitychange", schedule);
  if (target) observer?.observe(target);
  schedule();
  return () => {
    done = true;
    doc.removeEventListener("visibilitychange", schedule);
    observer?.disconnect();
    cancelPending();
  };
}
