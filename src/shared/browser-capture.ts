export type BrowserCapture = { name: string; path: string };

/** Captures are kept outside collapsed work and deduplicated by their saved path. */
export function collectBrowserCaptures(entries: readonly unknown[]): BrowserCapture[] {
  const captures = new Map<string, BrowserCapture>();
  const visit = (entry: unknown) => {
    if (!entry || typeof entry !== "object") return;
    const value = entry as { screenshots?: BrowserCapture[]; entries?: unknown[] };
    for (const capture of value.screenshots ?? []) if (capture?.path && capture.name) captures.set(capture.path, capture);
    if (Array.isArray(value.entries)) value.entries.forEach(visit);
  };
  entries.forEach(visit);
  return [...captures.values()];
}
