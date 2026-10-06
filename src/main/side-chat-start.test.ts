import assert from "node:assert/strict";
import { test } from "node:test";
import { lastFinishedTurnBeforeActive, sideChatStartTarget } from "./side-chat-start";

test("a side chat inherits only turns before the active one", () => {
  const turns = [
    { id: "finished-1", status: "completed" },
    { id: "finished-2", status: "failed" },
    { id: "active", status: "completed" },
  ];
  const boundary = lastFinishedTurnBeforeActive(turns, "active");
  assert.equal(boundary, "finished-2");
  assert.deepEqual(sideChatStartTarget("parent", true, "/project/worktree", boundary), {
    method: "thread/fork",
    params: { threadId: "parent", ephemeral: true, excludeTurns: true, lastTurnId: "finished-2" },
  });
});

test("an in-progress turn is never a fork boundary", () => {
  assert.equal(lastFinishedTurnBeforeActive([
    { id: "finished", status: "completed" },
    { id: "active", status: "inProgress" },
  ], null), "finished");
});

test("the first running turn leaves no parent history to fork", () => {
  const boundary = lastFinishedTurnBeforeActive([{ id: "active", status: "inProgress" }], "active");
  assert.equal(boundary, null);
  assert.deepEqual(sideChatStartTarget("parent", true, "/project", boundary), {
    method: "thread/start",
    params: { cwd: "/project", ephemeral: true },
  });
});

test("a side chat starts independently while the parent has a running turn", () => {
  assert.deepEqual(sideChatStartTarget("parent", true, "/project/worktree"), {
    method: "thread/start",
    params: { cwd: "/project/worktree", ephemeral: true },
  });
});

test("a side chat forks a completed parent conversation", () => {
  assert.deepEqual(sideChatStartTarget("parent", false, "/project/worktree"), {
    method: "thread/fork",
    params: { threadId: "parent", ephemeral: true, excludeTurns: true },
  });
});

test("a side chat starts in the selected directory before the main conversation exists", () => {
  assert.deepEqual(sideChatStartTarget(null, false, "/project"), {
    method: "thread/start",
    params: { cwd: "/project", ephemeral: true },
  });
});
