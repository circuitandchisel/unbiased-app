import assert from "node:assert/strict";
import { test } from "node:test";
import { settleTurnOutput } from "./turn-completion";

test("a completed turn with output stays nonempty when a queued send resets the live flag", () => {
  const completedTurnProduced = true;
  const outcome = settleTurnOutput("completed", false, completedTurnProduced, 1);
  let liveProduced = completedTurnProduced;
  liveProduced = false; // The next queued turn starts before React applies the previous update.
  assert.equal(liveProduced, false);
  assert.deepEqual(outcome, { empty: false, persistent: false, emptyStreak: 0 });
});

test("only completed turns with no output increase the empty-response streak", () => {
  assert.deepEqual(settleTurnOutput("completed", false, false, 0), {
    empty: true, persistent: false, emptyStreak: 1,
  });
  assert.deepEqual(settleTurnOutput("completed", false, false, 1), {
    empty: true, persistent: true, emptyStreak: 2,
  });
  for (const [status, narrated] of [["failed", false], ["interrupted", false], ["completed", true]] as const) {
    assert.deepEqual(settleTurnOutput(status, narrated, false, 1), {
      empty: false, persistent: false, emptyStreak: 1,
    });
  }
});
