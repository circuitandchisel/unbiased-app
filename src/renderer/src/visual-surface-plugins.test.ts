import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement, StrictMode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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

test("keeps incomplete A2UI source hidden while streaming and after failure", async () => {
  const { visualFenceContent } = await import("./visual-surface-plugins");
  const incomplete = '{"private":"raw A2UI source"';
  const pending = renderToStaticMarkup(visualFenceContent("a2ui", incomplete, true)!);
  assert.match(pending, /Preparing visual/);
  assert.doesNotMatch(pending, /raw A2UI source/);

  const failed = renderToStaticMarkup(visualFenceContent("a2ui", incomplete, false)!);
  assert.match(failed, /Could not display this visual/);
  assert.doesNotMatch(failed, /raw A2UI source/);
  assert.equal(visualFenceContent("json", incomplete, true), null);
  assert.ok(visualFenceContent("a2ui", JSON.stringify(messages), true));
});

test("renders a Card with model-generated children and keeps its slider interactive", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { createRoot } = await import("react-dom/client");
  const { visualSurfaceForFence } = await import("./visual-surface-plugins");
  const graph = structuredClone(messages);
  graph[1].updateComponents!.components = [
    { id: "root", component: "Column", children: ["card"] },
    { id: "card", component: "Card", children: ["chart", "slider"] },
    ...graph[1].updateComponents!.components.slice(1),
  ];
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(StrictMode, null, visualSurfaceForFence("a2ui", JSON.stringify(graph)))));
    const visual = container.querySelector('[aria-label="Interactive visual"]') as HTMLElement | null;
    assert.equal(visual?.style.overflowX, "clip");
    assert.equal(visual?.style.getPropertyValue("--a2ui-card-border-radius"), "28px");
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

test("renders the bundled local layout and input components", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { createRoot } = await import("react-dom/client");
  const { visualSurfaceForFence } = await import("./visual-surface-plugins");
  const controls = [
    { version: "v0.9", createSurface: { surfaceId: "controls", catalogId: VISUAL_CATALOG_ID } },
    { version: "v0.9", updateComponents: { surfaceId: "controls", components: [
      { id: "root", component: "Column", children: ["icon", "list", "tabs", "name", "agree", "choice", "date"] },
      { id: "icon", component: "Icon", name: "info" },
      { id: "list", component: "List", children: ["item"] },
      { id: "item", component: "Text", text: "First item" },
      { id: "tabs", component: "Tabs", tabs: [{ title: "First", child: "first" }, { title: "Second", child: "second" }] },
      { id: "first", component: "Text", text: "First panel" },
      { id: "second", component: "Text", text: "Second panel" },
      { id: "name", component: "TextField", label: "Name", value: { path: "/name" } },
      { id: "agree", component: "CheckBox", label: "Agree", value: { path: "/agree" } },
      { id: "choice", component: "ChoicePicker", label: "Color", options: [{ label: "Red", value: "red" }], value: { path: "/colors" } },
      { id: "date", component: "DateTimeInput", label: "Date", value: { path: "/date" }, enableDate: true },
    ] } },
    { version: "v0.9", updateDataModel: { surfaceId: "controls", path: "/", value: { name: "Maya", agree: false, colors: [], date: "" } } },
  ];
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(StrictMode, null, visualSurfaceForFence("a2ui", JSON.stringify(controls)))));
    assert.match(container.textContent ?? "", /First item/);
    assert.match(container.textContent ?? "", /First panel/);
    assert.equal((container.querySelector('input[type="text"]') as HTMLInputElement | null)?.value, "Maya");
    assert.ok(container.querySelector('input[type="checkbox"]'));
    await act(async () => {
      Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Second")?.click();
    });
    assert.match(container.textContent ?? "", /Second panel/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});

test("renders a saved model reply with Text.value inside a Card", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { createRoot } = await import("react-dom/client");
  const { visualSurfaceForFence } = await import("./visual-surface-plugins");
  const reply = [
    { version: "v0.9", createSurface: { surfaceId: "graph-explainer", catalogId: VISUAL_CATALOG_ID } },
    { version: "v0.9", updateComponents: { surfaceId: "graph-explainer", components: [
      { id: "root", component: "Column", children: ["intro", "slider", "chart"] },
      { id: "intro", component: "Card", children: ["intro-text"] },
      { id: "intro-text", component: "Text", value: "A graph connects dots with lines." },
      { id: "slider", component: "Slider", label: "Friends", value: { path: "/friends" }, min: 2, max: 10 },
      { id: "chart", component: "BarChart", title: "Reach", bars: [{ label: "One step", value: { path: "/friends" } }] },
    ] } },
    { version: "v0.9", updateDataModel: { surfaceId: "graph-explainer", path: "/", value: { friends: 4 } } },
  ];
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(StrictMode, null, visualSurfaceForFence("a2ui", JSON.stringify(reply)))));
    assert.match(container.textContent ?? "", /A graph connects dots with lines/);
    assert.equal(container.querySelector('[role="meter"][aria-label="One step"]')?.getAttribute("aria-valuenow"), "4");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});

test("registers the whiteboard in the saved A2UI catalog", async () => {
  const { visualSurfaceForFence } = await import("./visual-surface-plugins");
  const board = [
    { version: "v0.9", createSurface: { surfaceId: "board", catalogId: VISUAL_CATALOG_ID } },
    { version: "v0.9", updateComponents: { surfaceId: "board", components: [
      { id: "root", component: "Column", children: ["drawing", "directed"] },
      { id: "drawing", component: "Whiteboard", title: "Graph", shapes: [
        { id: "node", type: "circle", x: 100, y: 100, width: 80, fill: "#5da5e8", label: "Maya" },
      ] },
      { id: "directed", component: "Whiteboard", title: "Directed graph", shapes: [
        { id: "source", type: "circle", x: 100, y: 100, width: 80, label: "Maya" },
        { id: "target", type: "circle", x: 300, y: 100, width: 80, label: "Sam" },
        { id: "edge", type: "connector", from: "source", to: "target", label: "follows" },
      ] },
    ] } },
  ];
  assert.ok(visualSurfaceForFence("a2ui", JSON.stringify(board)));
});
