import assert from "node:assert/strict";
import { test } from "node:test";
import { sideChatStartTarget } from "./side-chat-start";

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
