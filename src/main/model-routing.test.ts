import { test } from "node:test";
import assert from "node:assert/strict";
import { APP_MODEL, FALLBACK_MODEL, ModelRouting, canFallback } from "./model-routing";

type Params = Record<string, unknown>;
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const unavailable = { codexErrorInfo: { httpConnectionFailed: { httpStatusCode: 404 } } };
const done = (id = "turn-1", status = "failed", error: unknown = unavailable, threadId = "thread") => ({
  method: "turn/completed", params: { threadId, turn: { id, status, error } },
});
function fixture(send?: (method: string, params: Params, n: number) => Promise<unknown>) {
  const calls: { method: string; params: Params }[] = [];
  const emitted: any[] = [];
  const routing = new ModelRouting(async (method, params) => {
    calls.push({ method, params });
    return send ? send(method, params, calls.length) : { turn: { id: `turn-${calls.length}` } };
  }, message => emitted.push(message));
  return { routing, calls, emitted };
}

test("conversation entry points explicitly request the preview, preserving other settings", async () => {
  assert.equal(APP_MODEL, "pareto-26.10-preview");
  for (const method of ["thread/start", "thread/resume", "thread/fork", "turn/start"]) {
    const { routing, calls } = fixture();
    const params = Object.freeze({ threadId: "thread", model: "pareto", config: { mcp_servers: {} }, approvalPolicy: "on-request" });
    await routing.request(method, params);
    assert.deepEqual(calls[0].params, { ...params, model: APP_MODEL });
    assert.equal(params.model, "pareto");
  }
});

test("non-model requests are unchanged", async () => {
  const { routing, calls } = fixture();
  for (const method of ["initialize", "thread/read", "model/list", "thread/compact/start", "turn/steer", "turn/interrupt"]) {
    const params = { threadId: "thread", marker: method };
    await routing.request(method, params);
    assert.equal(calls.at(-1)!.params, params);
  }
});

test("service errors qualify; auth, quota, context, local failures, and malformed errors do not", () => {
  for (const code of [null, 404, 408, 500, 502, 503, 504]) {
    for (const type of ["httpConnectionFailed", "responseStreamConnectionFailed", "responseStreamDisconnected", "responseTooManyFailedAttempts"]) {
      assert(canFallback({ codexErrorInfo: { [type]: { httpStatusCode: code } } }));
    }
  }
  assert(canFallback({ codexErrorInfo: "serverOverloaded" }));
  for (const code of [undefined, 200, 400, 401, 403, 413, 422, 429]) {
    assert(!canFallback({ codexErrorInfo: { httpConnectionFailed: { httpStatusCode: code } } }));
  }
  for (const info of [undefined, null, {}, "unauthorized", "contextWindowExceeded", "usageLimitExceeded", "rateLimitExceeded", "sessionBudgetExceeded", "sandboxError", "internalServerError", "badRequest", "other", { activeTurnNotSteerable: { turnKind: "compact" } }]) {
    assert(!canFallback({ codexErrorInfo: info }));
  }
  assert(!canFallback({ message: "please retry model not found" }));
});

test("a failed preview turn continues once on pareto without duplicating input or one-shot context", async () => {
  const { routing, calls, emitted } = fixture();
  await routing.request("turn/start", {
    threadId: "thread", input: [{ type: "text", text: "Do the task" }],
    clientUserMessageId: "original", additionalContext: [{ text: "one-shot" }],
    approvalPolicy: "on-request", sandboxPolicy: { type: "readOnly" }, effort: "none", cwd: "/tmp",
  });
  routing.notification({ method: "item/completed", params: { threadId: "thread", turnId: "turn-1", item: { type: "userMessage" } } });
  routing.notification(done());
  await tick();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], { method: "turn/start", params: {
    threadId: "thread", model: FALLBACK_MODEL, input: [],
    approvalPolicy: "on-request", sandboxPolicy: { type: "readOnly" }, effort: "none", cwd: "/tmp",
  } });
  assert(!emitted.some(m => m.method === "turn/completed"));
  routing.notification(done("turn-2", "failed"));
  await tick();
  assert.equal(calls.length, 2, "the fallback cannot retry again");
  assert.equal(emitted.at(-1).params.turn.id, "turn-2");
  await routing.request("turn/start", { threadId: "thread", input: [] });
  assert.equal(calls[2].params.model, APP_MODEL, "next user turn tries the preview again");
});

test("all partial model output, tool activity, and approval requests disable automatic recovery", async () => {
  const progress = [
    { method: "item/agentMessage/delta", params: { delta: "Partial answer" } },
    { method: "item/started", params: { item: { type: "reasoning" } } },
    { method: "item/started", params: { item: { type: "commandExecution" } } },
    { method: "item/completed", params: { item: { type: "fileChange" } } },
  ];
  for (const event of progress) {
    const { routing, calls, emitted } = fixture();
    await routing.request("turn/start", { threadId: "thread", input: [] });
    routing.notification({ ...event, params: { ...event.params, threadId: "thread", turnId: "turn-1" } });
    routing.notification(done()); await tick();
    assert.equal(calls.length, 1); assert.equal(emitted.at(-1).method, "turn/completed");
  }
  for (const params of [{ threadId: "thread" }, {}]) {
    const { routing, calls } = fixture();
    await routing.request("turn/start", { threadId: "thread", input: [] });
    routing.serverRequest(params); routing.notification(done()); await tick();
    assert.equal(calls.length, 1);
  }
});

test("cancel before completion never falls back", async () => {
  const { routing, calls } = fixture();
  await routing.request("turn/start", { threadId: "thread", input: [] });
  await routing.request("turn/interrupt", { threadId: "thread", turnId: "turn-1" });
  routing.notification(done()); await tick();
  assert.equal(calls.filter(c => c.method === "turn/start").length, 1);
});

test("cancel during the retry scheduling gap stops recovery and settles the UI as interrupted", async () => {
  const { routing, calls, emitted } = fixture();
  await routing.request("turn/start", { threadId: "thread", input: [] });
  routing.notification(done());
  await routing.request("turn/interrupt", { threadId: "thread", turnId: "turn-1" });
  assert.equal(calls.length, 1);
  assert.equal(emitted.at(-1).params.turn.status, "interrupted");
});

test("cancel while recovery is starting targets the replacement turn", async () => {
  let resolveRetry!: (value: unknown) => void;
  const { routing, calls } = fixture(async (_method, _params, n) => n === 2
    ? new Promise(resolve => { resolveRetry = resolve; }) : { turn: { id: `turn-${n}` } });
  await routing.request("turn/start", { threadId: "thread", input: [] });
  routing.notification(done()); await tick();
  const cancelled = routing.request("turn/interrupt", { threadId: "thread", turnId: "turn-1" });
  routing.notification({ method: "turn/started", params: { threadId: "thread", turn: { id: "replacement" } } });
  resolveRetry({ turn: { id: "replacement" } }); await cancelled;
  assert.deepEqual(calls.at(-1), { method: "turn/interrupt", params: { threadId: "thread", turnId: "replacement" } });
});

test("RPC failures and unsuccessful fallback admission surface without loops", async () => {
  const f = fixture(async (_m, _p, n) => { if (n === 2) throw new Error("busy"); return { turn: { id: "turn-1" } }; });
  await f.routing.request("turn/start", { threadId: "thread", input: [] });
  const original = done(); f.routing.notification(original); await tick();
  assert.equal(f.calls.length, 2); assert.equal(f.emitted.at(-1), original);
  const bad = fixture(async () => { throw new Error("ActiveTurnNotSteerable Compact"); });
  await assert.rejects(bad.routing.request("turn/start", { threadId: "thread", input: [] }), /Compact/);
  bad.routing.notification(done()); await tick(); assert.equal(bad.calls.length, 1);
});

test("completed/interrupted turns and context failures never recover", async () => {
  for (const event of [done("turn-1", "completed"), done("turn-1", "interrupted"), done("turn-1", "failed", { codexErrorInfo: "contextWindowExceeded" })]) {
    const { routing, calls, emitted } = fixture();
    await routing.request("turn/start", { threadId: "thread", input: [] });
    routing.notification(event); await tick(); assert.equal(calls.length, 1); assert.equal(emitted.at(-1), event);
  }
});

test("stale and untracked turns cannot trigger a retry; threads are isolated", async () => {
  const { routing, calls } = fixture();
  await routing.request("turn/start", { threadId: "thread", input: [] });
  routing.notification(done("old")); routing.notification(done("turn-1", "failed", unavailable, "other")); await tick();
  assert.equal(calls.length, 1);
  routing.notification({ method: "item/started", params: { threadId: "other", item: { type: "commandExecution" } } });
  routing.notification(done()); await tick(); assert.equal(calls.length, 2);
});

test("reset prevents deferred retries from escaping into another engine process", async () => {
  const { routing, calls } = fixture();
  await routing.request("turn/start", { threadId: "thread", input: [] });
  routing.notification(done()); routing.reset(); await tick(); assert.equal(calls.length, 1);
});

test("new input during recovery cancels the deferred retry and is not lost", async () => {
  const { routing, calls, emitted } = fixture();
  await routing.request("turn/start", { threadId: "thread", input: [] }); routing.notification(done());
  await routing.request("turn/start", { threadId: "thread", input: [{ type: "text", text: "New request" }] });
  assert.equal(calls.length, 2); assert.equal(calls[1].params.model, APP_MODEL);
  assert.deepEqual(calls[1].params.input, [{ type: "text", text: "New request" }]);
  assert.equal(emitted[0].params.turn.status, "failed");
});

test("engine-owned tool-output continuations never auto-replay", async () => {
  const { routing, calls } = fixture();
  await routing.request("turn/start", { threadId: "thread", input: [], toolOutput: { name: "write_file", output: "done" } });
  routing.notification(done()); await tick(); assert.equal(calls.length, 1);
});

test("a steer arriving during fallback admission targets the replacement turn", async () => {
  let resolveRetry!: (value: unknown) => void;
  const { routing, calls } = fixture(async (_method, _params, n) => n === 2
    ? new Promise(resolve => { resolveRetry = resolve; }) : { turn: { id: `turn-${n}` } });
  await routing.request("turn/start", { threadId: "thread", input: [] });
  routing.notification(done()); await tick();
  const steered = routing.request("turn/steer", { threadId: "thread", expectedTurnId: "turn-1", input: [{ type: "text", text: "New direction" }] });
  resolveRetry({ turn: { id: "replacement" } }); await steered;
  assert.equal(calls.at(-1)!.params.expectedTurnId, "replacement");
  assert.deepEqual(calls.at(-1)!.params.input, [{ type: "text", text: "New direction" }]);
});
