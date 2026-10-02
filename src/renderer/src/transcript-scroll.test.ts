import { test } from "node:test";
import assert from "node:assert/strict";
import { isTranscriptAtBottom } from "./transcript-scroll";

test("transcript follows at the bottom, including fractional scroll positions", () => {
  assert.equal(isTranscriptAtBottom({ scrollHeight: 1000, clientHeight: 500, scrollTop: 500 }), true);
  assert.equal(isTranscriptAtBottom({ scrollHeight: 1000, clientHeight: 500, scrollTop: 498.5 }), true);
});

test("scrolling up pauses following until the reader returns to the bottom", () => {
  assert.equal(isTranscriptAtBottom({ scrollHeight: 1000, clientHeight: 500, scrollTop: 497 }), false);
  assert.equal(isTranscriptAtBottom({ scrollHeight: 1200, clientHeight: 500, scrollTop: 497 }), false);
  assert.equal(isTranscriptAtBottom({ scrollHeight: 1200, clientHeight: 500, scrollTop: 700 }), true);
});

test("a transcript too short to scroll is already at the bottom", () => {
  assert.equal(isTranscriptAtBottom({ scrollHeight: 300, clientHeight: 500, scrollTop: 0 }), true);
});
