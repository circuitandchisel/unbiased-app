export type VisualDraft = { turnId: string; source: string; version: number };

export function nextVisualDraft(current: VisualDraft | null, incoming: VisualDraft, activeTurnId: string | null): VisualDraft | null {
  if (!activeTurnId || incoming.turnId !== activeTurnId) return current;
  if (current?.turnId === activeTurnId && current.version >= incoming.version) return current;
  return incoming;
}
