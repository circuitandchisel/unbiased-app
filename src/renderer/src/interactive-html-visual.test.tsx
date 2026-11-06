import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { GeneratedVisualViewport } from "./generated-visual-viewport";
import { InteractiveHtmlVisual } from "./interactive-html-visual";

test("expanded HTML visual uses its full reported height and restores the inline cap", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", {
    url: "http://localhost", pretendToBeVisual: true,
  });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.assign(dom.window, { unbiased: { registerVisual: async () => "about:blank" } });
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(<GeneratedVisualViewport><InteractiveHtmlVisual source="<div>Long visual</div>" /></GeneratedVisualViewport>));
    const viewport = dom.window.document.querySelector<HTMLElement>(".app-generated-visual-viewport")!;
    const frame = viewport.querySelector<HTMLIFrameElement>('iframe[title="Interactive visual"]')!;
    await act(async () => {
      dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
        source: frame.contentWindow, origin: "null", data: { type: "unbiased-visual-height", height: 2600 },
      }));
      dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
        source: frame.contentWindow, origin: "null", data: { type: "unbiased-visual-ready" },
      }));
    });
    assert.equal(frame.style.height, "1600px");

    const toggle = async (newState: "open" | "closed") => {
      const event = new dom.window.Event("toggle") as Event & { newState: string };
      event.newState = newState;
      await act(async () => viewport.dispatchEvent(event));
    };
    await toggle("open");
    assert.equal(frame.style.height, "2600px");
    await toggle("closed");
    assert.equal(frame.style.height, "1600px");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});

test("a completed visual reserves its measured height while a remounted frame loads", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", {
    url: "http://localhost", pretendToBeVisual: true,
  });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
  });
  let registrations = 0;
  Object.assign(dom.window, { unbiased: { registerVisual: async () => {
    registrations++;
    return "about:blank";
  } } });
  const container = dom.window.document.getElementById("root")!;
  const source = "<div>Measured visual on remount</div>";
  let root = createRoot(container);
  try {
    await act(async () => root.render(<InteractiveHtmlVisual source={source} />));
    let frame = container.querySelector<HTMLIFrameElement>('iframe[title="Interactive visual"]')!;
    await act(async () => {
      dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
        source: frame.contentWindow, origin: "null", data: { type: "unbiased-visual-height", height: 1180 },
      }));
      dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
        source: frame.contentWindow, origin: "null", data: { type: "unbiased-visual-ready" },
      }));
    });
    assert.equal(frame.style.height, "1180px");
    await act(async () => root.unmount());

    root = createRoot(container);
    await act(async () => root.render(<InteractiveHtmlVisual source={source} />));
    const visual = container.querySelector<HTMLElement>(".app-interactive-html-visual")!;
    frame = visual.querySelector<HTMLIFrameElement>('iframe[title="Interactive visual"]')!;
    assert.equal(registrations, 2);
    assert.equal(visual.style.minHeight, "1180px");
    assert.equal(frame.style.visibility, "hidden");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
