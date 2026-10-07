import assert from "node:assert/strict";
import test from "node:test";
import { INTERACTIVE_VISUAL_CSP, MAX_INTERACTIVE_VISUAL_LENGTH, interactiveVisualDocument, interactiveVisualId, isInteractiveVisualSource } from "../shared/interactive-visual";

test("only a visual URL with an exact ID can resolve a frame", () => {
  const url = "unbiased-visual://view/fe84ba18-a111-4c40-a556-f882ae77cb7d";
  assert.equal(interactiveVisualId(url), "fe84ba18-a111-4c40-a556-f882ae77cb7d");
  assert.equal(interactiveVisualId(`${url}?next=https://example.com`), null);
  assert.equal(interactiveVisualId(`${url}#other`), null);
  assert.equal(interactiveVisualId("unbiased-visual://evil/fe84ba18-a111-4c40-a556-f882ae77cb7d"), null);
  assert.equal(interactiveVisualId("https://example.com"), null);
});

test("accepts bounded HTML fragments but not whole documents or empty prose", () => {
  assert.equal(isInteractiveVisualSource('<div id="scene"></div><script>scene.textContent="Ready"</script>'), true);
  assert.equal(isInteractiveVisualSource("Just a description"), false);
  assert.equal(isInteractiveVisualSource("<!doctype html><html></html>"), false);
  assert.equal(isInteractiveVisualSource("<div>" + "x".repeat(MAX_INTERACTIVE_VISUAL_LENGTH)), false);
});

test("the visual document has a resize and theme bridge but no app bridge", () => {
  const document = interactiveVisualDocument('<button type="button">Next</button>');
  assert.match(document, /ResizeObserver/);
  assert.match(document, /unbiased-visual-height/);
  assert.match(document, /--visual-accent/);
  assert.match(document, /<button type="button">Next<\/button>/);
  assert.doesNotMatch(document, /window\.unbiased/);
});

test("the frame policy permits inline interaction without network or nested frames", () => {
  assert.match(INTERACTIVE_VISUAL_CSP, /script-src 'unsafe-inline'/);
  assert.match(INTERACTIVE_VISUAL_CSP, /connect-src 'none'/);
  assert.match(INTERACTIVE_VISUAL_CSP, /frame-src 'none'/);
  assert.match(INTERACTIVE_VISUAL_CSP, /form-action 'none'/);
  assert.doesNotMatch(INTERACTIVE_VISUAL_CSP, /https?:/);
});
