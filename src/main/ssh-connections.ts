import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { atomicJson, readJson } from "./atomic-store";
import { EngineClient } from "./engine";
import { parseSshPath, sshPath, SSH_PATH_ROOT, type SshConnection, type SshStatus, type SshEngineStatus } from "../shared/ssh";

const exec = promisify(execFile);
type State = { connections: SshConnection[]; threads: Record<string, string>; cursors: Record<string, number>; cachedThreads?: Record<string, Record<string, unknown>> };
export const quoteShell = (s: string): string => "'" + s.replace(/'/g, "'\\''") + "'";
export function validateSshConnection(raw: SshConnection): SshConnection {
  if (!raw || !/^[a-f0-9-]{36}$/.test(raw.id) || typeof raw.name !== "string" || !raw.name.trim() || raw.name.length > 100 ||
    typeof raw.host !== "string" || !/^(?:[\w.-]+@)?[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(raw.host) || raw.host.length > 255 ||
    (raw.port !== undefined && (!Number.isInteger(raw.port) || raw.port < 1 || raw.port > 65535)) ||
    (raw.identityFile !== undefined && (typeof raw.identityFile !== "string" || !raw.identityFile.startsWith("/") || /[\0\r\n]/.test(raw.identityFile)))) throw new Error("Invalid SSH connection");
  return { id: raw.id, name: raw.name.trim(), host: raw.host, ...(raw.port ? { port: raw.port } : {}), ...(raw.identityFile ? { identityFile: raw.identityFile } : {}) };
}
export function sshArgs(c: SshConnection, scp = false): string[] {
  validateSshConnection(c);
  return ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=15", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3",
    ...(c.port ? [scp ? "-P" : "-p", String(c.port)] : []), ...(c.identityFile ? ["-i", c.identityFile] : [])];
}

export class SshConnections extends EventEmitter {
  private state: State;
  private clients = new Map<string, EngineClient>();
  private statuses = new Map<string, SshStatus>();
  private connecting = new Map<string, Promise<SshStatus>>();
  private requestOwners = new Map<string, { connectionId: string; client: EngineClient; id: number | string }>();
  private saveTimer?: ReturnType<typeof setTimeout>;
  constructor(private file: string, private bundleDir: () => string, private appVersion: string, private sources: { helper: string; bootstrap: string }) {
    super();
    this.state = readJson(file, { connections: [], threads: {}, cursors: {} });
    this.state.connections.forEach(validateSshConnection);
    if (!this.state.threads || !this.state.cursors) throw new Error("Invalid SSH state; refusing to route conversations locally");
  }
  private save() { clearTimeout(this.saveTimer); this.saveTimer = undefined; atomicJson(this.file, this.state); }
  private saveLater() { if (!this.saveTimer) this.saveTimer = setTimeout(() => this.save(), 500); }
  list(): SshStatus[] { return this.state.connections.map(c => this.statuses.get(c.id) ?? { ...c, state: "disconnected" }); }
  connection(id: string): SshConnection {
    const c = this.state.connections.find(c => c.id === id);
    if (!c) throw new Error("SSH connection no longer exists");
    return c;
  }
  upsert(raw: Omit<SshConnection, "id"> & { id?: string }): SshConnection {
    const c = validateSshConnection({ ...raw, id: raw.id ?? randomUUID() });
    if (this.clients.has(c.id) || this.connecting.has(c.id)) throw new Error("Disconnect before editing this connection");
    const old = this.state.connections.find(row => row.id === c.id);
    if (old && (old.host !== c.host || old.port !== c.port) && Object.values(this.state.threads).includes(c.id)) throw new Error("Create a separate connection for a different host; existing chats cannot change servers");
    this.state.connections = [...this.state.connections.filter(old => old.id !== c.id), c]; this.statuses.delete(c.id); this.save(); return c;
  }
  remove(id: string) {
    if (Object.values(this.state.threads).includes(id)) throw new Error("Delete this host's chats before removing its connection");
    this.disconnect(id); this.state.connections = this.state.connections.filter(c => c.id !== id); this.statuses.delete(id); this.save();
  }
  private status(id: string, changes: Partial<SshStatus>) {
    const status = { ...this.connection(id), ...this.statuses.get(id), ...changes } as SshStatus;
    this.statuses.set(id, status); this.emit("status", this.list()); return status;
  }
  private async shell(c: SshConnection, command: string): Promise<string> {
    try { return (await exec("ssh", [...sshArgs(c), "-T", c.host, command], { timeout: 120000, maxBuffer: 2_000_000 })).stdout.trim(); }
    catch (error) { const e = error as { stderr?: string; message?: string }; throw new Error((e.stderr || e.message || "SSH failed").slice(-2000)); }
  }
  async checkEngine(id: string): Promise<SshEngineStatus> {
    const connection = this.connection(id);
    if (this.statuses.get(id)?.state !== "connected") throw new Error("Connect to this SSH host before checking its engine");
    const data = Buffer.from(JSON.stringify({ id, phase: "engine-status" })).toString("base64");
    const result = JSON.parse(await this.shell(connection, "python3 -c " + quoteShell(this.sources.bootstrap) + " " + quoteShell(data))) as SshEngineStatus;
    this.status(id, { standaloneEngine: result });
    if (!this.clients.has(id)) await this.connect(id);
    return result;
  }
  connect(id: string): Promise<SshStatus> {
    const pending = this.connecting.get(id); if (pending) return pending;
    if (this.clients.has(id) && this.statuses.get(id)?.state === "connected") return Promise.resolve(this.statuses.get(id)!);
    const work = this.open(id).finally(() => this.connecting.delete(id)); this.connecting.set(id, work); return work;
  }
  private async open(id: string): Promise<SshStatus> {
    const c = this.connection(id); this.status(id, { state: "connecting", engineState: "checking", engineSetup: undefined, stage: "checking-host", standaloneEngine: undefined, error: undefined });
    let client: EngineClient | undefined;
    try {
      const bundle = this.bundleDir();
      const version = readFileSync(join(bundle, "remote", "VERSION"), "utf8").trim();
      const lock = readFileSync(join(bundle, "remote", "engine.lock"), "utf8");
      const serverVersion = /^version = ([\d.]+)$/m.exec(lock)?.[1];
      if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version) || !serverVersion) throw new Error("Invalid pinned remote engine manifest");
      const bootstrap = async (data: object) => JSON.parse(await this.shell(c, "python3 -c " + quoteShell(this.sources.bootstrap) + " " + quoteShell(Buffer.from(JSON.stringify(data)).toString("base64"))));
      const info = await bootstrap({ id, phase: "detect" }) as { root: string; home: string; arch: string; signedIn: boolean; sandboxReady: boolean; standaloneEngine: SshEngineStatus };
      this.status(id, { state: "connected", stage: undefined, home: info.home, sandboxReady: info.sandboxReady, standaloneEngine: info.standaloneEngine });
      const installed = info.standaloneEngine;
      if (installed.state !== "installed" || installed.version !== version || installed.serverVersion !== serverVersion || !installed.path) {
        return this.status(id, { engineState: "install-required", engineSetup: {
          title: installed.state === "missing" ? "Install app engine" : "Install the compatible app engine",
          message: "SSH is connected. Run this command on the remote host yourself, then choose Check again. The app will not install or update the engine.",
          command: "curl -fsSL https://raw.githubusercontent.com/circuitandchisel/unbiased-app-engine/main/install.sh | bash -s -- --version " + version,
        } });
      }
      if (!info.signedIn) return this.status(id, { engineState: "sign-in-required", engineSetup: {
        title: "Remote sign-in required", message: "Sign in to Unbiased on this host, then choose Check again. Your desktop credentials are never copied to the server.",
      } });
      this.status(id, { stage: "preparing-session" });
      const prepared = await bootstrap({ id, phase: "prepare", version, serverVersion, enginePath: installed.path, helper: Buffer.from(this.sources.helper).toString("base64") });
      if (!prepared.ok) return this.status(id, { stage: undefined, engineState: "restart-required", engineSetup: prepared.actionRequired });
      this.status(id, { stage: "starting-engine" });
      client = new EngineClient(); const live = client;
      this.clients.set(id, live);
      live.on("notification", (msg: { method: string; params?: Record<string, unknown> }) => {
        if (msg.method === "unbiased/ssh/cursor") {
          const cursor = msg.params?.cursor;
          if (Number.isSafeInteger(cursor)) { this.state.cursors[id] = cursor as number; this.saveLater(); } return;
        }
        if (msg.method === "unbiased/ssh/replay-gap") {
          this.state.cursors[id] = Number(msg.params?.cursor) || 0; this.save();
          this.emit("replay-gap", id); return;
        }
        if (msg.method === "unbiased/ssh/engine-exited") { live.stop(); this.clients.delete(id); this.status(id, { state: "error", error: "Remote engine exited. Reconnect to restore saved chats." }); return; }
        this.emit("notification", this.incoming(id, msg));
      });
      live.on("server-request", (msg: { id: number | string; method: string; params?: Record<string, unknown> }) => {
        const allowed = ["item/commandExecution/requestApproval", "item/fileChange/requestApproval", "item/tool/requestUserInput", "item/tool/call"];
        if (!allowed.includes(msg.method) || (msg.method === "item/tool/call" && !["web_search", "image_generation"].includes(String(msg.params?.tool)))) {
          live.respond(msg.id, { success: false, decision: "decline", contentItems: [{ type: "inputText", text: "Desktop-local tools are unavailable to this SSH session" }] });
          return;
        }
        const key = "ssh:" + id + ":" + Buffer.from(JSON.stringify(msg.id)).toString("base64url");
        this.requestOwners.set(key, { connectionId: id, client: live, id: msg.id });
        this.emit("server-request", { ...this.incoming(id, msg) as object, id: key });
      });
      live.on("status", (status: { state: string; detail?: string }) => {
        if (status.state === "exited" && this.clients.get(id) === live) { this.clients.delete(id); this.status(id, { state: "error", error: status.detail || "SSH connection lost. Reconnect to recover the remote session." }); }
      });
      live.start("ssh", undefined, [...sshArgs(c), "-T", c.host, "exec python3 -u " + quoteShell(info.root + "/helper.py") + " attach " + quoteShell(info.root) + " " + (this.state.cursors[id] ?? 0)]);
      const handshake = live.handshake(this.appVersion);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([handshake, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Remote engine handshake timed out; check remote sign-in")), 25000); })]); }
      finally { clearTimeout(timer); }
      if (this.clients.get(id) !== live) throw new Error("Remote engine disconnected during startup");
      const status = this.status(id, { state: "connected", engineState: "ready", engineSetup: undefined, stage: undefined, error: undefined, home: info.home, sandboxReady: info.sandboxReady });
      this.emit("ready", id);
      return status;
    } catch (e) {
      client?.stop(); this.clients.delete(id);
      this.status(id, { state: "error", stage: undefined, error: (e instanceof Error ? e.message : String(e)).trim().split("\n").at(-1)?.replace(/^(?:RuntimeError|ValueError|Error): /, "") }); throw e;
    }
  }
  disconnect(id: string) {
    if (this.connecting.has(id)) throw new Error("Wait for the connection attempt to finish");
    this.clients.get(id)?.stop(); this.clients.delete(id); this.status(id, { state: "disconnected", engineState: undefined, engineSetup: undefined, stage: undefined, error: undefined }); this.save();
  }
  stop() { for (const c of this.clients.values()) c.stop(); this.clients.clear(); this.save(); }
  threadsFor(id: string): string[] { return Object.keys(this.state.threads).filter(thread => this.state.threads[thread] === id); }
  owner(threadId: string | null | undefined): string | null { return threadId ? this.state.threads[threadId] ?? null : null; }
  private own(id: string, thread: unknown) {
    if (typeof thread !== "string" || !thread) return;
    if (this.state.threads[thread] && this.state.threads[thread] !== id) throw new Error("Remote thread identity collision; refusing to route");
    if (!this.state.threads[thread]) { this.state.threads[thread] = id; this.save(); }
  }
  private incoming(id: string, value: unknown, key = ""): unknown {
    if (Array.isArray(value)) return value.map(x => this.incoming(id, x, key));
    if (value && typeof value === "object") {
      const v = value as Record<string, unknown>;
      if (key === "thread") this.own(id, v.id);
      if (typeof v.threadId === "string") this.own(id, v.threadId);
      if (typeof v.thread_id === "string") this.own(id, v.thread_id);
      if (typeof v.agentThreadId === "string") this.own(id, v.agentThreadId);
      if (typeof v.senderThreadId === "string") this.own(id, v.senderThreadId);
      if (Array.isArray(v.receiverThreadIds)) v.receiverThreadIds.forEach(thread => this.own(id, thread));
      const mapped = Object.fromEntries(Object.entries(v).map(([k, v]) => [k, this.incoming(id, v, k)]));
      if (key === "thread" && typeof mapped.id === "string") {
        this.state.cachedThreads ??= {};
        this.state.cachedThreads[mapped.id] = Object.fromEntries(["id", "name", "cwd", "preview", "createdAt", "updatedAt", "threadSource", "source"].filter(k => k in mapped).map(k => [k, mapped[k]]));
        this.saveLater();
      }
      return mapped;
    }
    if (typeof value === "string" && value.startsWith("/") && ["cwd", "path", "filePath", "rolloutPath", "root", "codexHome"].includes(key)) return sshPath(id, value);
    return value;
  }
  private outgoing(id: string, value: unknown): unknown {
    if (Array.isArray(value)) return value.map(v => this.outgoing(id, v));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,this.outgoing(id,v)]));
    if (typeof value === "string" && value.includes(SSH_PATH_ROOT)) {
      return value.replace(/\/__unbiased_ssh__\/([a-f0-9-]{36})(?=\/)/g, (_, host) => { if (host !== id) throw new Error("Cross-host path in remote request"); return ""; });
    }
    return value;
  }
  private client(id: string): EngineClient {
    const c = this.clients.get(id);
    const status = this.statuses.get(id);
    if (status?.state === "connected" && status.engineState && status.engineState !== "ready") throw new Error("Finish app-engine setup for " + this.connection(id).name + " in Settings → SSH before opening a remote project.");
    if (!c || this.statuses.get(id)?.state !== "connected" || (this.statuses.get(id)?.engineState && this.statuses.get(id)?.engineState !== "ready")) throw new Error("SSH connection to " + this.connection(id).name + " is offline. Reconnect in Settings → SSH.");
    return c;
  }
  workspace(path: string, op: string, params: Record<string, unknown> = {}): Promise<any> {
    const p = parseSshPath(path); if (!p) throw new Error("Remote path required");
    return this.client(p.connectionId).request("unbiased/workspace", { ...params, op, path: p.path });
  }
  async request(method: string, params: Record<string, unknown>, local: () => Promise<unknown>): Promise<unknown> {
    const thread = typeof params.threadId === "string" ? params.threadId : undefined;
    const cwd = typeof params.cwd === "string" ? params.cwd : Array.isArray(params.cwds) ? params.cwds[0] as string : undefined;
    const pathOwner = parseSshPath(cwd)?.connectionId;
    const id = this.owner(thread) ?? pathOwner;
    if (!id) {
      const result = await local();
      if (method === "thread/list" && !params.cursor) {
        const remote: unknown[] = [];
        for (const [id, client] of this.clients) {
          if (this.statuses.get(id)?.state !== "connected" || (this.statuses.get(id)?.engineState && this.statuses.get(id)?.engineState !== "ready")) continue;
          let cursor: string | undefined;
          do {
            const page = await client.request("thread/list", { ...params, ...(cursor ? { cursor } : {}) }) as { data: unknown[]; nextCursor?: string };
            remote.push(...page.data.map(t => this.incoming(id, t, "thread"))); cursor = page.nextCursor;
          } while (cursor);
        }
        for (const [thread, cached] of Object.entries(this.state.cachedThreads ?? {})) {
          if (this.statuses.get(this.state.threads[thread])?.state !== "connected" || (this.statuses.get(this.state.threads[thread])?.engineState && this.statuses.get(this.state.threads[thread])?.engineState !== "ready")) remote.push(cached);
        }
        const page = result as { data: unknown[] };
        return { ...page, data: [...page.data, ...remote] };
      }
      return result;
    }
    if (pathOwner && pathOwner !== id) throw new Error("Conversation and project belong to different SSH hosts");
    const client = this.client(id);
    const raw = { ...params };
    const sandbox = typeof raw.sandbox === "string" ? raw.sandbox : (raw.sandboxPolicy as { type?: string } | undefined)?.type;
    if (this.statuses.get(id)?.sandboxReady === false && sandbox && !["danger-full-access", "dangerFullAccess"].includes(sandbox)) throw new Error("Sandbox prerequisites are missing on this SSH host. Configure its sandbox first, or explicitly choose Full Access for this conversation.");
    if (["thread/start", "thread/resume", "thread/fork"].includes(method)) {
      delete raw.config;
      if (Array.isArray(raw.dynamicTools)) raw.dynamicTools = raw.dynamicTools.filter((t: any) => ["web_search", "image_generation"].includes(t.name));
    }
    if (Array.isArray(raw.input)) {
      raw.input = await Promise.all(raw.input.map(async (item: any) => {
        if (["localImage", "mention"].includes(item.type) && typeof item.path === "string" && !parseSshPath(item.path)) {
          const data = readFileSync(item.path); if (data.length > 20_000_000) throw new Error("Remote attachment exceeds 20 MB");
          const uploaded = await client.request("unbiased/workspace", { op: "upload", path: "/", name: item.path, data: data.toString("base64") }) as { path: string };
          return { ...item, path: uploaded.path };
        }
        return item;
      }));
    }
    const result = await client.request(method, this.outgoing(id, raw) as Record<string, unknown>);
    if (method === "thread/delete" && thread) {
      delete this.state.threads[thread]; delete this.state.cachedThreads?.[thread]; this.save();
    }
    return this.incoming(id, result);
  }
  respond(id: number | string, result: Record<string, unknown>): boolean {
    const owner = this.requestOwners.get(String(id)); if (!owner) return false;
    if (this.client(owner.connectionId) !== owner.client) throw new Error("This approval belongs to an earlier SSH connection. Wait for it to replay after reconnecting.");
    owner.client.respond(owner.id, result); this.requestOwners.delete(String(id)); return true;
  }
  terminal(path: string): { command: string; args: string[] } {
    const p = parseSshPath(path); if (!p) throw new Error("Remote terminal path required");
    this.client(p.connectionId);
    const c = this.connection(p.connectionId);
    return { command: "ssh", args: [...sshArgs(c), "-tt", c.host, "cd " + quoteShell(p.path) + ' && exec "$SHELL" -l'] };
  }
}
