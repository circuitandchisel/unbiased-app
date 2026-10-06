import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const MODS_PROTOCOL_VERSION = 2;
export type ModEventKind = "turn_started" | "turn_completed" | "tool_called";
export type ModTool = {
  type: "function";
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; additionalProperties: false };
};
export type ModCatalog = {
  protocolVersion: 2;
  plugins: { id: string; name: string; description: string; events: ModEventKind[]; tools: ModTool[] }[];
};

export function readModsCatalog(entryPath: string): ModCatalog {
  const raw: unknown = JSON.parse(readFileSync(join(dirname(entryPath), "manifest.json"), "utf8"));
  const value = raw as Partial<ModCatalog>;
  if (!value || value.protocolVersion !== MODS_PROTOCOL_VERSION || !Array.isArray(value.plugins) ||
      value.plugins.length === 0 || value.plugins.length > 8) throw new Error("Invalid Mods manifest");
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const plugin of value.plugins) {
    if (!plugin || typeof plugin.id !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(plugin.id) ||
        ids.has(plugin.id) || typeof plugin.name !== "string" || typeof plugin.description !== "string" ||
        !Array.isArray(plugin.events) || !Array.isArray(plugin.tools) || plugin.tools.length > 8 ||
        plugin.events.some((event) => !["turn_started", "turn_completed", "tool_called"].includes(event)))
      throw new Error("Invalid Mods plugin declaration");
    ids.add(plugin.id);
    for (const tool of plugin.tools) {
      if (!tool || tool.type !== "function" || typeof tool.name !== "string" ||
          !/^mods_[a-z0-9_]{1,64}$/.test(tool.name) || names.has(tool.name) ||
          typeof tool.description !== "string" || tool.description.length > 500 ||
          !tool.inputSchema || tool.inputSchema.type !== "object" ||
          !tool.inputSchema.properties || typeof tool.inputSchema.properties !== "object" ||
          Array.isArray(tool.inputSchema.properties) || tool.inputSchema.additionalProperties !== false)
        throw new Error("Invalid or duplicate Mods tool declaration");
      names.add(tool.name);
    }
  }
  return value as ModCatalog;
}

export function modsDynamicTools(catalog: ModCatalog): ModTool[] {
  return catalog.plugins.flatMap((plugin) => plugin.tools);
}

export function modsEntryPath(isPackaged: boolean, resourcesPath: string, appPath: string): string {
  return isPackaged ? join(resourcesPath, "mods", "entry.cjs") : join(appPath, "resources", "mods", "entry.cjs");
}

export function parseEnabledMods(raw: unknown): Set<string> {
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 200));
}

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };

export class ModsClient {
  private proc: ChildProcess | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private ready = false;

  constructor(private entryPath: string, private catalog: ModCatalog) {}

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
      const info = response as { protocolVersion?: number; plugins?: string[]; tools?: string[] };
      const expectedPlugins = this.catalog.plugins.map((plugin) => plugin.id);
      const expectedTools = modsDynamicTools(this.catalog).map((tool) => tool.name);
      if (info?.protocolVersion !== MODS_PROTOCOL_VERSION ||
          JSON.stringify(info.plugins) !== JSON.stringify(expectedPlugins) ||
          JSON.stringify(info.tools) !== JSON.stringify(expectedTools))
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

  async callTool(threadId: string, tool: string): Promise<string> {
    if (!this.ready) throw new Error("Mods sidecar unavailable");
    if (!modsDynamicTools(this.catalog).some((declaration) => declaration.name === tool))
      throw new Error("Unknown Mods tool");
    const result = await this.request("mods/tool/call", { threadId, tool }) as { text?: unknown };
    if (typeof result?.text !== "string" || result.text.length > 2000)
      throw new Error("Invalid Mods sidecar response");
    return result.text;
  }

  stop(): void {
    const proc = this.proc;
    if (!proc) return;
    this.disconnect(proc, new Error("Mods sidecar stopped"));
    proc.kill();
  }
}
