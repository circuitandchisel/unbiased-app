import assert from "node:assert/strict";
import test from "node:test";
import { nextVisualDraft } from "./visual-draft";

test("draft versions replace only within their active turn", () => {
  const first = { turnId: "turn-a", source: "first", version: 1 };
  const second = { turnId: "turn-a", source: "second", version: 2 };
  assert.deepEqual(nextVisualDraft(null, first, "turn-a"), first);
  assert.deepEqual(nextVisualDraft(first, second, "turn-a"), second);
  assert.deepEqual(nextVisualDraft(second, first, "turn-a"), second);
  assert.deepEqual(nextVisualDraft(second, { turnId: "turn-b", source: "late", version: 3 }, "turn-a"), second);
  assert.equal(nextVisualDraft(null, first, null), null);
});
