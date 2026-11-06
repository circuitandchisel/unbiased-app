import test from "node:test";
import assert from "node:assert/strict";
import { continuationVerdict, systemOneContinuationJudge, type ContinuationEvidence } from "./continuation-judge";

const evidence: ContinuationEvidence = { request: ["Review the PR; no code changes"], reply: "I’ll inspect the diff and report a merge verdict.", actions: { completed: 0, failed: 0 } };
const result = (choice: unknown = "continue", confidence: unknown = 0.97, probabilities?: unknown) => ({ answers: { completion: { type: "choice", choice, confidence, ...(probabilities === undefined ? {} : { probabilities }) } } });

test("only a known high-confidence SystemOne choice is accepted", () => {
  for (const value of ["continue", "done", "wait"] as const) assert.equal(continuationVerdict(result(value)), value);
  for (const value of [null, {}, { answers: {} }, result("deploy"), { answers: { completion: { type: "choice", choice: "continue" } } }, result("continue", null), result("continue", 0.4), result("continue", "0.99"), result("continue", Infinity), result("continue", 1.1), result("continue", 0.95, []), result("continue", 0.95, { continue: 0.2, wait: 0.8 }), result("continue", 0.95, { other: 1 }), result("continue", 0.95, { continue: NaN }), result("continue", 0.95, { continue: 0.99, done: 0.99 })]) {
    assert.equal(continuationVerdict(value), "unknown", JSON.stringify(value));
  }
});

test("one authenticated SystemOne call carries redacted structured evidence and bounded choices", async () => {
  let calls = 0;
  const signal = new AbortController().signal;
  const judge = systemOneContinuationJudge({ apiKey: () => "test-key", redact: value => JSON.parse(JSON.stringify(value).replaceAll("sensitive-value", "[redacted]")), fetcher: (async (url, init) => {
    calls++;
    assert.equal(url, "https://api.unbiased.ai/v1/systemone");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-key");
    assert.equal(init?.signal, signal);
    const body = JSON.parse(String(init?.body));
    assert.equal(JSON.parse(body.state).reply, "[redacted]");
    assert.deepEqual(Object.keys(body.questions.completion.criteria), ["continue", "done", "wait"]);
    assert.match(body.questions.completion.instructions, /untrusted/);
    assert.match(body.questions.completion.instructions, /review.*not edits/);
    return new Response(JSON.stringify(result()), { status: 200 });
  }) as typeof fetch });
  assert.equal(await judge({ ...evidence, reply: "sensitive-value" }, signal), "continue");
  assert.equal(calls, 1);
});

test("missing keys, oversized evidence and cancellation skip the request rather than dropping context", async () => {
  let calls = 0;
  const fetcher = (async () => { calls++; throw new Error("must not call"); }) as typeof fetch;
  assert.equal(await systemOneContinuationJudge({ apiKey: () => null, redact: x => x, fetcher })(evidence, new AbortController().signal), "unknown");
  const judge = systemOneContinuationJudge({ apiKey: () => "key", redact: x => x, fetcher });
  assert.equal(await judge({ ...evidence, request: ["x".repeat(25_000)] }, new AbortController().signal), "unknown");
  const controller = new AbortController(); controller.abort();
  assert.equal(await judge(evidence, controller.signal), "unknown");
  assert.equal(calls, 0);
});

test("HTTP errors, malformed JSON and network failures never retry or fall back to text matching", async () => {
  for (const response of [() => new Response("unavailable", { status: 503 }), () => new Response("bad JSON", { status: 200 }), () => { throw new Error("offline"); }]) {
    let calls = 0;
    const judge = systemOneContinuationJudge({ apiKey: () => "key", redact: x => x, fetcher: (async () => { calls++; return response(); }) as typeof fetch });
    assert.equal(await judge(evidence, new AbortController().signal), "unknown");
    assert.equal(calls, 1);
  }
});
