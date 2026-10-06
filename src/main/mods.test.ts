import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { ModsClient, modsEntryPath, parseEnabledMods } from "./mods";

test("bundled and development sidecar paths stay distinct", () => {
  assert.equal(modsEntryPath(false, "/pack/resources", "/checkout"), "/checkout/resources/mods/entry.cjs");
  assert.equal(modsEntryPath(true, "/pack/resources", "/checkout"), "/pack/resources/mods/entry.cjs");
});

test("malformed per-chat settings are ignored", () => {
  assert.deepEqual([...parseEnabledMods(["thread-a", 42, "", "thread-a"])], ["thread-a"]);
  assert.deepEqual([...parseEnabledMods({ enabled: true })], []);
});

test("first-party sidecar counts metadata by chat", async () => {
  const sidecar = new ModsClient(join(process.cwd(), "resources", "mods", "entry.cjs"));
  await sidecar.start();
  try {
    assert.equal(sidecar.isReady, true);
    sidecar.observe("chat-a", "turn_started");
    sidecar.observe("chat-a", "tool_called");
    sidecar.observe("chat-a", "turn_completed");
    sidecar.observe("chat-b", "turn_started");
    assert.deepEqual(await sidecar.sessionStats("chat-a"), {
      turnsStarted: 1, turnsCompleted: 1, toolsCalled: 1,
    });
    assert.deepEqual(await sidecar.sessionStats("chat-b"), {
      turnsStarted: 1, turnsCompleted: 0, toolsCalled: 0,
    });
  } finally {
    sidecar.stop();
  }
  await assert.rejects(sidecar.sessionStats("chat-a"), /unavailable/);
});

test("a missing bundle fails without leaving the client ready", async () => {
  const sidecar = new ModsClient(join(process.cwd(), "resources", "mods", "missing.cjs"));
  await assert.rejects(sidecar.start(), /bundle missing/);
  assert.equal(sidecar.isReady, false);
});
