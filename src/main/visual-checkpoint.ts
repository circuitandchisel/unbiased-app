export type VisualCheckpoint = { turnId: string; source: string; version: number };

export function nextVisualCheckpoint(
  current: VisualCheckpoint | undefined,
  turnId: string,
  source: string,
): VisualCheckpoint | null {
  if (current?.turnId === turnId && current.source === source) return null;
  return {
    turnId,
    source,
    version: current?.turnId === turnId ? current.version + 1 : 1,
  };
}
