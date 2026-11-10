import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, realpathSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, isAbsolute } from "node:path";
import { SshConnections, validateSshConnection, sshArgs, quoteShell } from "./ssh-connections";
import { sshPath, parseSshPath } from "../shared/ssh";
const a = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const b = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
test("SSH inputs are argv-safe; shell quoting does not execute expansion", () => {
  const base = { id: a, name: "Dev box", host: "dev-server" };
  for (const host of ["-oProxyCommand=evil", "host;touch /tmp/x", "host\n-o x", "$(whoami)", "host name"]) assert.throws(() => validateSshConnection({ ...base, host }));
  assert.throws(() => validateSshConnection({ ...base, port: 0 }));
  assert.throws(() => validateSshConnection({ ...base, identityFile: "relative" }));
  assert.deepEqual(sshArgs(base).slice(0, 4), ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes"]);
  assert.equal(quoteShell("a'b$(x)"), "'a'\\''b$(x)'");
  assert.equal(parseSshPath(sshPath(a, "/home/ubuntu/project"))?.connectionId, a);
  assert.throws(() => parseSshPath(sshPath(a, "/../etc")));
});
test("host routing survives restart; disconnected remote work cannot fall back locally", async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "ssh-routing-")));
  try {
    const file = join(dir, "state.json");
    const manager = new SshConnections(file, () => "", "test", { helper: "", bootstrap: "" });
    manager.upsert({ id: a, name: "A", host: "host-a" });
    manager.upsert({ id: b, name: "B", host: "host-b" });
    const calls: unknown[][] = [];
    const internal = manager as any;
    internal.clients.set(a, { stop: () => {}, request: async (...args: unknown[]) => {
      calls.push(args);
      return { thread: { id: "remote-thread", cwd: "/home/ubuntu/project" } };
    } });
    internal.statuses.set(a, { id: a, state: "connected" });
    let localCalls = 0;
    const local = async () => { localCalls++; return { thread: { id: "local" } }; };
    const result = await manager.request("thread/start", { cwd: sshPath(a, "/home/ubuntu/project"), config: { "mcp_servers.secret.enabled": true }, dynamicTools: [{ name: "computer_click" }, { name: "web_search" }] }, local) as any;
    assert.equal(result.thread.cwd, sshPath(a, "/home/ubuntu/project"));
    assert.equal(localCalls, 0);
    assert.equal((calls[0][1] as any).cwd, "/home/ubuntu/project");
    assert.equal((calls[0][1] as any).config, undefined);
    assert.deepEqual((calls[0][1] as any).dynamicTools, [{ name: "web_search" }]);
    await assert.rejects(manager.request("turn/start", { threadId: "remote-thread", cwd: sshPath(b, "/project"), input: [] }, local), /different SSH hosts/);
    internal.statuses.set(a, { id: a, state: "connected", sandboxReady: false });
    await assert.rejects(manager.request("turn/start", { threadId: "remote-thread", sandboxPolicy: { type: "readOnly" }, input: [] }, local), /Sandbox prerequisites/);
    manager.disconnect(a);
    assert.throws(() => manager.upsert({ id: a, name: "Renamed", host: "different-host" }), /different host/);
    const reopened = new SshConnections(file, () => "", "test", { helper: "", bootstrap: "" });
    await assert.rejects(reopened.request("turn/start", { threadId: "remote-thread", input: [] }, local), /offline/);
    assert.equal(localCalls, 0);
    const offline = await reopened.request("thread/list", {}, async () => ({ data: [] })) as any;
    assert.equal(offline.data[0].id, "remote-thread");
    await reopened.request("turn/start", { threadId: "local-thread", input: [] }, local);
    assert.equal(localCalls, 1);
    reopened.stop();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("sub-agent ownership and approval replies are isolated by SSH host", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "ssh-approvals-")));
  try {
    const manager = new SshConnections(join(dir, "state.json"), () => "", "test", { helper: "", bootstrap: "" });
    manager.upsert({ id: a, name: "A", host: "host-a" });
    manager.upsert({ id: b, name: "B", host: "host-b" });
    const internal = manager as any;
    internal.incoming(a, { threadId: "parent", item: { agentThreadId: "child" } });
    assert.equal(manager.owner("child"), a);
    assert.throws(() => internal.incoming(b, { threadId: "child" }), /collision/);
    const replies: unknown[] = [];
    const clientA = { respond: (...args: unknown[]) => replies.push(["a", ...args]) };
    const clientB = { respond: (...args: unknown[]) => replies.push(["b", ...args]) };
    internal.clients.set(a, clientA); internal.clients.set(b, clientB);
    internal.statuses.set(a, { state: "connected" }); internal.statuses.set(b, { state: "connected" });
    internal.requestOwners.set("ssh:a:1", { connectionId: a, client: clientA, id: 1 });
    internal.requestOwners.set("ssh:b:1", { connectionId: b, client: clientB, id: 1 });
    manager.respond("ssh:b:1", { decision: "accept" });
    assert.deepEqual(replies, [["b", 1, { decision: "accept" }]]);
    assert.equal(manager.respond("unrelated", {}), false);
    internal.clients.delete(a); internal.statuses.set(a, { state: "disconnected" });
    assert.throws(() => manager.respond("ssh:a:1", { decision: "accept" }), /offline/);
    assert.equal(internal.requestOwners.has("ssh:a:1"), true, "a disconnected approval is not silently acknowledged");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("Mosaic file links resolve against their conversation's host, not the foreground chat", () => {
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const start = source.indexOf('  ipcMain.handle("workspace:resolve-file",');
  const end = source.indexOf('  ipcMain.handle("ssh:save",', start);
  assert(start > 0 && end > start);
  let resolve!: (_e: unknown, p: { threadId: string; path: string }) => string;
  const cwd = new Map([["tile-a", sshPath(a, "/home/ubuntu/a")], ["tile-b", sshPath(b, "/home/ubuntu/b")]]);
  runInNewContext(transformSync(source.slice(start, end), { loader: "ts" }).code, {
    ipcMain: { handle: (_name: string, callback: typeof resolve) => { resolve = callback; } },
    parseSshPath, sshPath, isAbsolute, join, threadCwds: cwd, mainCwd: "/Users/test/other-project", pendingCwd: null,
    sshConnections: { owner: (id: string) => id === "tile-a" ? a : id === "tile-b" ? b : id === "unopened" ? a : null },
    workspacePath: (path: string) => path, homedir: () => "/Users/test",
  });
  assert.equal(resolve(null, { threadId: "tile-a", path: "README.md" }), sshPath(a, "/home/ubuntu/a/README.md"));
  assert.equal(resolve(null, { threadId: "tile-b", path: "README.md" }), sshPath(b, "/home/ubuntu/b/README.md"));
  assert.equal(resolve(null, { threadId: "tile-a", path: "/tmp/result.png" }), sshPath(a, "/tmp/result.png"));
  assert.throws(() => resolve(null, { threadId: "tile-a", path: sshPath(b, "/secret") }), /different SSH host/);
  assert.throws(() => resolve(null, { threadId: "unopened", path: "README.md" }), /Open the remote conversation/);
});

test("remote workspace helper creates Git worktrees without dirtying the source checkout", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "ssh-worktree-")));
  try {
    const script = [
      "import importlib.util, pathlib, subprocess, sys",
      "root=pathlib.Path(sys.argv[1]); source=sys.argv[2]; sys.argv=['helper','test',str(root)]",
      "spec=importlib.util.spec_from_file_location('ssh_helper',source); module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)",
      "repo=root/\"project with spaces\"; repo.mkdir()",
      "subprocess.run(['git','init',str(repo)],check=True,capture_output=True)",
      "subprocess.run(['git','-c','user.name=Test','-c','user.email=test@example.invalid','commit','--allow-empty','-m','initial'],cwd=repo,check=True,capture_output=True)",
      "result=module.workspace({'op':'worktree','path':str(repo),'name':'smoke-case'})",
      "assert result['code']==0, result",
      "assert subprocess.check_output(['git','status','--porcelain'],cwd=repo)==b''",
      "assert subprocess.check_output(['git','branch','--show-current'],cwd=repo/'.unbiased/worktrees/smoke-case').strip()==b'pareto/smoke-case'",
      "assert module.workspace({'op':'stat','path':str(repo)})['dir']",
      "try: module.workspace({'op':'worktree','path':str(repo),'name':'../escape'}); raise AssertionError('accepted traversal')",
      "except ValueError: pass",
    ].join("\n");
    execFileSync("python3", ["-c", script, dir, new URL("./ssh-helper.py", import.meta.url).pathname], { timeout: 15000 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("standalone engine probe distinguishes missing, installed and broken commands without bootstrapping", () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "ssh-engine-probe-")));
  try {
    const probe = () => JSON.parse(execFileSync("python3", ["-c", `
import pathlib, sys
from unittest.mock import patch
source = pathlib.Path(sys.argv[1]).read_text()
home = pathlib.Path(sys.argv[2])
sys.argv = [sys.argv[1], sys.argv[3]]
with patch('platform.system', return_value='Linux'), patch('pathlib.Path.home', return_value=home), patch('shutil.which', return_value=None):
    exec(compile(source, 'ssh-bootstrap.py', 'exec'))
`, new URL("./ssh-bootstrap.py", import.meta.url).pathname, home,
      Buffer.from(JSON.stringify({ id: a, phase: "engine-status" })).toString("base64")], { encoding: "utf8" }));
    assert.deepEqual(probe(), { state: "missing" });
    assert.throws(() => realpathSync(join(home, ".cache")));
    mkdirSync(join(home, ".local", "bin"), { recursive: true });
    const launcher = join(home, ".local", "bin", "unbiased-engine");
    writeFileSync(launcher, '#!/bin/sh\necho "unbiased-app-engine 0.1.0"\n', { mode: 0o755 });
    writeFileSync(join(home, ".local", "bin", "pareto-app-server"), '#!/bin/sh\necho "codex-app-server 0.1.7"\n', { mode: 0o755 });
    assert.deepEqual(probe(), { state: "installed", version: "0.1.0", serverVersion: "0.1.7", path: launcher });
    writeFileSync(launcher, '#!/bin/sh\necho "unexpected output"\n');
    assert.deepEqual(probe(), { state: "error", path: launcher });
    assert.throws(() => realpathSync(join(home, ".cache")));
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("checking a connected host's engine only probes status and preserves its client", async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "ssh-engine-status-")));
  try {
    const manager = new SshConnections(join(dir, "state.json"), () => "", "test", { helper: "", bootstrap: "probe source" });
    manager.upsert({ id: a, name: "Development server", host: "dev-server" });
    const internal = manager as any;
    let probes = 0;
    internal.shell = async () => { probes++; return JSON.stringify({ state: "installed", version: "0.1.0" }); };
    await assert.rejects(manager.checkEngine(a), /Connect to this SSH host/);
    assert.equal(probes, 0);
    internal.statuses.set(a, { ...manager.connection(a), state: "connected" });
    const client = {};
    internal.clients.set(a, client);
    assert.deepEqual(await manager.checkEngine(a), { state: "installed", version: "0.1.0" });
    assert.equal(manager.list()[0].standaloneEngine?.version, "0.1.0");
    assert.equal(manager.list()[0].state, "connected");
    assert.equal(internal.clients.get(a), client);
    assert.equal(probes, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("SSH connects without an engine and prompts for manual installation without preparing a runtime", async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "ssh-manual-")));
  try {
    mkdirSync(join(dir, "remote"));
    writeFileSync(join(dir, "remote", "VERSION"), "0.1.0");
    writeFileSync(join(dir, "remote", "engine.lock"), "version = 0.1.7\n");
    const manager = new SshConnections(join(dir, "state.json"), () => dir, "test", { helper: "helper", bootstrap: "probe source" });
    manager.upsert({ id: a, name: "Development server", host: "dev-server" });
    const internal = manager as any;
    let calls = 0;
    internal.shell = async () => { calls++; return JSON.stringify({ root: "/remote/cache", home: "/remote", arch: "x64", signedIn: true, sandboxReady: true, standaloneEngine: { state: "missing" } }); };
    const result = await manager.connect(a);
    assert.equal(calls, 1, "only read-only detection was requested");
    assert.equal(result.state, "connected");
    assert.equal(result.engineState, "install-required");
    assert.match(result.engineSetup!.command!, /curl .*bash -s -- --version 0\.1\.0$/);
    assert.equal(internal.clients.size, 0, "no engine or installer was launched");
    assert.throws(() => manager.workspace(sshPath(a, "/repo"), "list"), /Finish app-engine setup/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a busy old bridge produces a guarded manual stop command and never stops or replaces it", () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "ssh-manual-restart-")));
  try {
    const bin = join(home, ".local", "bin"); mkdirSync(bin, { recursive: true });
    const engine = join(bin, "unbiased-engine");
    const engineSource = '#!/bin/sh\necho "unbiased-app-engine 0.1.0"\n';
    writeFileSync(engine, engineSource, { mode: 0o755 });
    writeFileSync(join(bin, "pareto-app-server"), '#!/bin/sh\necho "codex-app-server 0.1.7"\n', { mode: 0o755 });
    const root = join(home, ".cache", "unbiased-ssh", a); mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "runtime.json"), '{"version":"old"}');
    writeFileSync(join(root, "helper.py"), "old helper");
    writeFileSync(join(root, "daemon.pid"), "12345");
    const payload = Buffer.from(JSON.stringify({ id: a, phase: "prepare", version: "0.1.0", serverVersion: "0.1.7", enginePath: engine, helper: Buffer.from("new helper").toString("base64") })).toString("base64");
    const result = JSON.parse(execFileSync("python3", ["-c", `
import fcntl, pathlib, sys
from unittest.mock import patch
source = pathlib.Path(sys.argv[1]).read_text()
home = pathlib.Path(sys.argv[2])
held_lock = (home / '.cache' / 'unbiased-ssh' / '${a}' / 'daemon.lock').open('a')
fcntl.flock(held_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
sys.argv = [sys.argv[1], sys.argv[3]]
with patch('platform.system', return_value='Linux'), patch('pathlib.Path.home', return_value=home), patch('os.kill', side_effect=AssertionError('must never stop a process')), patch('os.killpg', side_effect=AssertionError('must never stop a process group')):
    exec(compile(source, 'ssh-bootstrap.py', 'exec'))
`, new URL("./ssh-bootstrap.py", import.meta.url).pathname, home, payload], { encoding: "utf8" }));
    assert.equal(result.ok, false);
    assert.equal(result.actionRequired.title, "Stop the previous session first");
    assert.match(result.actionRequired.command, /12345$/);
    assert.match(result.actionRequired.command, /This is no longer the expected SSH session/);
    assert.equal(readFileSync(join(root, "runtime.json"), "utf8"), '{"version":"old"}');
    assert.equal(readFileSync(join(root, "helper.py"), "utf8"), "old helper");
    assert.equal(readFileSync(engine, "utf8"), engineSource);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("a required remote restart is returned as a setup prompt, not a failed connection", async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "ssh-restart-prompt-")));
  try {
    mkdirSync(join(dir, "remote"));
    writeFileSync(join(dir, "remote", "VERSION"), "0.1.0");
    writeFileSync(join(dir, "remote", "engine.lock"), "version = 0.1.7\n");
    const manager = new SshConnections(join(dir, "state.json"), () => dir, "test", { helper: "helper", bootstrap: "probe source" });
    manager.upsert({ id: a, name: "Development server", host: "dev-server" });
    let calls = 0;
    (manager as any).shell = async () => JSON.stringify(++calls === 1 ? {
      root: "/remote/cache", home: "/remote", arch: "x64", signedIn: true, sandboxReady: true,
      standaloneEngine: { state: "installed", version: "0.1.0", serverVersion: "0.1.7", path: "/remote/engine" },
    } : { ok: false, actionRequired: { title: "Stop the previous session first", message: "Finish its work and stop it manually.", command: "manual-stop-example" } });
    const result = await manager.connect(a);
    assert.equal(result.state, "connected");
    assert.equal(result.engineState, "restart-required");
    assert.equal(result.error, undefined);
    assert.equal(result.engineSetup?.command, "manual-stop-example");
    assert.equal(calls, 2);
    assert.equal((manager as any).clients.size, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a saved project pins its SSH destination even before its first chat", () => {
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const start = source.indexOf('  ipcMain.handle("ssh:save",');
  const end = source.indexOf('  ipcMain.handle("ssh:check-engine",', start);
  let save!: (_e: unknown, value: unknown) => unknown;
  let writes = 0;
  runInNewContext(transformSync(source.slice(start, end), { loader: "ts" }).code, {
    ipcMain: { handle: (_: string, handler: typeof save) => { save = handler; } }, parseSshPath,
    loadProjects: () => [{ folders: [sshPath(a, "/project")] }],
    sshConnections: { connection: () => ({ host: "original-host", port: 22 }), upsert: () => { writes++; } },
  });
  assert.throws(() => save(null, { id: a, host: "another-host", port: 22 }), /existing projects cannot change servers/);
  assert.throws(() => save(null, { id: a, host: "original-host", port: 2222 }), /existing projects cannot change servers/);
  save(null, { id: a, host: "original-host", port: 22, name: "Renamed" });
  assert.equal(writes, 1);
});

test("normal project creation validates every remote folder and refuses mixed devices without local writes", async () => {
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const start = source.indexOf('  ipcMain.handle(\n    "project:create",');
  const end = source.indexOf('  ipcMain.handle("project:pick-location",', start);
  let create!: (_e: unknown, value: unknown) => Promise<any>;
  const probes: string[] = [], saved: any[] = [];
  runInNewContext(transformSync(source.slice(start, end), { loader: "ts" }).code, {
    ipcMain: { handle: (_: string, handler: typeof create) => { create = handler; } }, parseSshPath,
    sshConnections: { workspace: async (path: string) => { probes.push(path); return { dir: !path.endsWith("missing") }; } },
    projectRecord: (record: unknown) => record, randomUUID: () => "new-project", loadProjects: () => [], saveProjects: (rows: unknown[]) => saved.push(rows),
    panes: { main: {} }, pendingProjectId: null, pendingCwd: null, mainCwd: null,
    mkdirSync: () => { throw new Error("must not create local folders"); },
  });
  for (const folders of [[sshPath(a, "/repo"), "/local"], [sshPath(a, "/repo"), sshPath(b, "/repo")]]) {
    assert.match((await create(null, { name: "Test", folders })).error, /same device/);
  }
  assert.equal(probes.length, 0);
  assert.match((await create(null, { name: "Test", folders: [sshPath(a, "/missing")] })).error, /no longer available/);
  assert.equal(saved.length, 0);
  const path = sshPath(a, "/repo");
  assert.equal((await create(null, { name: "Test", folders: [path], primary: path, icon: "flask", color: "red" })).path, path);
  assert.equal(saved[0][0].icon, "flask");
});

test("the advertised maximum attachment fits the SSH bridge's bounded JSON frame", () => {
  const script = `import importlib.util, pathlib, sys
sys.argv = ['helper', 'test', sys.argv[2]]
spec = importlib.util.spec_from_file_location('helper', ${JSON.stringify(new URL("./ssh-helper.py", import.meta.url).pathname)})
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
import base64
payload = {'id': 1, 'method': 'unbiased/workspace', 'params': {'op': 'upload', 'data': base64.b64encode(b'x' * 20_000_000).decode()}}
assert len(m.frame(payload)) < m.MAX_LINE
`;
  execFileSync("python3", ["-c", script, "unused", tmpdir()], { timeout: 10000 });
});
