import { isAccessMode, type AccessMode, type AccessModesSnapshot } from "../shared/access-mode";

/** A new-chat default is separate from the choices of existing conversations. */
export class ConversationAccess {
  defaultMode: AccessMode = "ask";
  private threads = new Map<string, AccessMode>();

  constructor(saved: unknown = null) {
    if (!saved || typeof saved !== "object") return;
    const state = saved as Partial<AccessModesSnapshot>;
    if (isAccessMode(state.defaultMode)) this.defaultMode = state.defaultMode;
    if (state.threads && typeof state.threads === "object") {
      for (const [id, mode] of Object.entries(state.threads)) if (isAccessMode(mode)) this.threads.set(id, mode);
    }
  }

  get(id: string): AccessMode {
    if (!this.threads.has(id)) this.threads.set(id, this.defaultMode);
    return this.threads.get(id)!;
  }

  set(mode: AccessMode, id?: string | null): void {
    if (id) this.threads.set(id, mode);
    else this.defaultMode = mode;
  }

  delete(id: string): void { this.threads.delete(id); }

  snapshot(): AccessModesSnapshot {
    return { defaultMode: this.defaultMode, threads: Object.fromEntries(this.threads) };
  }
}
