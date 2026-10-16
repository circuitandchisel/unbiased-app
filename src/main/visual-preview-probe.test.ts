import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { advanceFocusedSequence, discoverOpenUIControls, probeOpenUIControl, type OpenUIControlState } from "./visual-preview-probe";

test("OpenUI probe reports each visible control state and scene change", async () => {
  const dom = new JSDOM(`<div class="app-openui-visual"><button id="first" aria-label="First state">First</button><button id="second">Second</button><svg><circle id="shape" fill="red" /></svg><p id="result">Start</p></div>`, { runScripts: "dangerously", pretendToBeVisual: true });
  try {
    dom.window.document.getElementById("first")!.addEventListener("click", () => {
      dom.window.document.getElementById("shape")!.setAttribute("fill", "blue");
      dom.window.document.getElementById("result")!.textContent = "First result";
    });
    dom.window.document.getElementById("second")!.addEventListener("click", () => {
      dom.window.document.getElementById("shape")!.setAttribute("fill", "green");
      dom.window.document.getElementById("result")!.textContent = "Second result";
    });
    assert.equal(dom.window.eval(`(${discoverOpenUIControls.toString()})(".app-openui-visual button")`), 2);
    const first = await dom.window.eval(`(${probeOpenUIControl.toString()})(0)`) as OpenUIControlState;
    const second = await dom.window.eval(`(${probeOpenUIControl.toString()})(1)`) as OpenUIControlState;
    assert.deepEqual([first.label, first.changed, second.label, second.changed], ["First state", true, "Second", true]);
    assert.match(first.outcome, /First result/);
    assert.match(second.outcome, /Second result/);
  } finally {
    dom.window.close();
  }
});

test("focused sequence preview checks every live stage transition", async () => {
  const dom = new JSDOM('<section data-openui-focused-sequence data-openui-slide-count="2"><div data-openui-stage="1"><svg><circle fill="red"/></svg><p>Fold</p></div><button data-openui-next>Next</button></section>', { runScripts: "dangerously", pretendToBeVisual: true });
  try {
    const section = dom.window.document.querySelector("section")!;
    section.querySelector("button")!.addEventListener("click", () => {
      section.querySelector("[data-openui-stage]")!.setAttribute("data-openui-stage", "2");
      section.querySelector("circle")!.setAttribute("fill", "blue");
      section.querySelector("p")!.textContent = "Open";
    });
    const state = await dom.window.eval(`(${advanceFocusedSequence.toString()})()`) as Awaited<ReturnType<typeof advanceFocusedSequence>>;
    assert.deepEqual([state.stage, state.total, state.sceneChanged, state.textChanged], [2, 2, true, true]);
  } finally {
    dom.window.close();
  }
});
