// Explicit live integration check; never part of CI or the normal unit suite.
// UNBIASED_SSH_SMOKE_HOST=dev-server node --import tsx build/smoke-ssh-remote.mts
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { SshConnections, quoteShell, sshArgs } from "../src/main/ssh-connections";
import { sshPath } from "../src/shared/ssh";
const host = process.env.UNBIASED_SSH_SMOKE_HOST;
assert(host, "Set UNBIASED_SSH_SMOKE_HOST explicitly; this check uses two small live model requests");
const dir = realpathSync(mkdtempSync(join(tmpdir(), "ssh-live-")));
const id = randomUUID();
const manager = new SshConnections(join(dir, "connections.json"), () => process.env.UNBIASED_ENGINE_DIR ?? resolve("../unbiased-app-engine/dist/bundle"), "ssh-smoke", {
  helper: readFileSync("src/main/ssh-helper.py", "utf8"),
  bootstrap: readFileSync("src/main/ssh-bootstrap.py", "utf8"),
});
const c = manager.upsert({ id, name: "SSH integration smoke", host });
let root = "";
const messages: any[] = [];
let drop: (() => void) | undefined;
manager.on("notification", msg => { messages.push(msg); if (msg.method === "item/started" && msg.params?.item?.type === "commandExecution") drop?.(); });
manager.on("server-request", msg => { throw new Error("Unexpected server request: " + msg.method); });
const until = async (test: () => boolean, timeout = 90000) => {
  const start = Date.now();
  while (!test()) { if (Date.now() - start > timeout) throw new Error("SSH live smoke timed out"); await new Promise(r => setTimeout(r, 50)); }
};
try {
  const status = await manager.connect(id);
  assert.equal(status.state, "connected");
  if (status.engineState !== "ready") throw new Error((status.engineSetup?.message ?? "Finish remote engine setup manually") + "\n" + (status.engineSetup?.command ?? ""));
  root = status.home + "/.cache/unbiased-ssh/" + id;
  const path = sshPath(id, root);
  const listing = await manager.workspace(sshPath(id, "/home/ubuntu/Projects/Work"), "list");
  assert(listing.entries.some((x: any) => x.name === "unbiased-analysis"));
  const file = await manager.workspace(sshPath(id, "/home/ubuntu/Projects/Work/unbiased-analysis/README.md"), "read");
  assert(file.content.length > 0);
  const git = await manager.workspace(sshPath(id, "/home/ubuntu/Projects/Work/unbiased-analysis"), "exec", { argv: ["git", "rev-parse", "--show-toplevel"] });
  assert.equal(git.code, 0); assert.match(git.out, /unbiased-analysis/);
  console.log("PASS: existing pinned engine, handshake, remote folder listing, file read and Git");
  const started = await manager.request("thread/start", { cwd: path, approvalPolicy: "never", sandbox: "danger-full-access", dynamicTools: [] }, async () => { throw Error("Local fallback"); }) as any;
  const tid = started.thread.id;
  let turnId: string | undefined;
  let dropped = false;
  drop = () => { if (dropped) return; dropped = true; drop = undefined; setTimeout(() => manager.disconnect(id), 100); };
  const prompt = "Bounded remote transport test. Use exec_command exactly once to run: python3 -c \"import pathlib,time; p=pathlib.Path('smoke-counter'); p.write_text(str(int(p.read_text())+1) if p.exists() else '1'); time.sleep(4); print('REMOTE_ONCE_OK')\". Then reply REMOTE_ONCE_OK. Do not inspect other files or use other tools.";
  const turn = await manager.request("turn/start", { threadId: tid, input: [{ type: "text", text: prompt }] }, async () => { throw Error("Local fallback"); }) as any;
  turnId = turn.turn.id;
  await until(() => manager.list()[0].state === "disconnected");
  await new Promise(r => setTimeout(r, 5000));
  await manager.connect(id);
  await until(() => messages.some(m => m.method === "turn/completed" && m.params.turn.id === turnId));
  assert.equal((await manager.workspace(sshPath(id, root + "/smoke-counter"), "read")).content, "1");
  const read = await manager.request("thread/read", { threadId: tid, includeTurns: true }, async () => { throw Error("Local fallback"); }) as any;
  assert.equal(read.thread.cwd, path);
  assert.equal(read.thread.turns.at(-1).status, "completed");
  assert(messages.some(m => m.method === "item/agentMessage/delta" && m.params.delta.includes("REMOTE")));
  console.log("PASS: disconnect during real remote command, daemon survived, updates replayed, command executed once");
  manager.disconnect(id);
  await assert.rejects(manager.request("turn/start", { threadId: tid, input: [] }, async () => { throw Error("Local fallback"); }), /offline/);
  await manager.connect(id);
  await manager.request("thread/delete", { threadId: tid }, async () => { throw Error("Local fallback"); });
  writeFileSync(join(dir, "results.json"), JSON.stringify({ id, root, status, messages: messages.map(m => m.method) }, null, 2));
  console.log("PASS: disconnected thread failed closed; reconnect and delete succeeded");
  console.log("Evidence:", dir);
} finally {
  manager.stop();
  if (root) {
    // Remove only the private profile created by this check. Validate process identity.
    const cleanup = "import os,pathlib,signal,shutil; p=pathlib.Path(" + JSON.stringify(root) + "); f=p/'daemon.pid'; pid=int(f.read_text()) if f.exists() else 0; cmd=pathlib.Path('/proc/'+str(pid)+'/cmdline'); ok=pid and cmd.exists() and str(p).encode() in cmd.read_bytes(); os.kill(pid,signal.SIGTERM) if ok else None; shutil.rmtree(p)";
    execFileSync("ssh", [...sshArgs(c), "-T", c.host, "python3 -c " + quoteShell(cleanup)], { timeout: 15000 });
  }
}
