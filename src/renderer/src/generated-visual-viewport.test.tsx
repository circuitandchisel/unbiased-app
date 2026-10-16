import assert from "node:assert/strict";
import test from "node:test";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { GeneratedVisualViewport } from "./generated-visual-viewport";

test("expands only the existing visual in an app overlay and restores focus", async () => {
  const dom = new JSDOM("<!doctype html><div data-transcript-scroll><div id='root'></div></div>", { url: "http://localhost", pretendToBeVisual: true });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const document = dom.window.document;
  const transcript = document.querySelector<HTMLElement>("[data-transcript-scroll]")!;
  transcript.scrollTop = 314;
  let focusedWithoutScrolling = false;
  const focus = dom.window.HTMLElement.prototype.focus;
  dom.window.HTMLElement.prototype.focus = function (options?: FocusOptions) {
    focusedWithoutScrolling = options?.preventScroll === true;
    focus.call(this, options);
  };
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => null });
  dom.window.HTMLElement.prototype.requestFullscreen = async () => {
    throw new Error("The app must not enter OS fullscreen");
  };
  const toggle = (element: HTMLElement, newState: "open" | "closed") => {
    const event = new dom.window.Event("toggle") as Event & { newState: string };
    event.newState = newState;
    element.dispatchEvent(event);
  };
  dom.window.HTMLElement.prototype.showPopover = function () {
    transcript.scrollTop = 90;
    toggle(this, "open");
  };
  dom.window.HTMLElement.prototype.hidePopover = function () {
    transcript.scrollTop = 140;
    toggle(this, "closed");
  };

  function Counter() {
    const [count, setCount] = useState(0);
    return <button type="button" onClick={() => setCount((value) => value + 1)}>Count {count}</button>;
  }

  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<GeneratedVisualViewport streaming={false}><Counter /></GeneratedVisualViewport>));
    const visual = document.querySelector<HTMLElement>(".app-generated-visual-viewport")!;
    const counter = visual.querySelector(":scope > button:last-child")!;
    const expandButton = document.querySelector<HTMLButtonElement>('button[aria-label="Expand visual"]')!;
    await act(async () => { expandButton.click(); });
    assert.equal(document.fullscreenElement, null);
    assert.equal(visual.getAttribute("popover"), "auto");
    assert.equal(expandButton.getAttribute("aria-label"), "Close expanded visual");
    assert.equal(document.querySelector('output[aria-label="Zoom level"]')?.textContent, "135%");
    const zoomIn = document.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')!;
    const zoomOut = document.querySelector<HTMLButtonElement>('button[aria-label="Zoom out"]')!;
    await act(async () => { zoomIn.click(); });
    assert.equal(visual.style.getPropertyValue("--visual-zoom"), "1.6");
    assert.equal(document.querySelector('output[aria-label="Zoom level"]')?.textContent, "160%");
    await act(async () => { zoomOut.click(); });
    assert.equal(visual.style.getPropertyValue("--visual-zoom"), "1.35");

    await act(async () => { (counter as HTMLButtonElement).click(); });
    assert.equal(visual.querySelector(":scope > button:last-child"), counter);
    assert.match(counter.textContent ?? "", /Count 1/);

    await act(async () => { (visual as HTMLElement).hidePopover(); });
    assert.equal(visual.hasAttribute("popover"), false);
    assert.equal(expandButton.getAttribute("aria-label"), "Expand visual");
    assert.equal(document.querySelector('button[aria-label="Zoom in"]'), null);
    assert.equal(document.activeElement, expandButton);
    assert.equal(focusedWithoutScrolling, true);
    assert.equal(transcript.scrollTop, 314);
    assert.equal(visual.querySelector(":scope > button:last-child"), counter);
    await new Promise((resolve) => dom.window.requestAnimationFrame(resolve));
    assert.equal(transcript.scrollTop, 314);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});

test("does not offer expansion for an unfinished visual", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(<GeneratedVisualViewport streaming><span>Loading</span></GeneratedVisualViewport>));
    assert.equal(dom.window.document.querySelector(".app-generated-visual-viewport__toggle"), null);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
