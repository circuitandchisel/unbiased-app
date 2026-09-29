import assert from "node:assert/strict";
import { test } from "node:test";
import { finalAssistantIndices } from "./transcript-actions";

test("interrupted turns only offer copy on the last assistant message", () => {
  const entries = [
    { kind: "user", text: "Tell me a story" },
    { kind: "assistant", text: "I will ask a sub-agent." },
    { kind: "agent", event: "created" },
    { kind: "assistant", text: "The agent is working." },
  ];
  assert.deepEqual([...finalAssistantIndices(entries)], [3]);
});

test("each completed turn retains one copy action", () => {
  const entries = [
    { kind: "user", text: "First" },
    { kind: "work" },
    { kind: "assistant", text: "First answer" },
    { kind: "user", text: "Second" },
    { kind: "assistant", text: "Progress note" },
    { kind: "assistant", text: "Second answer" },
  ];
  assert.deepEqual([...finalAssistantIndices(entries)].sort((a, b) => a - b), [2, 5]);
});

test("empty messages and app notices do not displace the last answer", () => {
  const entries = [
    { kind: "user", text: "Question" },
    { kind: "assistant", text: "Answer" },
    { kind: "assistant", text: "" },
    { kind: "assistant", text: "⚠ Turn failed" },
  ];
  assert.deepEqual([...finalAssistantIndices(entries)], [1]);
});
