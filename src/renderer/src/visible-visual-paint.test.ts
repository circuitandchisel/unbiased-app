import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { afterVisibleVisualPaint } from "./visible-visual-paint";

function frameHarness() {
  const dom = new JSDOM("", { pretendToBeVisual: true });
  const doc = dom.window.document;
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 1;
  let visible = false;
  Object.defineProperty(doc, "visibilityState", { configurable: true, get: () => visible ? "visible" : "hidden" });
  dom.window.requestAnimationFrame = (callback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  };
  dom.window.cancelAnimationFrame = (id) => { frames.delete(id); };
  return {
    doc,
    frames,
    show() { visible = true; doc.dispatchEvent(new dom.window.Event("visibilitychange")); },
    hide() { visible = false; doc.dispatchEvent(new dom.window.Event("visibilitychange")); },
    tick() {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(0));
    },
    close() { dom.window.close(); },
  };
}

test("ready visuals count as painted only after a visible frame", () => {
  const view = frameHarness();
  let paints = 0;
  const stop = afterVisibleVisualPaint(view.doc, () => { paints++; });
  assert.equal(view.frames.size, 0);
  view.show();
  view.tick();
  assert.equal(paints, 0);
  view.tick();
  assert.equal(paints, 1);
  view.hide();
  view.show();
  view.tick();
  assert.equal(paints, 1);
  stop();
  view.close();
});

test("a hidden or removed visual does not report a paint", () => {
  const view = frameHarness();
  let paints = 0;
  const stop = afterVisibleVisualPaint(view.doc, () => { paints++; });
  view.show();
  view.tick();
  view.hide();
  assert.equal(view.frames.size, 0);
  view.show();
  stop();
  view.tick();
  assert.equal(paints, 0);
  view.close();
});

test("an offscreen visual waits to enter the viewport", () => {
  const view = frameHarness();
  const target = view.doc.createElement("div");
  let visibilityChange: ((visible: boolean) => void) | undefined;
  let disconnected = false;
  class Observer {
    constructor(callback: IntersectionObserverCallback) {
      visibilityChange = (visible) => callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
    observe() {}
    disconnect() { disconnected = true; }
  }
  view.doc.defaultView!.IntersectionObserver = Observer as unknown as typeof IntersectionObserver;
  let paints = 0;
  const stop = afterVisibleVisualPaint(view.doc, () => { paints++; }, target);
  view.show();
  view.tick();
  assert.equal(paints, 0);
  visibilityChange!(true);
  view.tick();
  view.tick();
  assert.equal(paints, 1);
  assert.equal(disconnected, true);
  stop();
  view.close();
});
