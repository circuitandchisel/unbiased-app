import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyVisualRoute, stripVisualRouteHint, visualRouteHint } from "./visual-route";

test("classifies a visual request and emits a removable advisory hint", async () => {
  let request: { state: string; questions: { visual: { instructions: string } } } | null = null;
  const fetcher = (async (_url: string, options: RequestInit) => {
    request = JSON.parse(String(options.body));
    return new Response(JSON.stringify({
      answers: { visual: { choice: "interactive", confidence: 0.91 } },
      latency_ms: 53,
      usage: { input_tokens: 170 },
    }), { status: 200 });
  }) as typeof fetch;
  const result = await classifyVisualRoute("Show an interactive Moon-phase slider", "test-key", fetcher);
  assert.equal(result.status, "classified");
  assert.equal(result.choice, "interactive");
  assert.equal(result.inputTokens, 170);
  assert.match(request!.questions.visual.instructions, /RECENT CONVERSATION/);
  const original = "Show an interactive Moon-phase slider";
  const withHint = original + visualRouteHint(result);
  assert.match(withHint, /App visual routing hint/);
  assert.equal(stripVisualRouteHint(withHint), original);
});

test("uncertain and failed decisions never steer the agent", async () => {
  const uncertain = await classifyVisualRoute("Explain DNS", "test-key", (async () =>
    new Response(JSON.stringify({ answers: { visual: { choice: "text", confidence: 0.61 } } }), { status: 200 })) as typeof fetch);
  assert.equal(uncertain.status, "uncertain");
  assert.equal(visualRouteHint(uncertain), null);

  const failed = await classifyVisualRoute("Explain DNS", "test-key", (async () =>
    new Response("unavailable", { status: 503 })) as typeof fetch);
  assert.equal(failed.status, "error");
  assert.equal(failed.detail, "HTTP 503");
  assert.equal(visualRouteHint(failed), null);
});

test("does not send more than bounded user text or call without credentials", async () => {
  let called = false;
  const fetcher = (async (_url: string, options: RequestInit) => {
    called = true;
    const body = JSON.parse(String(options.body)) as { state: string };
    assert.ok(body.state.length < 12_100);
    assert.match(body.state, /^CURRENT USER: start/);
    assert.match(body.state, /finish$/);
    return new Response(JSON.stringify({ answers: { visual: { choice: "text", confidence: 0.95 } } }), { status: 200 });
  }) as typeof fetch;
  const skipped = await classifyVisualRoute("hello", null, fetcher);
  assert.equal(skipped.status, "skipped");
  assert.equal(called, false);
  await classifyVisualRoute("start" + "x".repeat(20_000) + "finish", "test-key", fetcher);
  assert.equal(called, true);
});

test("explicit visual follow-ups bypass the classifier, including without an API key", async () => {
  let called = false;
  const fetcher = (async () => { called = true; throw new Error("should not call"); }) as typeof fetch;
  for (const request of ["Explain with a visual", "Explain how to fix a motorcycle chain to a 5 year old with visuals", "visually explain me how to play catan. I am a beginner", "Illustrate", "illustrate", "visualize"]) {
    const result = await classifyVisualRoute(request, null, fetcher);
    assert.equal(result.choice, "static", request);
    assert.equal(result.status, "classified");
    assert.equal(result.requestMs, 0);
    assert.match(visualRouteHint(result) ?? "", /Include an appropriate rendered visual/);
    assert.match(visualRouteHint(result) ?? "", /meaningful learner action/);
  }
  const interactive = await classifyVisualRoute("Create an interactive visual with a slider", null, fetcher);
  assert.equal(interactive.choice, "interactive");
  assert.equal(called, false);
});

test("ambiguous follow-up includes recent conversation but omits visual code", async () => {
  const fetcher = (async (_url: string, options: RequestInit) => {
    const { state } = JSON.parse(String(options.body)) as { state: string };
    assert.match(state, /USER: Explain string theory to a child/);
    assert.match(state, /ASSISTANT: Think of a tiny vibrating string/);
    assert.match(state, /CURRENT USER: Could you make that clearer\?/);
    assert.doesNotMatch(state, /root = Stack/);
    return new Response(JSON.stringify({ answers: { visual: { choice: "text", confidence: 0.92 } } }), { status: 200 });
  }) as typeof fetch;
  await classifyVisualRoute("Could you make that clearer?", "test-key", fetcher, [
    { role: "user", text: "Explain string theory to a child" },
    { role: "assistant", text: "Think of a tiny vibrating string\n```openui\nroot = Stack([])\n```" },
  ]);
});

test("a request against visuals is not treated as explicit visual intent", async () => {
  const result = await classifyVisualRoute("Explain it without a visual", "test-key", (async () =>
    new Response(JSON.stringify({ answers: { visual: { choice: "text", confidence: 0.94 } } }), { status: 200 })) as typeof fetch);
  assert.equal(result.choice, "text");
  assert.equal(result.requestMs >= 0, true);
  assert.notEqual(result.detail, "explicit visual request");
});
