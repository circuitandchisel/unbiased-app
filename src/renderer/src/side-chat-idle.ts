export const SIDE_CHAT_IDLE_MS = 8 * 60 * 60 * 1000;

export class SideChatIdleTracker {
  private lastUsed = new Map<string, number>();
  private busy = new Set<string>();

  use(id: string, now = Date.now()): void {
    this.lastUsed.set(id, now);
  }

  setBusy(id: string, isBusy: boolean, now = Date.now()): void {
    if (!this.lastUsed.has(id)) return;
    if (isBusy) this.busy.add(id);
    else this.busy.delete(id);
    this.use(id, now);
  }

  close(id: string): void {
    this.lastUsed.delete(id);
    this.busy.delete(id);
  }

  expired(now = Date.now()): string[] {
    return [...this.lastUsed].filter(([id, lastUsed]) =>
      !this.busy.has(id) && now - lastUsed >= SIDE_CHAT_IDLE_MS,
    ).map(([id]) => id);
  }
}
