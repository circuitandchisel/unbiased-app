import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement, StrictMode } from "react";
import { JSDOM } from "jsdom";
import { VISUAL_CATALOG_ID } from "./a2ui-payload";

const messages = [
  { version: "v0.9", createSurface: { surfaceId: "visual", catalogId: VISUAL_CATALOG_ID } },
  { version: "v0.9", updateComponents: { surfaceId: "visual", components: [
    { id: "root", component: "Column", children: ["slider", "chart"] },
    { id: "slider", component: "Slider", label: "Amount", value: { path: "/amount" }, min: 0, max: 100 },
    { id: "chart", component: "BarChart", title: "Result", bars: [
      { label: "Capacity", value: 100 }, { label: "Selected", value: { path: "/amount" } },
    ] },
  ] } },
  { version: "v0.9", updateDataModel: { surfaceId: "visual", path: "/", value: { amount: 50 } } },
];

test("renders a saved A2UI visual and updates it from its slider", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { createRoot } = await import("react-dom/client");
  const { visualSurfaceForFence } = await import("./visual-surface-plugins");
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(StrictMode, null, visualSurfaceForFence("a2ui", JSON.stringify(messages)))));
    const selected = container.querySelector('[role="meter"][aria-label="Selected"]');
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement | null;
    assert.equal(selected?.getAttribute("aria-valuenow"), "50");
    assert.ok(slider);
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(slider, "75");
      slider.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      slider.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    assert.equal(selected?.getAttribute("aria-valuenow"), "75");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});

test("does not replace unsupported or malformed fences", async () => {
  const { visualSurfaceForFence } = await import("./visual-surface-plugins");
  assert.equal(visualSurfaceForFence("json", JSON.stringify(messages)), null);
  assert.equal(visualSurfaceForFence("a2ui", "{"), null);
  const invalid = structuredClone(messages);
  invalid[1].updateComponents!.components[2].bars = [];
  assert.equal(visualSurfaceForFence("a2ui", JSON.stringify(invalid)), null);
});
