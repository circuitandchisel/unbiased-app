import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import spec from "@unbiased/iui/spec";
import { appOpenUILibrary, inspectOpenUI, visualFenceContent } from "./openui-visual";

test("registers every published component in the app's single renderer", () => {
  for (const name of Object.keys(spec.components)) assert.ok(appOpenUILibrary.components[name], name);
  for (const name of ["Whiteboard", "Mermaid", "VisualHtml"]) assert.ok(appOpenUILibrary.components[name]);
});

test("validates complete programs and rejects unsupported or unsafe content", () => {
  assert.equal(inspectOpenUI('root = Stack([TextContent("Hello")])').valid, true);
  assert.equal(inspectOpenUI('root = Stack([Table([Col("Name", ["Ada"])])])').valid, true);
  assert.equal(inspectOpenUI('root = Stack([Mermaid("flowchart LR\\nA-->B")])').valid, true);
  assert.equal(inspectOpenUI('root = Stack([Unknown("oops")])').valid, false);
  assert.equal(inspectOpenUI('root = Stack([TextContent("https://example.com")])').valid, false);
  assert.equal(inspectOpenUI('root = Stack([TextContent("unfinished")').valid, false);
  assert.equal(inspectOpenUI("x".repeat(256_001)).valid, false);
  const board = 'root = Stack([Whiteboard("Graph", [{id:"a",type:"circle",x:1,y:1,width:40},{id:"b",type:"circle",x:100,y:1,width:40},{id:"e",type:"connector",from:"a",to:"b"}])])';
  assert.deepEqual(inspectOpenUI(board), { valid: true, selfFramed: true });
  assert.equal(inspectOpenUI(board.replace('to:"b"', 'to:"missing"')).valid, false);
  const steps = 'root = Stack([GuidedExplainer("Journey", "Summary", [{id:"same",title:"One",heading:"First",description:"Start"},{id:"same",title:"Two",heading:"Second",description:"Finish"}])])';
  assert.equal(inspectOpenUI(steps).valid, false);
});

test("hides source while streaming and after validation failure", () => {
  const source = 'root = Stack([TextContent("private visual source")])';
  const pending = renderToStaticMarkup(visualFenceContent("openui", source, true)!);
  assert.match(pending, /Preparing visual/);
  assert.doesNotMatch(pending, /private visual source/);
  const failed = renderToStaticMarkup(visualFenceContent("openui", "root = Stack([", false)!);
  assert.match(failed, /couldn&#x27;t be displayed/);
  assert.equal(visualFenceContent("json", source, false), null);
  assert.ok(visualFenceContent("mermaid", "flowchart LR\nA-->B", false));
});

test("renders a library component through OpenUI", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(visualFenceContent("openui", 'root = Stack([TextContent("Hello from OpenUI"), Table([Col("Name", ["Ada"]), Col("Role", ["Engineer"])])])', false)));
    assert.match(dom.window.document.body.textContent ?? "", /Hello from OpenUI/);
    assert.match(dom.window.document.body.textContent ?? "", /Engineer/);
    assert.ok(dom.window.document.querySelector("table"));
    assert.ok(dom.window.document.querySelector('[aria-label="Interactive visual"]'));
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});

test("routes standalone HTML through OpenUI into a sandboxed frame", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.assign(dom.window, { unbiased: { registerVisual: async () => "unbiased-visual://view/test-id" } });
  const source = '<button id="secret-source">Next</button><script>document.querySelector("button").onclick=()=>{}</script>';
  const pending = renderToStaticMarkup(visualFenceContent("visual-html", source, true)!);
  assert.match(pending, /Preparing visual/);
  assert.doesNotMatch(pending, /secret-source/);
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(visualFenceContent("visual-html", source, false)));
    const frame = dom.window.document.querySelector("iframe");
    assert.ok(frame);
    assert.equal(frame.getAttribute("sandbox"), "allow-scripts");
    assert.equal(frame.getAttribute("src"), "unbiased-visual://view/test-id");
    assert.doesNotMatch(dom.window.document.body.innerHTML, /secret-source/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
