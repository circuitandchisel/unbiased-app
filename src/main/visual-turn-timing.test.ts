import assert from "node:assert/strict";
import test from "node:test";
import { VisualTurnTiming, type VisualTimingRecord } from "./visual-turn-timing";

test("attributes the gap after a browser result without calling it model reasoning", () => {
  let now = 0;
  const records: VisualTimingRecord[] = [];
  const timing = new VisualTurnTiming((record) => records.push(record), () => now, () => 1_000_000);
  timing.start("thread-1", "turn-1");
  now = 10; timing.outputStarted("thread-1");
  now = 20; timing.messageCompleted("thread-1");
  now = 30; timing.toolStarted("thread-1", "call-1", "browser_read");
  now = 50; timing.toolCompleted("thread-1", "call-1", true);
  now = 120; timing.messageCompleted("thread-1");
  now = 130; timing.milestone("thread-1", "visual_requested");
  now = 140; timing.toolStarted("thread-1", "call-2", "visual_validate");
  now = 145; timing.toolCompleted("thread-1", "call-2", true);
  now = 150; timing.milestone("thread-1", "preview_ready");
  now = 160; timing.milestone("thread-1", "visual_committed");
  now = 200; timing.complete("thread-1", "completed");

  const gap = records.find((record) => record.kind === "interval" && record.after === "tool:browser_read:completed");
  assert.ok(gap && gap.kind === "interval");
  assert.deepEqual({ phase: gap.phase, ms: gap.ms, fromMs: gap.fromMs, until: gap.until }, {
    phase: "unobserved", ms: 70, fromMs: 50, until: "assistant_message_completed",
  });
  const summary = records.at(-1);
  assert.ok(summary && summary.kind === "summary");
  assert.deepEqual({ total: summary.totalMs, gap: summary.unobservedMs, output: summary.outputMs,
    tool: summary.toolWallMs, calls: summary.toolCalls, preview: summary.firstPreviewMs, commit: summary.committedMs }, {
    total: 200, gap: 165, output: 10, tool: 25, calls: 2, preview: 150, commit: 160,
  });
  assert.equal(summary.unobservedMs + summary.outputMs + summary.toolWallMs, summary.totalMs);
  assert.deepEqual({ ms: summary.longestUnobservedMs, after: summary.longestUnobservedAfter,
    until: summary.longestUnobservedUntil }, {
    ms: 70, after: "tool:browser_read:completed", until: "assistant_message_completed",
  });
  assert.equal(records[0]?.at, new Date(1_000_000 + 10).toISOString());
});

test("does not log non-visual turns and separates overlapping tool wall time from call time", () => {
  let now = 0;
  const records: VisualTimingRecord[] = [];
  const timing = new VisualTurnTiming((record) => records.push(record), () => now);
  timing.start("ordinary", "turn-1");
  now = 5; timing.toolStarted("ordinary", "a", "browser_search");
  now = 15; timing.toolCompleted("ordinary", "a", true);
  now = 20; timing.complete("ordinary", "completed");
  assert.equal(records.length, 0);

  timing.start("visual", "turn-2");
  now = 30; timing.toolStarted("visual", "a", "browser_search");
  now = 40; timing.toolStarted("visual", "b", "browser_open");
  now = 50; timing.milestone("visual", "draft_staged");
  now = 60; timing.toolCompleted("visual", "a", true);
  now = 70; timing.toolCompleted("visual", "b", false);
  now = 80; timing.complete("visual", "failed");
  const summary = records.at(-1);
  assert.ok(summary && summary.kind === "summary");
  assert.equal(summary.totalMs, 60);
  assert.equal(summary.toolWallMs, 40);
  assert.equal(summary.toolCallMs, 60);
  assert.equal(summary.firstDraftMs, 30);
  assert.ok(records.some((record) => record.kind === "tool-end" && record.tool === "browser_open" && !record.ok));
  assert.ok(records.every((record) => JSON.stringify(record).includes("turn-2") && !JSON.stringify(record).includes("turn-1")));
});

test("timing records contain bounded names, not tool arguments", () => {
  let now = 0;
  const records: VisualTimingRecord[] = [];
  const timing = new VisualTurnTiming((record) => records.push(record), () => now);
  timing.start("thread", "turn");
  timing.milestone("thread", "visual_requested");
  now = 5; timing.toolStarted("thread", "call", "browser_open https://private.example/path");
  now = 10; timing.toolCompleted("thread", "call", true);
  now = 15; timing.complete("thread", "completed");
  assert.ok(records.some((record) => record.kind === "tool-start" && record.tool === "other"));
  assert.ok(!JSON.stringify(records).includes("private.example"));
});

test("heartbeat exposes an ongoing gap before the next event arrives", () => {
  let now = 0;
  const records: VisualTimingRecord[] = [];
  const timing = new VisualTurnTiming((record) => records.push(record), () => now);
  timing.start("thread", "turn");
  timing.milestone("thread", "draft_staged");
  now = 10_000; timing.heartbeat();
  const beat = records.at(-1);
  assert.ok(beat && beat.kind === "heartbeat");
  assert.deepEqual({ phase: beat.phase, ms: beat.msSincePhaseStart, after: beat.after, tools: beat.activeTools }, {
    phase: "unobserved", ms: 10_000, after: "turn_started", tools: [],
  });
  now = 12_000; timing.toolStarted("thread", "call", "browser_open");
  now = 22_000; timing.heartbeat();
  const toolBeat = records.at(-1);
  assert.ok(toolBeat && toolBeat.kind === "heartbeat");
  assert.deepEqual(toolBeat.activeTools, ["browser_open"]);
});

test("measures tool-result handoff to first engine event and sparse output gaps", () => {
  let now = 0;
  const records: VisualTimingRecord[] = [];
  const timing = new VisualTurnTiming((record) => records.push(record), () => now);
  timing.start("thread", "turn");
  now = 10; timing.toolResultSent("thread", "browser_read");
  now = 40_010; timing.engineEvent("thread", "item/reasoning/textDelta");
  now = 45_010; timing.outputChunk("thread", 12);
  timing.outputStarted("thread");
  now = 45_030; timing.outputChunk("thread", 8);
  now = 51_030; timing.outputChunk("thread", 4);
  now = 52_000; timing.milestone("thread", "visual_requested");
  now = 53_000; timing.complete("thread", "completed");

  const resumed = records.find((record) => record.kind === "engine-event-after-tool");
  assert.ok(resumed && resumed.kind === "engine-event-after-tool");
  assert.deepEqual({ event: resumed.event, ms: resumed.sinceToolResultMs, tool: resumed.tool },
    { event: "reasoning_delta", ms: 40_000, tool: "browser_read" });
  const chunks = records.filter((record) => record.kind === "output-chunk");
  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks.map((chunk) => chunk.kind === "output-chunk" && [chunk.timing, chunk.sincePreviousMs]),
    [["first", 45_000], ["gap", 6_000]]);
});

test("engine event timing never records raw method or response contents", () => {
  let now = 0;
  const records: VisualTimingRecord[] = [];
  const timing = new VisualTurnTiming((record) => records.push(record), () => now);
  timing.start("thread", "turn");
  timing.milestone("thread", "visual_requested");
  timing.toolResultSent("thread", "browser_open https://private.example");
  now = 10; timing.engineEvent("thread", "sensitive/method/with-url");
  timing.outputChunk("thread", 200);
  timing.complete("thread", "completed");
  const serialized = JSON.stringify(records);
  assert.ok(!serialized.includes("private.example"));
  assert.ok(!serialized.includes("sensitive/method"));
  assert.ok(records.some((record) => record.kind === "engine-event-after-tool" && record.event === "other"));
});
