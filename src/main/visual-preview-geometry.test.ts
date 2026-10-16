import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { inspectVisualPreviewGeometry } from "./visual-preview-geometry";

function setBox(element: Element, left: number, right: number): void {
  element.getBoundingClientRect = () => ({
    left, right, top: 0, bottom: 40, width: right - left, height: 40,
    x: left, y: 0, toJSON: () => ({}),
  });
}

test("off-screen tab labels are valid only when reachable in a contained horizontal scroller", () => {
  const dom = new JSDOM("<!doctype html><div id='tabs' style='overflow-x:auto'><button>Corner to corner</button></div><p id='spill'>Spilled text</p>", { runScripts: "outside-only" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    getComputedStyle: globalThis.getComputedStyle,
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  });
  try {
    const page = dom.window.document.documentElement;
    const tabs = dom.window.document.getElementById("tabs")!;
    const button = tabs.querySelector("button")!;
    const spill = dom.window.document.getElementById("spill")!;
    Object.defineProperties(page, {
      clientWidth: { value: 390, configurable: true },
      scrollWidth: { value: 390, configurable: true },
      scrollHeight: { value: 600, configurable: true },
    });
    Object.defineProperties(tabs, {
      clientWidth: { value: 330, configurable: true },
      scrollWidth: { value: 600, configurable: true },
    });
    Object.defineProperties(button, {
      clientWidth: { value: 140, configurable: true },
      scrollWidth: { value: 140, configurable: true },
    });
    setBox(tabs, 30, 360);
    setBox(button, 430, 570);
    setBox(spill, 20, 420);
    assert.deepEqual(inspectVisualPreviewGeometry().issues, ["Text outside viewport: Spilled text"]);
    const serialized = dom.window.eval(`(${inspectVisualPreviewGeometry.toString()})()`) as { issues: string[] };
    assert.deepEqual(Array.from(serialized.issues),
      ["Text outside viewport: Spilled text"]);

    setBox(button, 430, 790);
    assert.deepEqual(inspectVisualPreviewGeometry().issues, [
      "Text outside viewport: Corner to corner", "Text outside viewport: Spilled text",
    ]);

    setBox(button, 430, 570);
    setBox(tabs, 30, 420);
    assert.deepEqual(inspectVisualPreviewGeometry().issues, [
      "Text outside viewport: Corner to corner", "Text outside viewport: Spilled text",
    ]);
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
  }
});
