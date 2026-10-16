import assert from "node:assert/strict";
import test from "node:test";
import { nextVisualCheckpoint } from "./visual-checkpoint";

test("visual checkpoints advance for new sources and reset for a new turn", () => {
  const draft = nextVisualCheckpoint(undefined, "turn-a", "draft");
  assert.deepEqual(draft, { turnId: "turn-a", source: "draft", version: 1 });
  assert.equal(nextVisualCheckpoint(draft!, "turn-a", "draft"), null);
  const preview = nextVisualCheckpoint(draft!, "turn-a", "validated preview");
  assert.deepEqual(preview, { turnId: "turn-a", source: "validated preview", version: 2 });
  assert.deepEqual(nextVisualCheckpoint(preview!, "turn-b", "other"), {
    turnId: "turn-b", source: "other", version: 1,
  });
});
