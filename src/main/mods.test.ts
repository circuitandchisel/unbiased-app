import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModsClient, modsDynamicTools, modsEntryPath, parseEnabledMods, readModsCatalog } from "./mods";

const entry = join(process.cwd(), "resources", "mods", "entry.cjs");
const catalog = readModsCatalog(entry);

test("bundled and development sidecar paths stay distinct", () => {
  assert.equal(modsEntryPath(false, "/pack/resources", "/checkout"), "/checkout/resources/mods/entry.cjs");
  assert.equal(modsEntryPath(true, "/pack/resources", "/checkout"), "/pack/resources/mods/entry.cjs");
});

test("malformed per-chat settings are ignored", () => {
  assert.deepEqual([...parseEnabledMods(["thread-a", 42, "", "thread-a"])], ["thread-a"]);
  assert.deepEqual([...parseEnabledMods({ enabled: true })], []);
});

test("the app reads both first-party plugin tool declarations without executing them", () => {
  assert.deepEqual(catalog.plugins.map((plugin) => plugin.id), ["session-activity", "turn-timing"]);
  assert.deepEqual(modsDynamicTools(catalog).map((tool) => tool.name), ["mods_session_stats", "mods_turn_timing"]);
});

test("duplicate tool names in a catalog are refused", () => {
  const dir = mkdtempSync(join(tmpdir(), "mods-catalog-"));
  const invalid = structuredClone(catalog);
  invalid.plugins[1].tools[0].name = invalid.plugins[0].tools[0].name;
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(invalid));
  assert.throws(() => readModsCatalog(join(dir, "entry.cjs")), /duplicate Mods tool/);
});

test("two first-party plugins receive only metadata for their own chat", async () => {
  const sidecar = new ModsClient(entry, catalog);
  await sidecar.start();
  try {
    assert.equal(sidecar.isReady, true);
    sidecar.observe("chat-a", "turn_started");
    sidecar.observe("chat-a", "tool_called");
    sidecar.observe("chat-a", "turn_completed");
    sidecar.observe("chat-b", "turn_started");
    assert.match(await sidecar.callTool("chat-a", "mods_session_stats"), /1 turns started, 1 completed, 1 dynamic tool calls/);
    assert.match(await sidecar.callTool("chat-b", "mods_session_stats"), /1 turns started, 0 completed, 0 dynamic tool calls/);
    assert.match(await sidecar.callTool("chat-a", "mods_turn_timing"), /Last completed turn: \d+\.\ds/);
    assert.match(await sidecar.callTool("chat-b", "mods_turn_timing"), /Current turn: \d+\.\ds so far/);
    await assert.rejects(sidecar.callTool("chat-a", "mods_not_registered"), /Unknown Mods tool/);
  } finally {
    sidecar.stop();
  }
  await assert.rejects(sidecar.callTool("chat-a", "mods_session_stats"), /unavailable/);
});

test("a missing bundle fails without leaving the client ready", async () => {
  const sidecar = new ModsClient(join(process.cwd(), "resources", "mods", "missing.cjs"), catalog);
  await assert.rejects(sidecar.start(), /bundle missing/);
  assert.equal(sidecar.isReady, false);
});

test("a sidecar with a different plugin set is refused at handshake", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mods-handshake-"));
  const fake = join(dir, "entry.cjs");
  writeFileSync(fake, `
    require("node:readline").createInterface({ input: process.stdin }).on("line", (line) => {
      const { id } = JSON.parse(line);
      process.stdout.write(JSON.stringify({ id, result: { protocolVersion: 2, plugins: [], tools: [] } }) + "\\n");
    });
  `);
  const sidecar = new ModsClient(fake, catalog);
  await assert.rejects(sidecar.start(), /handshake mismatch/);
  assert.equal(sidecar.isReady, false);
});
