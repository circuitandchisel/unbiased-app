import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { automaticMemoryName, memoryEvidence, proposeAutomaticMemory, writeAutomaticMemory } from "./automatic-memory";

test("memory evidence includes user messages and final answers, not tools or commentary", () => {
  const evidence = memoryEvidence([{ items: [
    { type: "userMessage", text: "Always keep release notes concise." },
    { type: "functionCallOutput", text: "SECRET TOOL OUTPUT" },
    { type: "agentMessage", phase: "commentary", text: "Working..." },
    { type: "agentMessage", phase: "final_answer", text: "Understood." },
  ] }]);
  assert.equal(evidence, "USER: Always keep release notes concise.\nASSISTANT: Understood.");
  assert.equal(automaticMemoryName("01a0f7e3-4353-7250-ab2b-7df90553cbfc"), "insights-01a0f7e343537250ab2b7df9");
});

test("a low Jev score skips Pareto and creates no memory", async () => {
  const calls: string[] = [];
  const fetcher = (async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify({ answers: { durable: { noul: 0.04 } } }), { status: 200 });
  }) as typeof fetch;
  assert.equal(await proposeAutomaticMemory("USER: Hello.\nASSISTANT: Hello, how can I help?", null, "insights-test", "test-key", fetcher), null);
  assert.equal(calls.length, 1);
});

test("a durable fact yields a validated note with an exact evidence quote", async () => {
  const evidence = "USER: Always keep release notes concise and avoid unverified claims.\nASSISTANT: Understood.";
  let calls = 0;
  const fetcher = (async () => {
    calls++;
    return new Response(JSON.stringify(calls === 1
      ? { answers: { durable: { noul: 0.81 } } }
      : { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
        save: true, description: "Release notes should stay concise and factual.", type: "user",
        content: "Keep release notes concise and avoid unverified claims.",
        evidence: "Always keep release notes concise and avoid unverified claims.",
      }) }] }] }), { status: 200 });
  }) as typeof fetch;
  const note = await proposeAutomaticMemory(evidence, null, "insights-test", "test-key", fetcher);
  assert.equal(calls, 2);
  assert.equal(note?.name, "insights-test");
  assert.equal(note?.type, "user");
});

test("a note without an exact supporting quote is rejected", async () => {
  let calls = 0;
  const fetcher = (async () => {
    calls++;
    return new Response(JSON.stringify(calls === 1
      ? { answers: { durable: { noul: 0.9 } } }
      : { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
        save: true, description: "An invented preference.", type: "user",
        content: "Always use blue headings.", evidence: "Always use blue headings.",
      }) }] }] }), { status: 200 });
  }) as typeof fetch;
  assert.equal(await proposeAutomaticMemory("USER: Always keep release notes concise.\nASSISTANT: Understood.", null, "insights-test", "test-key", fetcher), null);
});

test("automatic memory writes a scoped note and index only after validation", async () => {
  const dir = mkdtempSync(join(tmpdir(), "unbiased-auto-memory-"));
  const threadId = "01a0f7e3-4353-7250-ab2b-7df90553cbfc";
  let calls = 0;
  const fetcher = (async () => {
    calls++;
    return new Response(JSON.stringify(calls === 1
      ? { answers: { durable: { noul: 0.85 } } }
      : { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
        save: true, description: "Keep release notes concise and verified.", type: "user",
        content: "Use concise release notes and verify every claim.",
        evidence: "Always keep release notes concise and avoid unverified claims.",
      }) }] }] }), { status: 200 });
  }) as typeof fetch;
  const options = {
    threadId, dir, apiKey: "test-key", redact: <T>(value: T) => value,
    turns: [{ items: [{ type: "userMessage", text: "Always keep release notes concise and avoid unverified claims." }] }],
    fetcher,
  };
  try {
    const skipped = await writeAutomaticMemory({ ...options, canWrite: () => false });
    assert.equal(skipped, null);
    assert.equal(existsSync(join(dir, "MEMORY.md")), false);
    calls = 0;
    const saved = await writeAutomaticMemory({ ...options, canWrite: () => true });
    assert.ok(saved);
    assert.match(readFileSync(saved.path, "utf8"), /originThreadId: 01a0f7e3/);
    assert.match(readFileSync(join(dir, "MEMORY.md"), "utf8"), /Keep release notes concise and verified/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
