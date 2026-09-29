import assert from "node:assert/strict";
import { test } from "node:test";
import { SIDE_CHAT_IDLE_MS, SideChatIdleTracker } from "./side-chat-idle";

test("side chats expire only after eight hours without use", () => {
  const tracker = new SideChatIdleTracker();
  tracker.use("side:1", 0);
  tracker.use("side:2", SIDE_CHAT_IDLE_MS / 2);
  assert.deepEqual(tracker.expired(SIDE_CHAT_IDLE_MS - 1), []);
  assert.deepEqual(tracker.expired(SIDE_CHAT_IDLE_MS), ["side:1"]);
  tracker.use("side:1", SIDE_CHAT_IDLE_MS);
  assert.deepEqual(tracker.expired(SIDE_CHAT_IDLE_MS + 1), []);
});

test("running turns stay open and completion starts a fresh idle window", () => {
  const tracker = new SideChatIdleTracker();
  tracker.use("side:1", 0);
  tracker.setBusy("side:1", true, 1);
  assert.deepEqual(tracker.expired(SIDE_CHAT_IDLE_MS * 2), []);
  tracker.setBusy("side:1", false, SIDE_CHAT_IDLE_MS * 2);
  assert.deepEqual(tracker.expired(SIDE_CHAT_IDLE_MS * 3 - 1), []);
  assert.deepEqual(tracker.expired(SIDE_CHAT_IDLE_MS * 3), ["side:1"]);
});

test("closing a side chat clears its idle and busy state", () => {
  const tracker = new SideChatIdleTracker();
  tracker.use("side:1", 0);
  tracker.setBusy("side:1", true, 1);
  tracker.close("side:1");
  assert.deepEqual(tracker.expired(SIDE_CHAT_IDLE_MS * 2), []);
  tracker.use("side:1", SIDE_CHAT_IDLE_MS * 2);
  assert.deepEqual(tracker.expired(SIDE_CHAT_IDLE_MS * 3), ["side:1"]);
});
