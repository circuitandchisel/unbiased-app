import test from "node:test";
import assert from "node:assert/strict";
import { TurnContinuation, CONTINUATION_LIMIT } from "./turn-continuation";
import type { ContinuationEvidence, ContinuationJudge, ContinuationVerdict } from "./continuation-judge";

const promise = "I’ll review PR #189 and report a merge verdict. No code changes.";
const yes: ContinuationJudge = async () => "continue";
function task(judge: ContinuationJudge = yes, timeoutMs?: number) {
  const guard = new TurnContinuation(judge, timeoutMs);
  guard.startTask("chat", "Review the PR and tell me if it is good to merge", false);
  guard.turnStarted("chat"); guard.assistant("chat", promise);
  return guard;
}

test("SystemOne decides semantics without request or response keyword gates", async () => {
  let evidence!: ContinuationEvidence;
  const guard = task(async input => { evidence = input; return "continue"; });
  guard.startTask("chat", "Agreed. Proceed with this sequence,.", false);
  guard.turnStarted("chat"); guard.action("chat", false); guard.action("chat", true);
  guard.assistant("chat", "The image used pre-fix sources. I’ll rebuild it and rerun the script once.");
  assert.ok((await guard.completed("chat", "completed", true)).offer);
  assert.deepEqual(evidence.request, ["Agreed. Proceed with this sequence,."]);
  assert.equal(evidence.previousExchange?.reply, promise);
  assert.deepEqual(evidence.actions, { completed: 2, failed: 1 });
  assert.equal((await task().completed("chat", "completed", true)).offer?.attempt, 1, "merge verdict is not vetoed by a text match");
});

test("done, wait, uncertain and thrown classifier results never issue tickets", async () => {
  for (const verdict of ["done", "wait", "unknown"] as const) {
    const guard = task(async () => verdict);
    assert.deepEqual(await guard.completed("chat", "completed", true), {});
    assert.equal(guard.claim("chat", "invented"), null);
  }
  assert.deepEqual(await task(async () => { throw new Error("unavailable"); }).completed("chat", "completed", true), {});
});

test("host deadline bounds a judge that ignores abort and never resolves", async () => {
  let signal!: AbortSignal;
  const guard = task(async (_input, s) => { signal = s; return new Promise(() => {}); }, 15);
  assert.deepEqual(await guard.completed("chat", "completed", true), {});
  assert.equal(signal.aborted, true);
});

test("Stop, approval/input and shutdown abort pending classification without waiting for the provider", async () => {
  for (const boundary of ["stop", "block", "reset"]) {
    let finish!: (v: ContinuationVerdict) => void;
    let signal!: AbortSignal;
    const guard = task(async (_evidence, s) => { signal = s; return new Promise(resolve => { finish = resolve; }); });
    const pending = guard.completed("chat", "completed", true);
    await Promise.resolve();
    if (boundary === "stop") guard.cancel("chat");
    else if (boundary === "block") guard.block("chat");
    else guard.reset();
    assert.equal(signal.aborted, true, boundary);
    assert.equal((await pending).offer, undefined);
    finish("continue");
    assert.equal(guard.claim("chat", "invented"), null);
  }
});

test("a late classification cannot authorize a new user task, new turn or replacement reply", async () => {
  for (const change of ["request", "turn", "reply"]) {
    let finish!: (v: ContinuationVerdict) => void;
    const guard = task(async () => new Promise(resolve => { finish = resolve; }));
    const pending = guard.completed("chat", "completed", true); await Promise.resolve();
    if (change === "request") guard.startTask("chat", "Explain this instead", false);
    else if (change === "turn") guard.turnStarted("chat");
    else guard.assistant("chat", "Done. Here is the result.");
    assert.deepEqual(await pending, { stale: true });
    finish("continue");
    assert.equal(guard.claim("chat", "invented"), null);
  }
});

test("failures, interrupted turns, plan mode, blocked tasks, missing text and ineligible jobs skip classification", async () => {
  let calls = 0;
  for (const setup of ["failed", "interrupted", "plan", "blocked", "empty", "ineligible", "no request"]) {
    const guard = task(async () => { calls++; return "continue"; });
    if (setup === "plan") { guard.startTask("chat", "Run tests", true); guard.assistant("chat", promise); }
    if (setup === "blocked") guard.block("chat");
    if (setup === "empty") guard.turnStarted("chat");
    if (setup === "no request") { guard.startTask("chat", [], false); guard.assistant("chat", promise); }
    assert.deepEqual(await guard.completed("chat", ["failed", "interrupted"].includes(setup) ? setup : "completed", setup !== "ineligible"), {});
  }
  assert.equal(calls, 0);
});

test("duplicate completion notifications classify once and cannot issue a second ticket", async () => {
  let calls = 0;
  const guard = task(async () => { calls++; return "continue"; });
  const pending = guard.completed("chat", "completed", true);
  assert.deepEqual(await guard.completed("chat", "completed", true), { stale: true });
  assert.ok((await pending).offer);
  assert.deepEqual(await guard.completed("chat", "completed", true), { stale: true });
  assert.equal(calls, 1);
});

test("host enforces two retries, scoped one-use tickets, and reports exhaustion only for unfinished work", async () => {
  let verdict: ContinuationVerdict = "continue";
  const guard = task(async () => verdict);
  for (let i = 1; i <= CONTINUATION_LIMIT; i++) {
    const offer = (await guard.completed("chat", "completed", true)).offer!;
    assert.equal(offer.attempt, i);
    assert.equal(guard.claim("other", offer.token), null);
    assert.equal(guard.claim("chat", "invented"), null);
    const claim = guard.claim("chat", offer.token)!;
    assert.equal(guard.claim("chat", offer.token), null);
    guard.turnStarted("chat"); guard.started("chat", claim.signal);
    guard.assistant("chat", promise);
  }
  assert.deepEqual(await guard.completed("chat", "completed", true), { exhausted: true });
  guard.turnStarted("chat"); guard.assistant("chat", "Done."); verdict = "done";
  assert.deepEqual(await guard.completed("chat", "completed", true), {});
});

test("issued tickets expire and cancellation invalidates them", async t => {
  let now = 1000; t.mock.method(Date, "now", () => now);
  const guard = task(); const ticket = (await guard.completed("chat", "completed", true)).offer!;
  now += 30_001; assert.equal(guard.claim("chat", ticket.token), null);
  for (const boundary of ["stop", "block", "new request", "reset"]) {
    const guard = task(); const ticket = (await guard.completed("chat", "completed", true)).offer!;
    if (boundary === "stop") guard.cancel("chat");
    else if (boundary === "block") guard.block("chat");
    else if (boundary === "reset") guard.reset();
    else guard.startTask("chat", "Explain", false);
    assert.equal(guard.claim("chat", ticket.token), null);
  }
});

test("startup event ordering and approval waiting preserve automatic-turn markers", async () => {
  for (const eventFirst of [true, false]) {
    const guard = task(); const ticket = (await guard.completed("chat", "completed", true)).offer!;
    const claim = guard.claim("chat", ticket.token)!;
    if (!eventFirst) guard.started("chat", claim.signal);
    assert.equal(guard.turnStarted("chat"), true);
    if (eventFirst) guard.started("chat", claim.signal);
    guard.block("chat"); assert.equal(claim.signal.aborted, false);
    guard.assistant("chat", "Done."); await guard.completed("chat", "completed", true);
    assert.equal(guard.turnStarted("chat"), false);
  }
  const guard = task(); const ticket = (await guard.completed("chat", "completed", true)).offer!;
  const claim = guard.claim("chat", ticket.token)!; guard.cancel("chat");
  assert.equal(claim.signal.aborted, true); assert.equal(guard.startingCanceled("chat"), true);
  guard.started("chat", claim.signal, false); assert.equal(guard.turnStarted("chat"), false);
});
