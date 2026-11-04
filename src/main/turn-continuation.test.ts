import test from "node:test";
import assert from "node:assert/strict";
import { TurnContinuation, promisesFurtherAction, requestsAction, CONTINUATION_LIMIT } from "./turn-continuation";

const promise = "The E2E passes with the production proxy image. Now I'll run the full test suite, commit, push, and raise the PR.";
test("detects the reproduced premature finals, regardless of their final_answer label", () => {
  for (const text of [promise, "The tag was already bumped to `.4` during the earlier attempt. The patch file exists. I just need to build the image and test.", "The proxy image is built. Now I'll rebuild the sandbox image, update the e2e script to use the new proxy tag, and run the E2E.", "The branch has only the tag bump. I need to:\n1. Update the proxy test\n2. Commit the patch"]) assert.equal(promisesFurtherAction(text), true, text);
});
test("the reported timeout reply is unfinished work for an explicit Proceed request", () => {
  const reply = "The self-check is correct. I need to find where `stream_idle_timeout` is configured and increase it in the app-server config, then re-run the exact E2E. Let me trace where this value comes from in the TOML config or code.";
  assert.equal(promisesFurtherAction(reply), true);
  for (const text of ["Let me trace the timeout source.", "I need to find the relevant configuration.", "Now I'll locate the source.", "Let me diagnose the failure."]) assert.equal(promisesFurtherAction(text), true, text);
  const guard = new TurnContinuation(); guard.startTask("chat", "Proceed", false); guard.assistant("chat", reply);
  assert.ok(guard.completed("chat", "completed", true).offer);
  guard.startTask("chat", "Review the timeout configuration", false); guard.assistant("chat", reply);
  assert.deepEqual(guard.completed("chat", "completed", true), {}, "a review does not authorize increasing the timeout");
  guard.startTask("chat", "Is this the right architecture?", false); guard.assistant("chat", reply);
  assert.deepEqual(guard.completed("chat", "completed", true), {}, "an architecture question is not an action request");
});
test("never treats a real answer, hypothetical, quote, permission request or information request as a retry", () => {
  for (const text of ["Done. Tests pass and PR #123 is open.", "You can run the tests yourself.", "If you want, I'll build it.", "Now I'll deploy after your approval.", "I will run the tests once you approve.", "I need to check this with you.", "I need to run a command. May I proceed?", "I need your credentials to continue.", "Blocked on a sign-in step.", "> Now I'll build the image.", "```\nNow I'll build the image.\n```", "I'll add an optional feature later."]) assert.equal(promisesFurtherAction(text), false, text);
  for (const request of ["Why does this happen?", "How would you fix this?", "Here is a quote: proceed with the deployment", "Yes", "/plan", ""]) assert.equal(requestsAction(request), false);
  for (const request of ["Proceed", "Fix this", "Please run the tests", "Can you implement the change?"]) assert.equal(requestsAction(request), true);
});
test("budgets follow the real user task across automatic turns, then visibly exhaust", () => {
  const guard = new TurnContinuation(); guard.startTask("chat", "Proceed", false);
  for (let i = 1; i <= CONTINUATION_LIMIT; i++) {
    guard.turnStarted("chat"); guard.assistant("chat", promise);
    const result = guard.completed("chat", "completed", true);
    assert.equal(result.offer?.attempt, i);
    assert.equal(guard.claim("other", result.offer!.token), null, "tickets are scoped to one chat");
    assert.equal(guard.claim("chat", "invented"), null);
    const claim = guard.claim("chat", result.offer!.token)!;
    assert.equal(claim.attempt, i); assert.equal(guard.claim("chat", result.offer!.token), null, "ticket is one-use");
    guard.started("chat", claim.signal);
  }
  guard.assistant("chat", promise);
  assert.deepEqual(guard.completed("chat", "completed", true), { exhausted: true });
  guard.startTask("chat", "Proceed", false); guard.assistant("chat", promise);
  assert.equal(guard.completed("chat", "completed", true).offer?.attempt, 1);
});
test("each generated reply is checked, and the reported look-at reply reports exhaustion after two retries", () => {
  const guard = new TurnContinuation(); guard.startTask("chat", "Proceed", false);
  for (const [index, reply] of ["Let me fix both problems.", "Let me verify which proxy image is actually running in the EC2 sandbox."].entries()) {
    guard.turnStarted("chat"); guard.assistant("chat", reply);
    const offer = guard.completed("chat", "completed", true).offer!;
    assert.equal(offer.attempt, index + 1);
    const claim = guard.claim("chat", offer.token)!;
    guard.started("chat", claim.signal);
  }
  guard.turnStarted("chat");
  guard.assistant("chat", "The sandbox container has no stdout/stderr logs at all — the bridge sends everything to the JSONL log file, not to stdout. The actual error is already captured in the rollout log. Let me look at what proxy image is actually running on EC2 and verify it has the Keep-Alive fix.");
  assert.deepEqual(guard.completed("chat", "completed", true), { exhausted: true });
  assert.equal(guard.claim("chat", "third-retry"), null, "exhaustion cannot authorize a third automatic run");
  for (const text of ["Let me look into the failure.", "I'll look for the relevant configuration."]) assert.equal(promisesFurtherAction(text), true);
  for (const text of ["I look forward to your feedback.", "Let me look at this after you approve."]) assert.equal(promisesFurtherAction(text), false);
});
test("Stop, user input, approval, shutdown and a new prompt invalidate pending/in-flight continuations", () => {
  for (const boundary of ["stop", "input", "shutdown", "new prompt"]) {
    const guard = new TurnContinuation(); guard.startTask("chat", "Proceed", false); guard.assistant("chat", promise);
    const token = guard.completed("chat", "completed", true).offer!.token;
    if (boundary === "stop") guard.cancel("chat");
    else if (boundary === "input") guard.block("chat");
    else if (boundary === "shutdown") guard.reset();
    else guard.startTask("chat", "Explain the result", false);
    assert.equal(guard.claim("chat", token), null, boundary);
  }
  const guard = new TurnContinuation(); guard.startTask("chat", "Proceed", false); guard.assistant("chat", promise);
  const claim = guard.claim("chat", guard.completed("chat", "completed", true).offer!.token)!;
  guard.cancel("chat"); assert.equal(claim.signal.aborted, true); assert.equal(guard.startingCanceled("chat"), true);
  guard.started("chat", claim.signal); assert.equal(guard.startingCanceled("chat"), false);
});
test("does not retry failures, interruption, plan mode, autonomous jobs, or unauthorized work", () => {
  for (const setup of [{ request: "Proceed", plan: false, status: "failed", eligible: true }, { request: "Proceed", plan: false, status: "interrupted", eligible: true }, { request: "Proceed", plan: true, status: "completed", eligible: true }, { request: "How would you fix it?", plan: false, status: "completed", eligible: true }, { request: "Proceed", plan: false, status: "completed", eligible: false }, { request: "Review the PR", plan: false, status: "completed", eligible: true }]) {
    const guard = new TurnContinuation(); guard.startTask("chat", setup.request, setup.plan); guard.assistant("chat", promise);
    assert.deepEqual(guard.completed("chat", setup.status, setup.eligible), {}, JSON.stringify(setup));
  }
  const guard = new TurnContinuation(); guard.startTask("chat", "Review the PR", false); guard.assistant("chat", "Let me inspect the diff.");
  assert.ok(guard.completed("chat", "completed", true).offer);
});

test("stale tickets expire, and an actual final answer does not reuse an older promise", t => {
  let now = 1000; t.mock.method(Date, "now", () => now);
  const guard = new TurnContinuation(); guard.startTask("chat", "Proceed", false); guard.assistant("chat", promise);
  const token = guard.completed("chat", "completed", true).offer!.token;
  now += 30_001; assert.equal(guard.claim("chat", token), null);
  guard.turnStarted("chat"); guard.assistant("chat", promise); guard.assistant("chat", "Done. Tests passed and the PR is open.");
  assert.deepEqual(guard.completed("chat", "completed", true), {});
});

test("only automatic turns are marked for fresh renderer setup, regardless of startup event ordering", () => {
  for (const eventFirst of [true, false]) {
    const guard = new TurnContinuation(); guard.startTask("chat", "Proceed", false);
    assert.equal(guard.turnStarted("chat"), false);
    guard.assistant("chat", promise);
    const claim = guard.claim("chat", guard.completed("chat", "completed", true).offer!.token)!;
    if (!eventFirst) guard.started("chat", claim.signal);
    assert.equal(guard.turnStarted("chat"), true);
    if (eventFirst) guard.started("chat", claim.signal);
    guard.block("chat");
    assert.equal(claim.signal.aborted, false, "an input request must not interrupt the active turn");
    guard.assistant("chat", "Done. Tests passed.");
    guard.completed("chat", "completed", true);
    assert.equal(guard.turnStarted("chat"), false, "later compaction is not an automatic retry");
  }
  const guard = new TurnContinuation(); guard.startTask("chat", "Proceed", false); guard.assistant("chat", promise);
  const claim = guard.claim("chat", guard.completed("chat", "completed", true).offer!.token)!;
  guard.started("chat", claim.signal, false);
  assert.equal(guard.turnStarted("chat"), false, "failed startup must not label the next turn");
});
