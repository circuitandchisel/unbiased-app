import test from "node:test";
import assert from "node:assert/strict";
import { PromptHistory } from "./prompt-history";
test("prompt history walks backward and forward, clamps and restores the unsent draft", () => {
  const h = new PromptHistory(), prompts = ["First", "Second\nwith details", "Third"];
  assert.equal(h.navigate("down", prompts, "Unsent"), null);
  assert.equal(h.navigate("up", prompts, "Unsent"), "Third");
  assert.equal(h.navigate("up", prompts, "Third"), "Second\nwith details");
  assert.equal(h.navigate("up", prompts, ""), "First");
  assert.equal(h.navigate("up", prompts, ""), "First");
  assert.equal(h.navigate("down", prompts, ""), "Second\nwith details");
  assert.equal(h.navigate("down", prompts, ""), "Third");
  assert.equal(h.navigate("down", prompts, ""), "Unsent");
  assert.equal(h.active, false);
});
test("typing or switching chats resets browsing; live replies do not move the history cursor", () => {
  const h = new PromptHistory();
  assert.equal(h.navigate("up", [], "Draft"), null);
  assert.equal(h.navigate("up", ["Old"], "Draft"), "Old");
  assert.equal(h.navigate("down", ["Old", "New live prompt"], "Old"), "Draft");
  h.navigate("up", ["Old"], "Draft"); h.reset();
  assert.equal(h.navigate("up", ["Other chat"], "Edited"), "Other chat");
  assert.equal(h.navigate("down", [], ""), "Edited");
});
