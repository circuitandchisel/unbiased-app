type BrowserLinkAction = { kind: "focus"; id: number } | { kind: "create" | "external" | "ignore" };

/** Compare complete destinations: queries and anchors can identify different content. */
function webUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch { return null; }
}

export function browserLinkAction(
  url: string,
  tabIds: readonly number[],
  states: Readonly<Record<number, { url: string }>>,
  pendingUrls: ReadonlyMap<number, string>,
  limit: number,
): BrowserLinkAction {
  const target = webUrl(url);
  if (!target) return { kind: "ignore" };
  // Include requested URLs before the native browser reports its first navigation.
  const id = tabIds.find(id => webUrl(pendingUrls.get(id) ?? states[id]?.url ?? "") === target);
  if (id !== undefined) return { kind: "focus", id };
  return { kind: tabIds.length >= limit ? "external" : "create" };
}
