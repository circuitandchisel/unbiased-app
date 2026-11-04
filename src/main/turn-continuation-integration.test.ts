import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";
import { TurnContinuation, CONTINUATION_INPUT, CONTINUATION_NOTICE } from "./turn-continuation";

function fixture(start?: () => Promise<unknown>) {
  const guard = new TurnContinuation(); guard.startTask("chat", "Proceed", false); guard.assistant("chat", "Now I'll run the tests.");
  const ticket = guard.completed("chat", "completed", true).offer!;
  const calls: Array<{ method: string; params: any }> = [];
  const pane = { threadId: "chat", turnId: null as string | null }, sender = {};
  let handler!: (event: any, input: any) => Promise<{ ok: boolean }>;
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const startAt = source.indexOf('  ipcMain.handle("chat:continue-unfinished",');
  const endAt = source.indexOf("  // Client-side transcript cache:", startAt);
  assert.ok(startAt > 0 && endAt > startAt);
  const context = { ipcMain: { handle: (_name: string, cb: typeof handler) => { handler = cb; } },
    win: { webContents: sender }, panes: { main: pane }, runningTurns: new Map(), planMode: false,
    lastStatus: { state: "connected" }, turnContinuation: guard, automaticTurnStarts: new Map(),
    pinTurnEnvironment: () => {}, turnEnvironments: { end: () => {} }, threadCwds: new Map([["chat", "/repo"]]),
    threadPolicy: () => ({ approvalPolicy: "on-request" }), turnSandbox: () => ({ type: "readOnly" }), CONTINUATION_INPUT,
    engine: { request: async (method: string, params: any) => { calls.push({ method, params }); return method === "turn/start" ? start ? start() : { turn: { id: "auto-turn" } } : {}; } },
  };
  runInNewContext(transformSync(source.slice(startAt, endAt), { loader: "ts" }).code, context);
  return { guard, ticket, pane, calls, context, invoke: (input: any = { paneId: "main", threadId: "chat", token: ticket.token }, actor = sender) => handler({ sender: actor }, input) };
}
test("production continuation IPC preserves current permissions and one-use thread ownership", async () => {
  const f = fixture();
  await assert.rejects(f.invoke(undefined, {}), /Only the app/);
  assert.equal((await f.invoke({ paneId: "main", threadId: "other", token: f.ticket.token })).ok, false);
  assert.equal((await f.invoke()).ok, true);
  assert.equal(f.calls[0].params.approvalPolicy, "on-request");
  assert.equal(f.calls[0].params.sandboxPolicy.type, "readOnly");
  assert.match(f.calls[0].params.input[0].text, /not a new user request/);
  assert.equal(f.pane.turnId, "auto-turn");
  assert.equal((await f.invoke()).ok, false); assert.equal(f.calls.length, 1);
});
test("Stop while automatic turn/start is in flight interrupts the returned turn", async () => {
  let finish!: (value: unknown) => void;
  const f = fixture(() => new Promise(resolve => { finish = resolve; }));
  const pending = f.invoke();
  assert.equal(f.context.automaticTurnStarts.has("chat"), true);
  f.guard.cancel("chat"); assert.equal(f.guard.startingCanceled("chat"), true);
  finish({ turn: { id: "canceled-auto" } });
  assert.equal((await pending).ok, false);
  assert.equal(f.calls[1].method, "turn/interrupt");
  assert.equal(f.calls[1].params.turnId, "canceled-auto");
  assert.equal(f.pane.turnId, null);
  assert.equal(f.context.automaticTurnStarts.has("chat"), false);
});
test("approval, input and browser handoffs during startup wait without interrupting the accepted turn", async () => {
  for (const boundary of ["approval", "input", "browser handoff"]) {
    let finish!: (value: unknown) => void;
    const f = fixture(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.invoke();
    f.guard.turnStarted("chat");
    f.context.runningTurns.set("chat", "awaiting-user");
    // These production request paths inhibit retries; unlike Stop, they
    // must keep the current turn alive for the user's response.
    f.guard.block("chat");
    assert.equal(f.guard.startingCanceled("chat"), false, boundary);
    finish({ turn: { id: "awaiting-user" } });
    assert.equal((await pending).ok, true, boundary);
    assert.equal(f.pane.turnId, "awaiting-user", boundary);
    assert.deepEqual(f.calls.map(c => c.method), ["turn/start"], boundary);
    f.guard.assistant("chat", "Now I'll run the next test.");
    assert.deepEqual(f.guard.completed("chat", "completed", true), {}, boundary);
    assert.equal(f.context.automaticTurnStarts.has("chat"), false);
  }
});
test("rejected automatic startup clears the live-turn marker", async () => {
  const f = fixture(async () => { throw new Error("startup failed"); });
  await assert.rejects(f.invoke(), /startup failed/);
  assert.equal(f.guard.turnStarted("chat"), false);
  assert.equal(f.context.automaticTurnStarts.has("chat"), false);
});
test("navigation, plan mode, disconnect and a newer active turn prevent automatic starts", async () => {
  for (const block of ["navigation", "plan", "disconnect", "running"]) {
    const f = fixture();
    if (block === "navigation") f.pane.threadId = "other";
    if (block === "plan") f.context.planMode = true;
    if (block === "disconnect") f.context.lastStatus.state = "exited";
    if (block === "running") f.context.runningTurns.set("chat", "user-turn");
    assert.equal((await f.invoke()).ok, false, block); assert.equal(f.calls.length, 0);
  }
});

test("cold transcript replay labels generated reminders as app status rather than user prompts", () => {
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const startAt = source.indexOf("function threadToEntries(");
  const endAt = source.indexOf("/** Small data-URL preview", startAt);
  const context: any = { readBrowserCaptureTurns: () => ({}), browserCaptureDir: () => "", epochMillis: (v: any) => v ?? null,
    collectBrowserCaptures: () => [], stripFileAttachmentContext: (v: string) => v, contentToText: (v: any[]) => v.map(p => p.text ?? "").join(""),
    CONTINUATION_INPUT, CONTINUATION_NOTICE,
  };
  runInNewContext(transformSync(source.slice(startAt, endAt), { loader: "ts" }).code, context);
  for (const input of [{ type: "userMessage", text: CONTINUATION_INPUT }, { type: "message", role: "user", content: [{ type: "input_text", text: CONTINUATION_INPUT }] }]) {
    const replay = context.threadToEntries({ id: "chat", turns: [{ id: "auto", items: [input, { type: "agentMessage", phase: "final_answer", text: "Done. Tests pass." }] }] });
    assert.equal(replay.entries.some((e: any) => e.kind === "user"), false);
    assert.equal(replay.entries[0].text, CONTINUATION_NOTICE);
    assert.equal(replay.entries[1].text, "Done. Tests pass.");
  }
});
