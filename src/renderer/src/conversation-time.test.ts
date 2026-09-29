import assert from "node:assert/strict";
import { test } from "node:test";
import { dayMarkerIndices, epochMillis, formatConversationDayMarker, formatConversationTime, hydrateTranscriptTimes } from "../../shared/conversation-time";

test("engine seconds, milliseconds, and ISO dates normalize to milliseconds", () => {
  assert.equal(epochMillis(1790724600), 1790724600000);
  assert.equal(epochMillis(1790724600000), 1790724600000);
  assert.equal(epochMillis("2026-09-29T20:50:00Z"), Date.parse("2026-09-29T20:50:00Z"));
  assert.equal(epochMillis(123), null);
});

test("times use today, yesterday, weekday, and older-date labels", () => {
  const now = new Date(2026, 8, 29, 18, 0).getTime(); // Tuesday
  assert.equal(formatConversationTime(new Date(2026, 8, 29, 15, 31).getTime(), now), "3:31 PM");
  assert.equal(formatConversationDayMarker(new Date(2026, 8, 29, 15, 31).getTime(), now), "Today, 3:31 PM");
  assert.equal(formatConversationTime(new Date(2026, 8, 28, 15, 31).getTime(), now), "Yesterday 3:31 PM");
  assert.equal(formatConversationTime(new Date(2026, 8, 25, 15, 31).getTime(), now), "Sep 25, 3:31 PM");
  const friday = new Date(2026, 9, 2, 18, 0).getTime();
  assert.equal(formatConversationTime(new Date(2026, 8, 29, 15, 31).getTime(), friday), "Tuesday 3:31 PM");
  assert.equal(formatConversationTime(new Date(2025, 8, 22, 15, 31).getTime(), now), "Sep 22, 2025, 3:31 PM");
});

test("a day marker appears only before the first user message of each day", () => {
  const first = new Date(2026, 8, 29, 9, 0).getTime();
  const nextDay = new Date(2026, 8, 30, 10, 0).getTime();
  const entries = [
    { kind: "user", at: first },
    { kind: "assistant", at: first + 1000 },
    { kind: "user", at: first + 2000 },
    { kind: "work" },
    { kind: "user", at: nextDay },
  ];
  assert.deepEqual([...dayMarkerIndices(entries)], [0, 4]);
});

test("cached UI-only rows survive while replay timestamps fill missing values", () => {
  type Entry = { kind: string; text?: string; at?: number; entries?: Entry[] };
  const cached: Entry[] = [
    { kind: "user", text: "Question" },
    { kind: "work", entries: [{ kind: "assistant", text: "Thinking" }, { kind: "command" }] },
    { kind: "assistant", text: "Answer" },
    { kind: "assistant", text: "⚠ Local notice" },
  ];
  const history: Entry[] = [
    { kind: "user", text: "Question", at: 1000 },
    { kind: "work", entries: [{ kind: "assistant", text: "Thinking", at: 2000 }] },
    { kind: "assistant", text: "Answer", at: 3000 },
  ];
  assert.deepEqual(hydrateTranscriptTimes(cached, history), [
    { kind: "user", text: "Question", at: 1000 },
    { kind: "work", entries: [{ kind: "assistant", text: "Thinking", at: 2000 }, { kind: "command" }] },
    { kind: "assistant", text: "Answer", at: 3000 },
    { kind: "assistant", text: "⚠ Local notice" },
  ]);
});
