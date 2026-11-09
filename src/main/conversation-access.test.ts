import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";
import { join } from "node:path";
import { ConversationAccess } from "./conversation-access";
import { isAccessMode } from "../shared/access-mode";

test("conversation permissions survive reopening independently of the new-chat default", () => {
  const access = new ConversationAccess();
  access.set("full");
  access.get("one"); access.get("two");
  access.set("auto", "one");
  assert.equal(access.get("two"), "full");
  access.set("ask");
  assert.equal(access.get("one"), "auto");
  assert.equal(access.get("two"), "full");
  const restored = new ConversationAccess(JSON.parse(JSON.stringify(access.snapshot())));
  assert.equal(restored.get("one"), "auto");
  assert.equal(restored.get("two"), "full");
  assert.equal(restored.get("new"), "ask");
  assert.equal(new ConversationAccess({ defaultMode: "invalid", threads: { one: "invalid" } }).get("one"), "ask");
});

test("production policy IPC, engine policies, and local gates isolate conversations and their grants", () => {
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const access = new ConversationAccess({ defaultMode: "full", threads: { one: "full", two: "full" } });
  const handlers = new Map<string, (...args: any[]) => any>();
  const grants = () => new Set(["one", "child-one", "side-one", "two"]);
  const context: any = {
    conversationAccess: access, isAccessMode, saveConversationAccess: () => {},
    subAgents: new Map([["child-one", { parent: "one" }]]),
    sideChatRecents: { forThread: (id: string) => id === "side-one" ? { parentThreadId: "one" } : null },
    axGrants: grants(), browserNetGrants: grants(), browserConnectGrants: grants(),
    ipcMain: { handle: (name: string, handler: (...args: any[]) => any) => handlers.set(name, handler) },
    homedir: () => "/home", join, loadWorktrees: () => ({ "/worktree": { project: "/repo" } }),
  };
  function load(from: string, to: string) {
    const start = source.indexOf(from), end = source.indexOf(to, start);
    assert.ok(start >= 0 && end > start);
    runInNewContext(transformSync(source.slice(start, end), { loader: "ts" }).code, context);
  }
  load("function accessRootOf(", "/** Put back a raise");
  load("const MODE_THREAD_POLICY:", "// Last known context usage");
  load('  ipcMain.handle("policy:get-modes",', '  ipcMain.handle("chat:interrupt",');
  handlers.get("policy:set-mode")!({}, "auto", "one");
  assert.equal(context.threadPolicy("one").approvalPolicy, "on-request");
  assert.equal(context.turnSandbox("/worktree", "one").type, "workspaceWrite");
  assert.ok(context.turnSandbox("/worktree", "one").writableRoots.includes("/repo/.git"));
  assert.equal(context.threadPolicy("two").approvalPolicy, "never");
  assert.equal(context.turnSandbox(null, "two").type, "dangerFullAccess");
  assert.equal(context.liveAccessMode("child-one"), "auto");
  assert.equal(context.liveAccessMode("side-one"), "auto");
  handlers.get("policy:set-mode")!({}, "ask", "one");
  for (const set of [context.axGrants, context.browserNetGrants, context.browserConnectGrants]) {
    assert.deepEqual([...set], ["two"], "only the affected conversation's session grants are revoked");
  }
  assert.equal(context.turnSandbox(null, "one").type, "readOnly");
  assert.equal(context.liveAccessMode("two"), "full");
  assert.throws(() => handlers.get("policy:set-mode")!({}, "invalid", "two"), /Invalid/);
  assert.equal(handlers.get("policy:get-modes")!({}, ["one", "two"]).threads.one, "ask");
});
