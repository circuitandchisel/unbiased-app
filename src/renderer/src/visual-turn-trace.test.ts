import assert from "node:assert/strict";
import { test } from "node:test";
import { completedVisualOutput, finalAssistantForTurn, lastUserIndex, outputSignature, visualReadyElapsed } from "./visual-turn-trace";

test("output format comes from the displayed final answer, not earlier narration", () => {
  const entries = [
    { kind: "user", text: "Explain strings" },
    { kind: "assistant", text: "Here is how I will illustrate it." },
    { kind: "user", text: "Illustrate" },
    { kind: "assistant", text: "Let me make a diagram." },
    { kind: "assistant", text: 'root = Stack([TextContent("Strings")])' },
  ];
  assert.equal(lastUserIndex(entries), 2);
  assert.equal(lastUserIndex([]), -1);
  assert.deepEqual(finalAssistantForTurn(entries), { index: 4, text: entries[4].text });
  assert.deepEqual(completedVisualOutput(entries), {
    type: "openui", signature: outputSignature(entries[4].text),
  });
  assert.deepEqual(completedVisualOutput([{ kind: "user", text: "Hello" }]), { type: "none", signature: null });
});

test("visual readiness belongs to the final visual and a recent completed turn", () => {
  const info = {
    turnId: "turn-2", startedAt: 1000, totalMs: 4000, outputType: "openui",
    outputSignature: outputSignature("final visual"), visualReadyMs: null,
  };
  assert.equal(visualReadyElapsed(info, "turn-2", outputSignature("final visual"), 5142), 4142);
  assert.equal(visualReadyElapsed(info, "turn-1", outputSignature("final visual"), 5142), null);
  assert.equal(visualReadyElapsed(info, "turn-2", outputSignature("old visual"), 5142), null);
  assert.equal(visualReadyElapsed(info, "turn-2", outputSignature("final visual"), 61_590), null);
  assert.equal(visualReadyElapsed({ ...info, outputType: "text" }, "turn-2", info.outputSignature, 5142), null);
  assert.equal(visualReadyElapsed({ ...info, visualReadyMs: 4142 }, "turn-2", info.outputSignature, 5142), null);
});
