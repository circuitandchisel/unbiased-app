type CommandPhase = "started" | "completed";

export function appendCommandOutputDelta<T extends { itemId: string; status: string; output?: string }>(
  entry: T,
  itemId: string,
  delta: string,
): T {
  if (entry.itemId !== itemId || entry.status !== "inProgress" || !delta) return entry;
  return { ...entry, output: (entry.output ?? "") + delta };
}

export function commandStatusAfterEvent(
  current: string | undefined,
  reported: string | undefined,
  phase: CommandPhase,
  turnActive = true,
): string {
  if (phase === "completed") {
    if (reported && reported !== "inProgress") return reported;
    if (current && current !== "inProgress" && current !== "awaitingApproval" && current !== "unconfirmed") return current;
    return "completed";
  }
  if (current && current !== "inProgress") return current;
  if (!turnActive) return reported && reported !== "inProgress" ? reported : "unconfirmed";
  return reported ?? current ?? "inProgress";
}

type StatusEntry = { kind: string; status?: string; entries?: StatusEntry[] };

export function settleUnconfirmedSteps<T extends StatusEntry>(entries: T[]): T[] {
  return entries.map((entry) => {
    if (entry.kind === "command" && entry.status === "inProgress") {
      return { ...entry, status: "unconfirmed" };
    }
    if (entry.kind === "work" && entry.entries) {
      return { ...entry, entries: settleUnconfirmedSteps(entry.entries) };
    }
    return entry;
  }) as T[];
}

export function settleTurnSteps<T extends StatusEntry>(entries: T[], start: number | null): T[] {
  if (start === null || start < 0 || start >= entries.length) return entries;
  return [...entries.slice(0, start), ...settleUnconfirmedSteps(entries.slice(start))];
}
