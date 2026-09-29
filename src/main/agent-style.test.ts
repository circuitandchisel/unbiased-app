import assert from "node:assert/strict";
import { test } from "node:test";
import { agentStyleInstructions, DEFAULT_AGENT_STYLE, parseAgentStylePrefs } from "../shared/agent-style";

test("style preferences default safely when missing or malformed", () => {
  assert.deepEqual(parseAgentStylePrefs(null), DEFAULT_AGENT_STYLE);
  assert.deepEqual(parseAgentStylePrefs({ outputDetail: "verbose", tone: 42, explanations: "technical" }), {
    outputDetail: "concise", tone: "direct", explanations: "technical",
  });
});

test("all supported style choices survive parsing", () => {
  assert.deepEqual(parseAgentStylePrefs({ outputDetail: "detailed", tone: "warm", explanations: "plain" }), {
    outputDetail: "detailed", tone: "warm", explanations: "plain",
  });
  assert.deepEqual(parseAgentStylePrefs({ outputDetail: "balanced", tone: "formal", explanations: "technical" }), {
    outputDetail: "balanced", tone: "formal", explanations: "technical",
  });
});

test("style instructions distinguish detail from explanation level and respect explicit requests", () => {
  const concise = agentStyleInstructions(DEFAULT_AGENT_STYLE);
  const detailed = agentStyleInstructions({ outputDetail: "detailed", tone: "formal", explanations: "technical" });
  assert.match(concise, /one or two short paragraphs/);
  assert.match(concise, /Briefly explain technical terms/);
  assert.match(detailed, /tradeoffs/);
  assert.match(detailed, /precise technical language/);
  assert.match(detailed, /user's explicit request/);
});
