import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { probeScriptedVisual } from "./visual-scripted-probe";

test("scripted preview accepts interaction results only from its sandboxed frame", async () => {
  const dom = new JSDOM('<div class="app-openui-visual"><iframe style="visibility:visible"></iframe></div>');
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  try {
    const frame = dom.window.document.querySelector("iframe")!;
    frame.contentWindow!.postMessage = (message: unknown) => {
      const requestId = (message as { requestId: string }).requestId;
      dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
        source: dom.window as unknown as Window, origin: "null",
        data: { type: "unbiased-visual-preview-result", requestId, tested: 999 },
      }));
      dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
        source: frame.contentWindow, origin: "null",
        data: { type: "unbiased-visual-preview-result", requestId, tested: 1,
          states: [{ label: "Next", outcome: "The piece moved" }], issues: [], navigationOnly: false },
      }));
    };
    assert.deepEqual(await probeScriptedVisual(), {
      tested: 1, states: [{ label: "Next", outcome: "The piece moved" }], issues: [], navigationOnly: false,
    });
  } finally {
    Object.assign(globalThis, { window: previousWindow, document: previousDocument });
    dom.window.close();
  }
});
