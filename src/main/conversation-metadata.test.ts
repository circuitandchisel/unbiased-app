import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConversationMetadataStore, metadataEvidence, type MetadataHistory } from "./conversation-metadata";
import type { ConversationContext } from "../shared/conversation-metadata";
const context = (goal = "Build the home screen"): ConversationContext => ({ goal, currentFocus: "Project selector", progress: ["Reported: implemented the calendar"], decisions: ["Use project icons"], pending: ["Connect GitHub"], blockers: [] });
function fixture(summarize?: ConstructorParameters<typeof ConversationMetadataStore>[0]["summarize"]) {
  const root = mkdtempSync(join(tmpdir(), "conversation-metadata-"));
  let key = "account-a", calls = 0;
  const histories = new Map<string, MetadataHistory>();
  const options = { root: () => root, key: () => key, history: async (id: string) => structuredClone(histories.get(id)!), redact: <T>(value: T) => value, updated: () => {}, minimumIntervalMs: 0, concurrency: 2,
    summarize: summarize ?? (async () => { calls++; return context(); }) };
  const store = new ConversationMetadataStore(options);
  function turn(id: string, thread = "chat") {
    const history = histories.get(thread) ?? { id: thread, title: "Home screen", project: "Desktop", turns: [] };
    history.turns.push({ id, status: "completed", items: [{ type: "userMessage", text: "Improve the home screen" }, { type: "agentMessage", phase: "final_answer", text: "The layout was updated and tested." }] }); histories.set(thread, history);
    return id;
  }
  const complete = (id: string, state: Partial<Parameters<typeof store.completed>[2]> = {}) => store.completed("chat", turn(id), { meaningful: true, automatic: false, status: "idle", ...state });
  return { root, options, store, histories, turn, complete, calls: () => calls, key: (value: string) => { key = value; }, cleanup: () => { store.reset(); rmSync(root, { recursive: true, force: true }); } };
}
test("initial summary and each 25 meaningful turns update the same persistent record", async () => {
  const f = fixture(); try {
    f.complete("t1"); await f.store.settled(); assert.equal(f.calls(), 1);
    for (let i = 2; i <= 25; i++) f.complete(`t${i}`);
    await f.store.settled(); assert.equal(f.calls(), 1);
    f.complete("t26"); await f.store.settled();
    assert.equal(f.calls(), 2); assert.equal(f.store.read("chat")?.lastSummarizedTurnId, "t26");
    assert.equal(f.store.read("chat")?.completedTurns, 26); assert.equal(f.store.read("chat")?.summarizedTurns, 26);
    assert.deepEqual(f.store.read("chat")?.pendingTurnIds, []);
    const account = readdirSync(f.root)[0]; assert.equal(readdirSync(join(f.root, account)).filter(name => name.endsWith(".json")).length, 1);
  } finally { f.cleanup(); }
});
test("counter and cursor survive restart; duplicates, empty and failed turns do not inflate cadence", async () => {
  const f = fixture(); try {
    f.complete("t1"); await f.store.settled();
    for (let i = 2; i <= 10; i++) f.complete(`t${i}`);
    const resumed = new ConversationMetadataStore(f.options);
    resumed.completed("chat", "t10", { meaningful: true, automatic: false, status: "idle" });
    resumed.completed("chat", f.turn("empty"), { meaningful: false, automatic: false, status: "idle" });
    resumed.completed("chat", f.turn("failed"), { meaningful: true, automatic: false, status: "failed" });
    for (let i = 11; i <= 26; i++) resumed.completed("chat", f.turn(`t${i}`), { meaningful: true, automatic: false, status: "idle" });
    await resumed.settled(); assert.equal(f.calls(), 2); assert.equal(resumed.read("chat")?.completedTurns, 26);
    resumed.reset();
  } finally { f.cleanup(); }
});
test("automatic continuation finishes the initial summary without counting as another user turn", async () => {
  const f = fixture(); try {
    f.complete("original", { defer: true }); assert.equal(f.calls(), 0);
    f.complete("automatic", { automatic: true }); await f.store.settled();
    assert.equal(f.calls(), 1); assert.equal(f.store.read("chat")?.completedTurns, 1); assert.equal(f.store.read("chat")?.lastSummarizedTurnId, "automatic");
  } finally { f.cleanup(); }
});
test("in-flight summary preserves newer live status and cannot resurrect a deleted conversation", async () => {
  let finish!: (value: ConversationContext) => void;
  const f = fixture(async () => new Promise(resolve => { finish = resolve; })); try {
    f.complete("t1"); await new Promise(resolve => setImmediate(resolve));
    f.store.status("chat", "running"); finish(context()); await f.store.settled(); assert.equal(f.store.read("chat")?.status, "running");
    for (let i = 2; i <= 26; i++) f.complete(`t${i}`);
    await new Promise(resolve => setImmediate(resolve)); f.store.remove("chat"); finish(context("Obsolete")); await f.store.settled();
    assert.equal(f.store.read("chat"), null);
  } finally { f.cleanup(); }
});
test("failed summaries retain their cursor and pending evidence; account changes discard old jobs", async () => {
  let fail = true;
  const f = fixture(async () => { if (fail) throw Error("offline"); return context(); }); try {
    f.complete("t1"); await f.store.settled(); assert.equal(f.store.read("chat")?.lastSummarizedTurnId, null); assert.deepEqual(f.store.read("chat")?.pendingTurnIds, ["t1"]);
    fail = false; f.store.ensure("chat"); await f.store.settled(); assert.equal(f.store.read("chat")?.lastSummarizedTurnId, "t1");
    f.key("account-b"); assert.equal(f.store.read("chat"), null);
  } finally { f.cleanup(); }
});
test("evidence uses only the new bounded snapshot, excludes later active work and keeps tool outcomes", () => {
  const history: MetadataHistory = { id: "chat", title: "Chat", project: null, turns: [
    { id: "old", items: [{ type: "userMessage", text: "old" }] },
    { id: "new", items: [{ type: "userMessage", text: "Test it" }, { type: "commandExecution", command: "npm test", status: "completed", exitCode: 0 }] },
    { id: "active", items: [{ type: "userMessage", text: "Do not summarize yet" }] },
  ] };
  const result = metadataEvidence(history, "old", "new"); assert.deepEqual(result.evidence.map(turn => turn.turnId), ["new"]); assert.equal(result.evidence[0].tools[0].exitCode, 0); assert.equal(result.partial, false);
});

test("existing conversation backfill excludes automatic and empty turns", async () => {
  const { CONTINUATION_INPUT } = await import("./turn-continuation");
  const f = fixture(); try {
    f.turn("original");
    f.histories.get("chat")!.turns.push({ id: "auto", status: "completed", items: [{ type: "userMessage", text: CONTINUATION_INPUT }, { type: "agentMessage", text: "Actual result" }] }, { id: "empty", status: "completed", items: [{ type: "userMessage", text: "No result" }] });
    f.store.ensure("chat"); await f.store.settled();
    assert.equal(f.calls(), 1); assert.equal(f.store.read("chat")?.completedTurns, 1);
    assert.equal(f.store.read("chat")?.lastSummarizedTurnId, "empty", "cursor still covers the whole completed snapshot");
  } finally { f.cleanup(); }
});

test("background summaries run at most two at once across conversations", async () => {
  const finishes: (() => void)[] = [];
  let calls = 0;
  const f = fixture(async () => { calls++; return new Promise(resolve => finishes.push(() => resolve(context()))); });
  try {
    for (const thread of ["a", "b", "c"]) f.store.completed(thread, f.turn(`turn-${thread}`, thread), { meaningful: true, automatic: false, status: "idle" });
    await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 2);
    finishes[0](); await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 3);
    finishes[1](); finishes[2](); await f.store.settled();
    for (const thread of ["a", "b", "c"]) assert.ok(f.store.read(thread)?.context);
  } finally { f.cleanup(); }
});
test("verified owner identity preserves a record across API-key rotation", async () => {
  const f = fixture();
  const store = new ConversationMetadataStore({ ...f.options, owner: () => "organization/member" });
  try {
    store.completed("chat", f.turn("t1"), { meaningful: true, automatic: false, status: "idle" }); await store.settled();
    f.key("new-key-same-owner"); assert.equal(store.read("chat")?.lastSummarizedTurnId, "t1");
    assert.equal(readdirSync(f.root).length, 1);
  } finally { store.reset(); f.cleanup(); }
});

test("queued metadata work waits while an interactive conversation is running", async () => {
  const f = fixture(); let busy = true;
  const store = new ConversationMetadataStore({ ...f.options, canRun: () => !busy });
  try {
    store.completed("chat", f.turn("t1"), { meaningful: true, automatic: false, status: "idle" });
    await new Promise(resolve => setImmediate(resolve)); assert.equal(f.calls(), 0);
    busy = false; store.wake(); await store.settled(); assert.equal(f.calls(), 1);
  } finally { store.reset(); f.cleanup(); }
});
test("model summary receives previous context and only bounded new evidence", async () => {
  const { summarizeConversation } = await import("./conversation-metadata");
  const previous = context();
  const result = await summarizeConversation(previous, [{ turnId: "t26", user: "Use the existing project icon", assistant: "Reported: updated", tools: [] }], "key", new AbortController().signal, (async (_url, init) => {
    const payload = JSON.parse(String(init?.body)); assert.equal(payload.store, false); assert.deepEqual(payload.tools, []);
    const input = JSON.parse(payload.input[1].content); assert.deepEqual(input.previous, previous); assert.equal(input.evidence[0].turnId, "t26");
    return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(context("Updated goal")) }] }] });
  }) as typeof fetch);
  assert.equal(result.goal, "Updated goal");
});
