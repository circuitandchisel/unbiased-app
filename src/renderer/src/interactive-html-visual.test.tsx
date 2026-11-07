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

test("revealing an ancestor asks an unready frame to recheck content without resize delivery", async () => {
  const dom = new JSDOM("<!doctype html><section id='pane' style='display:none'><div id='root'></div></section>", { url: "http://localhost", pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(dom.window, { unbiased: { registerVisual: async () => "about:blank" } });
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(<InteractiveHtmlVisual source="<div>Hidden scene</div>" />));
    const pane = dom.window.document.getElementById("pane")!;
    const frame = pane.querySelector<HTMLIFrameElement>('iframe[title="Interactive visual"]')!;
    const messages: { type?: string }[] = [];
    frame.contentWindow!.postMessage = (data: { type?: string }) => { messages.push(data); };
    frame.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, bottom: 96, right: 320, width: pane.style.display === "none" ? 0 : 320, height: pane.style.display === "none" ? 0 : 96, toJSON: () => ({}) });
    await act(async () => { pane.style.display = "block"; await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.ok(messages.some(message => message.type === "unbiased-visual-check-readiness"));
    await act(async () => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: "null", data: { type: "unbiased-visual-ready", hasContent: true } })));
    messages.length = 0;
    await act(async () => { pane.style.padding = "10px"; });
    assert.equal(messages.length, 0, "ready frames stop observing ancestor attribute changes");
  } finally {
    await act(async () => root.unmount()); dom.window.close();
  }
});
