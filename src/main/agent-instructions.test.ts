import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGENT_INSTRUCTIONS_MAX_BYTES } from "../shared/agent-instructions";
import { agentInstructionsGuidance, agentInstructionsPath, connectAgentInstructions, readAgentInstructions, saveAgentInstructions } from "./agent-instructions";

function fixture(t: TestContext) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "unbiased-instructions-")));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const engine = join(home, ".unbiased", "app-engine", "home");
  return { home, engine, canonical: agentInstructionsPath(home) };
}

test("global saves use only Unbiased's file and preserve unrelated rules", t => {
  const { home, canonical } = fixture(t);
  mkdirSync(join(home, ".codex"));
  const codex = join(home, ".codex", "AGENTS.md");
  writeFileSync(codex, "Other product's rules");
  assert.deepEqual(readAgentInstructions(home), { path: canonical, content: "", revision: null });
  const first = saveAgentInstructions(home, { content: "Keep AWS read-only.\n", expectedRevision: null });
  assert.ok(first.ok);
  const next = saveAgentInstructions(home, { content: first.document.content + "Never merge without explicit consent.\n", expectedRevision: first.document.revision });
  assert.ok(next.ok);
  assert.match(readFileSync(canonical, "utf8"), /Keep AWS read-only\.[\s\S]*Never merge/);
  assert.equal(readFileSync(codex, "utf8"), "Other product's rules");
  assert.equal(statSync(canonical).mode & 0o777, 0o600);
});

test("stale editor saves cannot overwrite an agent's external edit or file deletion", t => {
  const { home, canonical } = fixture(t);
  const first = saveAgentInstructions(home, { content: "Original", expectedRevision: null });
  assert.ok(first.ok);
  writeFileSync(canonical, "Changed by agent");
  assert.deepEqual(saveAgentInstructions(home, { content: "Stale draft", expectedRevision: first.document.revision }), {
    ok: false, conflict: true, error: "Instructions changed outside this editor. Reload them before saving.",
  });
  assert.equal(readFileSync(canonical, "utf8"), "Changed by agent");
  rmSync(canonical);
  const deleted = saveAgentInstructions(home, { content: "Stale draft", expectedRevision: first.document.revision });
  assert.ok(!deleted.ok && deleted.conflict);
  assert.equal(existsSync(canonical), false);
});

test("engine links follow atomic edits, creation, and clearing across fresh engine homes", t => {
  const { home, engine, canonical } = fixture(t);
  connectAgentInstructions(home, engine);
  const link = join(engine, "AGENTS.md");
  assert.ok(lstatSync(link).isSymbolicLink());
  assert.equal(existsSync(canonical), false);
  const first = saveAgentInstructions(home, { content: "Never merge without consent", expectedRevision: null });
  assert.ok(first.ok);
  assert.equal(readFileSync(link, "utf8"), first.document.content);
  const second = saveAgentInstructions(home, { content: "Updated global rules", expectedRevision: first.document.revision });
  assert.ok(second.ok);
  assert.equal(readFileSync(link, "utf8"), "Updated global rules");
  connectAgentInstructions(home, engine); // idempotent after a restart
  const anotherEngine = join(home, "other-engine");
  connectAgentInstructions(home, anotherEngine);
  assert.equal(readFileSync(join(anotherEngine, "AGENTS.md"), "utf8"), "Updated global rules");
  assert.ok(saveAgentInstructions(home, { content: "", expectedRevision: second.document.revision }).ok);
  assert.equal(readFileSync(link, "utf8"), "");
});

test("existing private instructions migrate without loss and conflicts preserve both files", t => {
  const { home, engine, canonical } = fixture(t);
  mkdirSync(engine, { recursive: true });
  const privateFile = join(engine, "AGENTS.md");
  writeFileSync(privateFile, "Existing private-home rule");
  connectAgentInstructions(home, engine);
  assert.equal(readFileSync(canonical, "utf8"), "Existing private-home rule");
  assert.ok(lstatSync(privateFile).isSymbolicLink());
  rmSync(privateFile);
  writeFileSync(privateFile, "Conflicting private rule");
  assert.throws(() => connectAgentInstructions(home, engine), /exist at both/);
  assert.equal(readFileSync(canonical, "utf8"), "Existing private-home rule");
  assert.equal(readFileSync(privateFile, "utf8"), "Conflicting private rule");
});

test("private overrides cannot silently shadow the canonical global instructions", t => {
  const { home, engine } = fixture(t);
  mkdirSync(engine, { recursive: true });
  const override = join(engine, "AGENTS.override.md");
  writeFileSync(override, "Override rule");
  assert.throws(() => connectAgentInstructions(home, engine), /remove the override/);
  assert.equal(readFileSync(override, "utf8"), "Override rule");
});

test("a misconfigured engine home cannot migrate or replace Codex's instructions", t => {
  const { home, canonical } = fixture(t);
  const codexHome = join(home, ".codex");
  mkdirSync(codexHome); writeFileSync(join(codexHome, "AGENTS.md"), "Codex rules");
  assert.throws(() => connectAgentInstructions(home, codexHome), /cannot be connected inside/);
  assert.throws(() => connectAgentInstructions(home, join(codexHome, "nested")), /cannot be connected inside/);
  assert.equal(readFileSync(join(codexHome, "AGENTS.md"), "utf8"), "Codex rules");
  assert.equal(existsSync(canonical), false);
});

test("invalid and oversized writes leave the current file intact", t => {
  const { home, canonical } = fixture(t);
  const saved = saveAgentInstructions(home, { content: "Keep me", expectedRevision: null });
  assert.ok(saved.ok);
  for (const value of [null, {}, { content: 1, expectedRevision: null }, { content: "New" }, { content: "x".repeat(AGENT_INSTRUCTIONS_MAX_BYTES + 1), expectedRevision: saved.document.revision }]) {
    assert.equal(saveAgentInstructions(home, value).ok, false);
  }
  assert.equal(readFileSync(canonical, "utf8"), "Keep me");
  assert.match(agentInstructionsGuidance(home), new RegExp(canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(agentInstructionsGuidance(home), /tool access alone is not that consent/);
});
