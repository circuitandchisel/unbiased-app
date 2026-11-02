import assert from "node:assert/strict";
import test from "node:test";
import { browserLinkAction } from "./browser-tabs";

const pr = "https://github.com/circuitandchisel/unbiased-app/pull/164";
const other = "https://github.com/circuitandchisel/unbiased-app/pull/165";

test("links focus their existing browser tab, including at the tab cap", () => {
  const states = { 1: { url: other }, 2: { url: pr } };
  assert.deepEqual(browserLinkAction(pr, [1, 2], states, new Map(), 2), { kind: "focus", id: 2 });
  assert.deepEqual(browserLinkAction(pr.replace("github.com", "GITHUB.com:443"), [2], states, new Map(), 2), { kind: "focus", id: 2 });
  assert.deepEqual(browserLinkAction("https://example.com", [3], { 3: { url: "https://example.com/" } }, new Map(), 2), { kind: "focus", id: 3 });
});

test("rapid repeat links reuse a tab before the native page reports its URL", () => {
  const pending = new Map([[3, pr]]);
  assert.deepEqual(browserLinkAction(pr, [3], {}, pending, 2), { kind: "focus", id: 3 });
  assert.deepEqual(browserLinkAction(pr, [3], { 3: { url: "about:blank" } }, pending, 2), { kind: "focus", id: 3 });
});

test("closed or navigated-away tabs cannot steal a link", () => {
  assert.deepEqual(browserLinkAction(pr, [], { 3: { url: pr } }, new Map([[3, pr]]), 2), { kind: "create" });
  assert.deepEqual(browserLinkAction(pr, [3], { 3: { url: other } }, new Map(), 2), { kind: "create" });
  assert.deepEqual(browserLinkAction(other, [3], { 3: { url: other } }, new Map(), 2), { kind: "focus", id: 3 });
});

test("new destinations retain cap handling and distinct queries/anchors", () => {
  const states = { 1: { url: pr } };
  assert.deepEqual(browserLinkAction(other, [1], states, new Map(), 2), { kind: "create" });
  assert.deepEqual(browserLinkAction(other, [1], states, new Map(), 1), { kind: "external" });
  for (const url of [pr + "#discussion_r123", pr + "?tab=files", pr + "/files"]) {
    assert.deepEqual(browserLinkAction(url, [1], states, new Map(), 2), { kind: "create" });
  }
  for (const url of ["invalid", "javascript:alert(1)", "file:///tmp/page.html"]) {
    assert.deepEqual(browserLinkAction(url, [1], states, new Map(), 2), { kind: "ignore" });
  }
});
