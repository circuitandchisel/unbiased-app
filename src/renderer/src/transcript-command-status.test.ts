import assert from "node:assert/strict";
import { test } from "node:test";
import { appendCommandOutputDelta, commandStatusAfterEvent, settleTurnSteps, settleUnconfirmedSteps, showsCommandOutputPanel } from "./transcript-command-status";

test("a running shell command has an output panel before its first output", () => {
  assert.equal(showsCommandOutputPanel({ status: "inProgress" }, true), true);
  assert.equal(showsCommandOutputPanel({ status: "inProgress", output: "" }, true), true);
  assert.equal(showsCommandOutputPanel({ status: "inProgress" }, false), false);
  assert.equal(showsCommandOutputPanel({ status: "completed" }, true), false);
  assert.equal(showsCommandOutputPanel({ status: "completed", output: "done" }, true), true);
});

test("running command output accumulates by item without changing completed steps", () => {
  const running = { itemId: "a", status: "inProgress", output: "first" };
  assert.deepEqual(appendCommandOutputDelta(running, "a", " second"), {
    itemId: "a", status: "inProgress", output: "first second",
  });
  assert.equal(appendCommandOutputDelta(running, "b", " ignored"), running);
  assert.equal(appendCommandOutputDelta({ ...running, status: "completed" }, "a", " late").output, "first");
});

test("a completion without status settles an existing running step", () => {
  assert.equal(commandStatusAfterEvent("inProgress", undefined, "completed"), "completed");
  assert.equal(commandStatusAfterEvent("inProgress", "inProgress", "completed"), "completed");
  assert.equal(commandStatusAfterEvent(undefined, undefined, "completed"), "completed");
  assert.equal(commandStatusAfterEvent("inProgress", "failed", "completed"), "failed");
  assert.equal(commandStatusAfterEvent("failed", undefined, "completed"), "failed");
  assert.equal(commandStatusAfterEvent("declined", undefined, "completed"), "declined");
});

test("late starts cannot revive a settled step", () => {
  assert.equal(commandStatusAfterEvent("completed", "inProgress", "started"), "completed");
  assert.equal(commandStatusAfterEvent("failed", undefined, "started"), "failed");
  assert.equal(commandStatusAfterEvent("unconfirmed", "inProgress", "started"), "unconfirmed");
  assert.equal(commandStatusAfterEvent("unconfirmed", "failed", "completed"), "failed");
  assert.equal(commandStatusAfterEvent(undefined, "inProgress", "started", false), "unconfirmed");
  assert.equal(commandStatusAfterEvent(undefined, "inProgress", "started", true), "inProgress");
  assert.equal(commandStatusAfterEvent(undefined, "failed", "started", false), "failed");
  assert.equal(commandStatusAfterEvent("unconfirmed", "completed", "completed", false), "completed");
});

test("only unfinished steps are marked result not confirmed", () => {
  const entries = [
    { kind: "command", status: "inProgress", itemId: "a" },
    { kind: "work", entries: [{ kind: "command", status: "inProgress", itemId: "b" }] },
    { kind: "command", status: "completed", itemId: "c" },
  ];
  assert.deepEqual(settleUnconfirmedSteps(entries), [
    { kind: "command", status: "unconfirmed", itemId: "a" },
    { kind: "work", entries: [{ kind: "command", status: "unconfirmed", itemId: "b" }] },
    { kind: "command", status: "completed", itemId: "c" },
  ]);
  assert.equal(entries[0].status, "inProgress");
});

test("turn completion only settles steps from that turn", () => {
  const entries = [
    { kind: "command", status: "inProgress", itemId: "older" },
    { kind: "user", text: "new task" },
    { kind: "command", status: "inProgress", itemId: "current" },
  ];
  assert.deepEqual(settleTurnSteps(entries, 2), [
    entries[0],
    entries[1],
    { kind: "command", status: "unconfirmed", itemId: "current" },
  ]);
  assert.equal(settleTurnSteps(entries, null), entries);
});
