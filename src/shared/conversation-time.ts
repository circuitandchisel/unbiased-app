type TimedEntry = { kind: string; at?: number };
type TranscriptEntry<T> = TimedEntry & { text?: string; entries?: T[] };

export function epochMillis(value: unknown): number | null {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value >= 946684800000) return value;
  if (value >= 946684800) return value * 1000;
  return null;
}

function localDay(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function dayMarkerIndices(entries: TimedEntry[]): Set<number> {
  const indices = new Set<number>();
  let previousDay: string | null = null;
  entries.forEach((entry, index) => {
    if (entry.kind !== "user" || entry.at === undefined || !Number.isFinite(entry.at)) return;
    const day = localDay(entry.at);
    if (day !== previousDay) indices.add(index);
    previousDay = day;
  });
  return indices;
}

/** Preserve cached UI-only rows while filling timestamps from engine history. */
export function hydrateTranscriptTimes<T extends TranscriptEntry<T>>(entries: T[], history: T[]): T[] {
  const source: T[] = [];
  const flatten = (items: T[]): void => {
    for (const entry of items) {
      if (entry.kind === "work" && entry.entries) flatten(entry.entries);
      else if (entry.kind === "user" || entry.kind === "assistant") source.push(entry);
    }
  };
  flatten(history);

  let cursor = 0;
  const hydrate = (items: T[]): T[] => items.map((entry) => {
    if (entry.kind === "work" && entry.entries) {
      return { ...entry, entries: hydrate(entry.entries) };
    }
    if (entry.kind !== "user" && entry.kind !== "assistant") return entry;
    const found = source.findIndex((candidate, index) =>
      index >= cursor && candidate.kind === entry.kind && candidate.text === entry.text,
    );
    if (found < 0) return entry;
    cursor = found + 1;
    const at = source[found].at;
    return entry.at === undefined && at !== undefined ? { ...entry, at } : entry;
  });
  return hydrate(entries);
}

export function formatConversationTime(at: number, now = Date.now()): string {
  const date = new Date(at);
  const today = new Date(now);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
  if (localDay(at) === localDay(now)) return time;

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (localDay(at) === localDay(yesterday.getTime())) return `Yesterday ${time}`;

  const weekStart = new Date(today);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  if (at >= weekStart.getTime() && at < now) {
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date);
    return `${weekday} ${time}`;
  }

  const dateText = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  }).format(date);
  return `${dateText}, ${time}`;
}

export function formatConversationDayMarker(at: number, now = Date.now()): string {
  const label = formatConversationTime(at, now);
  return localDay(at) === localDay(now) ? `Today, ${label}` : label;
}
