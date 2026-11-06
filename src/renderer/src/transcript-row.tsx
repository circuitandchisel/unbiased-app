import { useCallback, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

type Edges = { before: number; after: number };

/** Retain edge measurements when Virtuoso unmounts an offscreen neighbor. */
export class TranscriptSpacing {
  private edges = new Map<number, Edges>();
  private listeners = new Map<number, Set<() => void>>();

  // Containment adds both margins; subtract their minimum to retain the old maximum.
  overlap(index: number): number {
    return Math.min(this.edges.get(index)?.before ?? 0, this.edges.get(index - 1)?.after ?? 0);
  }

  subscribe(index: number, listener: () => void): () => void {
    const listeners = this.listeners.get(index) ?? new Set();
    listeners.add(listener);
    this.listeners.set(index, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(index);
    };
  }

  measure(index: number, edges: Edges): void {
    const previous = this.edges.get(index);
    if (previous && Math.abs(previous.before - edges.before) < 0.1 && Math.abs(previous.after - edges.after) < 0.1) return;
    this.edges.set(index, edges);
    for (const listener of this.listeners.get(index) ?? []) listener();
    for (const listener of this.listeners.get(index + 1) ?? []) listener();
  }
}

/** Contain every margin for reliable row measurement, but count shared space once. */
export function TranscriptRow({ index, spacing, children }: { index: number; spacing: TranscriptSpacing; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const subscribe = useCallback((listener: () => void) => spacing.subscribe(index, listener), [spacing, index]);
  const overlap = useSyncExternalStore(subscribe, () => spacing.overlap(index), () => 0);
  const measure = useCallback(() => {
    if (!outer.current || !inner.current) return;
    if (!outer.current.getClientRects().length) return; // A hidden pane has no usable edge geometry.
    const row = outer.current.getBoundingClientRect();
    const content = inner.current.getBoundingClientRect();
    // Read the applied trim from the DOM so queued observers never use a stale
    // render's overlap. Adding it back recovers the untrimmed leading margin.
    const trim = -(parseFloat(getComputedStyle(inner.current).marginTop) || 0);
    spacing.measure(index, {
      before: Math.max(0, content.top - row.top + trim),
      after: Math.max(0, row.bottom - content.bottom),
    });
  }, [spacing, index]);

  // Also measure commits whose edge margins change without changing total height.
  useLayoutEffect(measure);
  useLayoutEffect(() => {
    let frame = 0;
    // Defer geometry changes out of ResizeObserver delivery. Otherwise trimming
    // a neighbor during a fold toggle can invalidate an ancestor's notification.
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    if (outer.current) observer.observe(outer.current);
    if (inner.current) observer.observe(inner.current);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [measure]);

  // Even temporary empty entries need a nonzero box for Virtuoso.
  return (
    <div ref={outer} style={{ display: "flow-root", minHeight: 1, maxWidth: 768, margin: "0 auto", padding: "0 24px" }}>
      <div ref={inner} style={{ marginTop: -overlap }}>{children}</div>
    </div>
  );
}
