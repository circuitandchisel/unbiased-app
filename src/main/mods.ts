import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import { join } from "node:path";

export const MODS_PROTOCOL_VERSION = 1;
export const MODS_TOOL = {
  type: "function",
  name: "mods_session_stats",
  description: "Read the number of turns and dynamic tool calls observed in this chat by the first-party Mods sidecar. No message contents are recorded. Only use when the user asks about Mods or chat activity.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
};

export function modsEntryPath(isPackaged: boolean, resourcesPath: string, appPath: string): string {
  return isPackaged ? join(resourcesPath, "mods", "entry.cjs") : join(appPath, "resources", "mods", "entry.cjs");
}

export function parseEnabledMods(raw: unknown): Set<string> {
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 200));
}

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };
export type ModEventKind = "turn_started" | "turn_completed" | "tool_called";
export type ModStats = { turnsStarted: number; turnsCompleted: number; toolsCalled: number };

export class ModsClient {
  private proc: ChildProcess | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private ready = false;

  constructor(private entryPath: string) {}

  get isReady(): boolean { return this.ready; }

  async start(): Promise<void> {
    if (!existsSync(this.entryPath)) throw new Error("Mods sidecar bundle missing");
    const proc = spawn(process.execPath, [this.entryPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ELECTRON_RUN_AS_NODE: "1",
        ...(process.env.HOME ? { HOME: process.env.HOME } : {}),
        ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
        ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}),
      },
    });
    this.proc = proc;
    createInterface({ input: proc.stdout! }).on("line", (line) => {
      if (this.proc !== proc || line.length > 8192) return;
      let msg: { id?: number; result?: unknown; error?: { message?: string } };
      try { msg = JSON.parse(line); } catch { return; }
      if (typeof msg.id !== "number") return;
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(msg.id);
      if (msg.error) pending.reject(new Error(msg.error.message ?? "Mods sidecar error"));
      else pending.resolve(msg.result);
    });
    proc.stderr?.on("data", (data) => console.warn("[mods]", String(data).slice(0, 500)));
    proc.on("error", (error) => this.disconnect(proc, error));
    proc.on("exit", () => this.disconnect(proc, new Error("Mods sidecar exited")));
    try {
      const response = await this.request("mods/initialize", { protocolVersion: MODS_PROTOCOL_VERSION });
      const info = response as { protocolVersion?: number; tools?: string[] };
      if (info?.protocolVersion !== MODS_PROTOCOL_VERSION || !info.tools?.includes(MODS_TOOL.name))
        throw new Error("Mods sidecar handshake mismatch");
      this.ready = true;
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  private disconnect(proc: ChildProcess, error: Error): void {
    if (this.proc !== proc) return;
    this.proc = null;
    this.ready = false;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const proc = this.proc;
    if (!proc?.stdin?.writable) return Promise.reject(new Error("Mods sidecar unavailable"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Mods sidecar timed out"));
      }, 2000);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer });
      try { proc.stdin!.write(JSON.stringify({ id, method, params }) + "\n"); }
      catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  observe(threadId: string, kind: ModEventKind): void {
    const proc = this.proc;
    if (!this.ready || !proc?.stdin?.writable || proc.stdin.writableLength > 64_000) return;
    try { proc.stdin.write(JSON.stringify({ method: "mods/event", params: { threadId, kind } }) + "\n"); }
    catch { /* optional sidecar cannot break a turn */ }
  }

  async sessionStats(threadId: string): Promise<ModStats> {
    if (!this.ready) throw new Error("Mods sidecar unavailable");
    const result = await this.request("mods/tool/call", { threadId, tool: MODS_TOOL.name }) as ModStats;
    if (![result?.turnsStarted, result?.turnsCompleted, result?.toolsCalled].every(Number.isSafeInteger))
      throw new Error("Invalid Mods sidecar response");
    return result;
  }

  stop(): void {
    const proc = this.proc;
    if (!proc) return;
    this.disconnect(proc, new Error("Mods sidecar stopped"));
    proc.kill();
  }
}
