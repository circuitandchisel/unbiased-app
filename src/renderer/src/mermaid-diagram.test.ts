import assert from "node:assert/strict";
import test from "node:test";
import { fitMermaidWidth } from "./mermaid-diagram";

test("fits wide and tall diagrams without clipping the default viewport", () => {
  assert.equal(fitMermaidWidth(817, 960, 556, 531), 649);
  assert.equal(fitMermaidWidth(357, 960, 556, 531), 305);
  assert.equal(fitMermaidWidth(817, 960, 220, 1000), 136);
});

test("does not enlarge a small diagram excessively", () => {
  assert.equal(fitMermaidWidth(817, 960, 120, 100), 168);
});
