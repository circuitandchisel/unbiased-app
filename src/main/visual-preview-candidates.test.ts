import assert from "node:assert/strict";
import { test } from "node:test";
import { VisualPreviewCandidates } from "./visual-preview-candidates";

test("a failed revision cannot discard the last accepted preview", () => {
  const store = new VisualPreviewCandidates();
  const candidate = {
    turnId: "turn-1",
    previewId: "preview-1",
    visual: { format: "visual-html" as const, source: "<svg></svg>" },
    review: { kind: "other" as const, goal: "Explain a visual", mustShow: ["A visible example"] },
    committed: false,
  };
  store.accept("thread-1", candidate);
  assert.equal(store.get("thread-1", "turn-1"), candidate);
  assert.equal(store.get("thread-1", "turn-2"), undefined);

  store.accept("thread-1", { ...candidate, previewId: "preview-2", committed: false });
  assert.equal(store.get("thread-1", "turn-1")?.previewId, "preview-2");
  store.clear("thread-1");
  assert.equal(store.get("thread-1", "turn-1"), undefined);
});
