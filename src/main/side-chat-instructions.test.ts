import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";
import { SideChatRecents } from "./side-chat-recents";
import { sideChatInstructions } from "./side-chat-start";

test("cold and catalog resumes preserve the side-chat boundary without applying it to the parent", async () => {
  const recents = new SideChatRecents();
  recents.register({ paneId: "side:one", threadId: "child", parentThreadId: "parent", cwd: "/repo", baselineTurns: 3, title: "Hello" });
  recents.close("side:one");
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const start = source.indexOf("async function resumeParamsFor(");
  const end = source.indexOf("// Project identity", start);
  assert.ok(start >= 0 && end > start);
  const invalidated: string[] = [];
  const context: any = {
    serverToolSessions: { invalidate: (id: string) => invalidated.push(id) },
    threadPolicy: () => ({ approvalPolicy: "on-request" }),
    threadCwds: new Map([["parent", "/repo"], ["child", "/repo"]]),
    developerInstructionsFor: (_cwd: string, id: string) => `Instructions for ${id}`,
    sideChatRecents: recents,
    sideChatInstructions,
    mcpOverrideFor: (id: string) => ({ selection: id }),
  };
  runInNewContext(transformSync(source.slice(start, end), { loader: "ts" }).code, context);
  const resumed = await context.resumeParamsFor("child");
  assert.equal(resumed.developerInstructions, sideChatInstructions("Instructions for child"));
  assert.equal(resumed.config.selection, "child");
  assert.equal(resumed.approvalPolicy, "on-request");
  recents.reopen("side:one", "parent");
  assert.equal((await context.resumeParamsFor("child")).developerInstructions, resumed.developerInstructions);
  assert.equal((await context.resumeParamsFor("parent")).developerInstructions, "Instructions for parent");
  assert.deepEqual(invalidated, ["child", "child", "parent"]);
});

test("reopening detaches only the closed side thread after its interrupt before applying resume overrides", async () => {
  const recents = new SideChatRecents();
  recents.register({ paneId: "side:one", threadId: "child", parentThreadId: "parent", cwd: "/repo", baselineTurns: 3, title: "Hello" });
  recents.close("side:one");
  let finishInterrupt!: () => void;
  const interrupt = new Promise<void>(resolve => { finishInterrupt = resolve; });
  const calls: { method: string; threadId: string }[] = [];
  let reopen!: (_event: unknown, paneId: string) => Promise<unknown>;
  const context: any = {
    ipcMain: { handle: (_name: string, handler: typeof reopen) => { reopen = handler; } },
    sideChatReopens: new Set(), sideChatRecents: recents,
    panes: { main: { threadId: "parent" } }, mainOpenSequence: 1,
    threadCwds: new Map(), sideChatInterrupts: new Map([["child", interrupt]]),
    engine: { request: async (method: string, params: { threadId: string }) => {
      calls.push({ method, threadId: params.threadId });
      return method === "thread/resume" ? { thread: { turns: [] } } : { status: "unsubscribed" };
    } },
    resumeParamsFor: async (threadId: string) => ({ threadId, developerInstructions: sideChatInstructions("child policy") }),
    threadToEntries: () => ({ entries: [] }),
    openTranscriptSession: async () => ({ sessionId: "restored", entries: [] }),
    transcriptSessions: new Map(), saveSideChatRecents: () => {}, console,
  };
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const start = source.indexOf('  ipcMain.handle("side:reopen",');
  const end = source.indexOf('  ipcMain.handle("side:reset",', start);
  assert.ok(start >= 0 && end > start);
  runInNewContext(transformSync(source.slice(start, end), { loader: "ts" }).code, context);
  const result = reopen({}, "side:one");
  assert.deepEqual(calls, []);
  finishInterrupt();
  await result;
  assert.deepEqual(calls, [
    { method: "thread/unsubscribe", threadId: "child" },
    { method: "thread/resume", threadId: "child" },
  ]);
  assert.equal(context.panes["side:one"].threadId, "child");
  assert.equal(context.panes.main.threadId, "parent");
});
