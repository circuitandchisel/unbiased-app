import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { InteractiveHtmlVisual } from "./interactive-html-visual";
import { GeneratedVisualViewport } from "./generated-visual-viewport";

test("sizes a long visual to its content so the transcript owns scrolling", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.assign(dom.window, { unbiased: { registerVisual: async () => "unbiased-visual://view/test-id" } });
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(<InteractiveHtmlVisual source="<main>Guide</main>" />));
    const frame = dom.window.document.querySelector("iframe")!;
    assert.ok(frame);
    const report = (type: string, height?: number) => dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
      source: frame.contentWindow, origin: "null", data: { type, height },
    }));
    await act(async () => {
      report("unbiased-visual-height", 3471);
      report("unbiased-visual-ready");
    });
    assert.equal(frame.style.height, "3471px");
    await act(async () => report("unbiased-visual-height", 100_000));
    assert.equal(frame.style.height, "8000px");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});

test("matches the generated surface without adding a second card", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.assign(dom.window, { unbiased: { registerVisual: async () => "unbiased-visual://view/test-id" } });
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(
      <GeneratedVisualViewport streaming={false}><InteractiveHtmlVisual source="<main>Guide</main>" /></GeneratedVisualViewport>,
    ));
    const visual = dom.window.document.querySelector<HTMLElement>('[aria-label="Interactive visual"]')!;
    const frame = visual.querySelector("iframe")!;
    await act(async () => dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
      source: frame.contentWindow, origin: "null",
      data: { type: "unbiased-visual-surface", color: "rgb(255, 255, 255)" },
    })));
    const viewport = dom.window.document.querySelector<HTMLElement>(".app-generated-visual-viewport")!;
    assert.equal(visual.style.backgroundColor, "rgb(255, 255, 255)");
    assert.equal(viewport.style.getPropertyValue("--visual-control-bg"), "rgb(255, 255, 255)");
    assert.equal(viewport.style.getPropertyValue("--visual-control-fg"), "#000000");
    await act(async () => dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
      source: frame.contentWindow, origin: "null",
      data: { type: "unbiased-visual-surface", color: "rgb(20, 20, 20)" },
    })));
    assert.equal(viewport.style.getPropertyValue("--visual-control-bg"), "rgb(20, 20, 20)");
    assert.equal(viewport.style.getPropertyValue("--visual-control-fg"), "#ffffff");
    assert.equal(visual.style.border, "");
    assert.equal(visual.style.boxShadow, "");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});

test("sends the inherited light and dark host themes to the visual frame", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.assign(dom.window, { unbiased: { registerVisual: async () => "unbiased-visual://view/test-id" } });
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  const setTheme = (bg: string, fg: string) => {
    container.style.setProperty("--bg", bg);
    container.style.setProperty("--fg-msg", fg);
    container.style.setProperty("--dim", fg);
    container.style.setProperty("--accent", "#ff563f");
  };
  try {
    setTheme("#ffffff", "#111111");
    await act(async () => root.render(<InteractiveHtmlVisual source="<main>Guide</main>" />));
    const frame = container.querySelector("iframe")!;
    const frameWindow = frame.contentWindow!;
    const messages: Array<{ type?: string; colors?: Record<string, string>; scheme?: string }> = [];
    frameWindow.postMessage = ((data: (typeof messages)[number]) => { messages.push(data); }) as typeof frameWindow.postMessage;
    await act(async () => frame.dispatchEvent(new dom.window.Event("load")));
    assert.deepEqual(messages.find((message) => message.type === "unbiased-visual-theme"), {
      type: "unbiased-visual-theme",
      colors: { bg: "#ffffff", fg: "#111111", muted: "#111111", accent: "#ff563f" },
      scheme: "light",
    });
    await act(async () => { setTheme("#111111", "#eeeeee"); await Promise.resolve(); });
    assert.equal(messages.filter((message) => message.type === "unbiased-visual-theme").at(-1)?.colors?.bg, "#111111");
    assert.equal(messages.filter((message) => message.type === "unbiased-visual-theme").at(-1)?.scheme, "dark");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});

test("expanding the visual changes iframe scale without replacing the frame", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.assign(dom.window, { unbiased: { registerVisual: async () => "unbiased-visual://view/test-id" } });
  Object.defineProperty(dom.window, "innerWidth", { configurable: true, value: 1200 });
  const nativeMatches = dom.window.Element.prototype.matches;
  dom.window.Element.prototype.matches = (function (this: Element, selector: string) {
    if (selector === ":popover-open") return this.hasAttribute("popover");
    return nativeMatches.call(this, selector);
  }) as typeof nativeMatches;
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(
      <GeneratedVisualViewport streaming={false}><InteractiveHtmlVisual source="<main>Guide</main>" /></GeneratedVisualViewport>,
    ));
    const viewport = dom.window.document.querySelector<HTMLElement>(".app-generated-visual-viewport")!;
    const frame = viewport.querySelector("iframe")!;
    const frameWindow = frame.contentWindow!;
    const messages: { type?: string; scale?: number }[] = [];
    frameWindow.postMessage = ((data: { type?: string; scale?: number }) => { messages.push(data); }) as typeof frameWindow.postMessage;
    const toggle = (newState: "open" | "closed") => {
      const event = new dom.window.Event("toggle") as Event & { newState: string };
      event.newState = newState;
      viewport.dispatchEvent(event);
    };
    await act(async () => { viewport.setAttribute("popover", "auto"); toggle("open"); });
    assert.ok(messages.some((message) => message.type === "unbiased-visual-view-scale" && message.scale === 1.35));
    await act(async () => { viewport.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')!.click(); });
    assert.equal(messages.filter((message) => message.type === "unbiased-visual-view-scale").at(-1)?.scale, 1.6);
    await act(async () => { viewport.removeAttribute("popover"); toggle("closed"); });
    assert.equal(messages.filter((message) => message.type === "unbiased-visual-view-scale").at(-1)?.scale, 1);
    assert.equal(viewport.querySelector("iframe"), frame);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
