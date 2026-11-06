import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";
import { INTERACTIVE_VISUAL_CSP, INTERACTIVE_VISUAL_PREVIEW_URL, MAX_INTERACTIVE_VISUAL_LENGTH, interactiveVisualDocument, interactiveVisualSourceIssue, interactiveVisualId, interactiveVisualPreviewCsp, interactiveVisualPreviewDocument, isInteractiveVisualPreviewUrl, isInteractiveVisualSource } from "../shared/interactive-visual";

test("only a visual URL with an exact ID can resolve a frame", () => {
  const url = "unbiased-visual://view/fe84ba18-a111-4c40-a556-f882ae77cb7d";
  assert.equal(interactiveVisualId(url), "fe84ba18-a111-4c40-a556-f882ae77cb7d");
  assert.equal(interactiveVisualId(`${url}?next=https://example.com`), null);
  assert.equal(interactiveVisualId(`${url}#other`), null);
  assert.equal(interactiveVisualId("unbiased-visual://evil/fe84ba18-a111-4c40-a556-f882ae77cb7d"), null);
  assert.equal(interactiveVisualId("https://example.com"), null);
});

test("accepts bounded HTML fragments but not whole documents or empty prose", () => {
  assert.equal(isInteractiveVisualSource('<div id="scene"></div><script>scene.textContent="Ready"</script>'), true);
  assert.equal(isInteractiveVisualSource("Just a description"), false);
  assert.equal(isInteractiveVisualSource("<!doctype html><html></html>"), false);
  assert.equal(isInteractiveVisualSource("<div>" + "x".repeat(MAX_INTERACTIVE_VISUAL_LENGTH)), false);
});

test("the visual document has a resize and theme bridge but no app bridge", () => {
  const document = interactiveVisualDocument('<button type="button">Next</button>');
  assert.match(document, /ResizeObserver/);
  assert.match(document, /document\.body\.scrollHeight/);
  assert.match(document, /observer\.observe\(document\.body\)/);
  assert.match(document, /unbiased-visual-height/);
  assert.match(document, /unbiased-visual-ready/);
  assert.match(document, /unbiased-visual-error/);
  assert.match(document, /--visual-accent/);
  assert.match(document, /body \{ margin: 0; padding: 16px;/);
  assert.match(document, /<button type="button">Next<\/button>/);
  assert.doesNotMatch(document, /window\.unbiased/);
});

test("frame height follows content instead of the current viewport height", async () => {
  const heights: number[] = [];
  const dom = new JSDOM(interactiveVisualDocument("<div>Small visual</div>"), {
    url: "https://visual.test", runScripts: "dangerously",
    beforeParse(window) {
      window.postMessage = ((data: { type: string; height?: number }) => {
        if (data.type === "unbiased-visual-height" && data.height !== undefined) heights.push(data.height);
      }) as typeof window.postMessage;
    },
  });
  try {
    await new Promise<void>((resolve) => dom.window.addEventListener("load", () => resolve(), { once: true }));
    Object.defineProperty(dom.window.document.documentElement, "scrollHeight", { configurable: true, value: 1600 });
    Object.defineProperty(dom.window.document.body, "scrollHeight", { configurable: true, value: 574 });
    dom.window.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
    assert.equal(heights.at(-1), 574);
  } finally {
    dom.window.close();
  }
});

test("completed visual reports height changes without repeating unchanged measurements", async () => {
  const heights: number[] = [];
  let triggerResize = () => {};
  const dom = new JSDOM(interactiveVisualDocument("<div>Measured visual</div>"), {
    url: "https://visual.test", runScripts: "dangerously",
    beforeParse(window) {
      Object.assign(window, { ResizeObserver: class {
        constructor(callback: () => void) { triggerResize = callback; }
        observe() {}
      } });
      window.postMessage = ((data: { type: string; height?: number }) => {
        if (data.type === "unbiased-visual-height" && data.height !== undefined) heights.push(data.height);
      }) as typeof window.postMessage;
    },
  });
  try {
    await new Promise<void>((resolve) => dom.window.addEventListener("load", () => resolve(), { once: true }));
    Object.defineProperty(dom.window.document.body, "scrollHeight", { configurable: true, value: 640 });
    triggerResize();
    const measured = heights.length;
    triggerResize();
    assert.equal(heights.length, measured);
    Object.defineProperty(dom.window.document.body, "scrollHeight", { configurable: true, value: 720 });
    triggerResize();
    assert.equal(heights.at(-1), 720);
  } finally {
    dom.window.close();
  }
});

test("expanded visual forwards wheel scrolling while preserving nested scrolling", async () => {
  const messages: { type: string; deltaY?: number }[] = [];
  const dom = new JSDOM(interactiveVisualDocument('<div id="nested" style="overflow-y:auto"><div>Content</div></div>'), {
    url: "https://visual.test", runScripts: "dangerously",
    beforeParse(window) {
      window.postMessage = ((data: { type: string; deltaY?: number }) => {
        messages.push(data);
      }) as typeof window.postMessage;
    },
  });
  try {
    await new Promise<void>((resolve) => dom.window.addEventListener("load", () => resolve(), { once: true }));
    const { window } = dom;
    const nested = window.document.getElementById("nested")!;
    const wheel = (target: Element) => target.dispatchEvent(new window.WheelEvent("wheel", {
      bubbles: true, cancelable: true, deltaY: 100,
    }));
    assert.equal(wheel(nested), true);
    window.dispatchEvent(new window.MessageEvent("message", { source: window.parent, data: { type: "unbiased-visual-expanded", expanded: true } }));
    assert.equal(wheel(nested), false);
    assert.equal(messages.at(-1)?.type, "unbiased-visual-wheel");
    assert.equal(messages.at(-1)?.deltaY, 100);

    Object.defineProperties(nested, { scrollHeight: { configurable: true, value: 500 }, clientHeight: { configurable: true, value: 100 }, scrollTop: { configurable: true, value: 0, writable: true } });
    assert.equal(wheel(nested), true);
    assert.equal(messages.at(-1)?.type, "unbiased-visual-wheel");
    window.dispatchEvent(new window.MessageEvent("message", { source: window.parent, data: { type: "unbiased-visual-expanded", expanded: false } }));
    nested.scrollTop = 400;
    assert.equal(wheel(nested), true);
  } finally {
    dom.window.close();
  }
});

test("a completed visual reports its initialization failure rather than silently leaving a blank panel", async () => {
  const events: { type: string; kind?: string; detail?: string }[] = [];
  const source = `<div id="quiz"></div><script>
    const miniMap = document.createElement('div');
    function showScene(i) { miniMap.children[idx].classList.add('active'); }
    showScene(0);
    document.getElementById('quiz').textContent = "Who's who?";
  </script>`;
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(interactiveVisualDocument(source), {
    url: "https://visual.test", runScripts: "dangerously", virtualConsole,
    beforeParse(window) {
      window.postMessage = ((data: { type: string; kind?: string; detail?: string }) => {
        events.push(data);
      }) as typeof window.postMessage;
    },
  });
  try {
    await new Promise<void>((resolve) => dom.window.addEventListener("load", () => resolve(), { once: true }));
    assert.ok(events.some((event) => event.type === "unbiased-visual-error" &&
      event.kind === "runtime-error" && event.detail?.includes("idx is not defined")));
    assert.ok(events.some((event) => event.type === "unbiased-visual-ready"));
    assert.equal(dom.window.document.getElementById("quiz")?.textContent, "");
  } finally {
    dom.window.close();
  }
});

test("the frame policy permits inline interaction without network or nested frames", () => {
  assert.match(INTERACTIVE_VISUAL_CSP, /script-src 'unsafe-inline'/);
  assert.match(INTERACTIVE_VISUAL_CSP, /connect-src 'none'/);
  assert.match(INTERACTIVE_VISUAL_CSP, /frame-src 'none'/);
  assert.match(INTERACTIVE_VISUAL_CSP, /form-action 'none'/);
  assert.doesNotMatch(INTERACTIVE_VISUAL_CSP, /https?:/);
});

test("the preview route uses only app-owned script and no generated script permission", () => {
  const nonce = "safe-preview-nonce";
  const doc = interactiveVisualPreviewDocument(nonce);
  const csp = interactiveVisualPreviewCsp(nonce);
  assert.equal(isInteractiveVisualPreviewUrl(INTERACTIVE_VISUAL_PREVIEW_URL), true);
  assert.equal(isInteractiveVisualPreviewUrl(`${INTERACTIVE_VISUAL_PREVIEW_URL}?next=1`), false);
  assert.match(doc, /visual-preview-style/);
  assert.match(doc, /scrollbar-gutter: stable/);
  assert.match(doc, /unbiased-visual-preview-ready/);
  assert.match(doc, /script nonce="safe-preview-nonce"/);
  assert.match(csp, /script-src 'nonce-safe-preview-nonce'/);
  assert.doesNotMatch(csp.match(/script-src[^;]*/)?.[0] ?? "", /unsafe-inline/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /frame-src 'none'/);
  assert.doesNotMatch(doc, /window\.unbiased/);
});

test("streaming preview updates preserve existing visual nodes", async () => {
  const dom = new JSDOM(interactiveVisualPreviewDocument("test-nonce"), {
    url: "https://visual.test", runScripts: "dangerously",
  });
  try {
    await new Promise<void>((resolve) => dom.window.addEventListener("load", () => resolve(), { once: true }));
    const update = (html: string, css: string) => dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
      source: dom.window.parent,
      data: { type: "unbiased-visual-preview", html, css },
    }));
    update('<section id="scene"><div id="first" class="old">Step 1</div></section>', ".old { color: red; }");
    const scene = dom.window.document.getElementById("scene");
    const first = dom.window.document.getElementById("first");
    const style = dom.window.document.getElementById("visual-preview-style");
    assert.ok(scene && first && style);

    update('<section id="scene"><div id="first">Step 1 complete</div><svg id="second"><circle r="2"></circle></svg></section>', ".old { color: red; }");
    assert.equal(dom.window.document.getElementById("scene"), scene);
    assert.equal(dom.window.document.getElementById("first"), first);
    assert.equal(dom.window.document.getElementById("visual-preview-style"), style);
    assert.equal(first.textContent, "Step 1 complete");
    assert.equal(first.hasAttribute("class"), false);
    assert.equal(dom.window.document.querySelector("#second circle")?.getAttribute("r"), "2");

    update('<section id="scene"><div id="first">Step 1 complete</div></section>', ".old { color: blue; }");
    assert.equal(dom.window.document.getElementById("scene"), scene);
    assert.equal(dom.window.document.getElementById("second"), null);
    assert.equal(style.textContent, ".old { color: blue; }");
  } finally {
    dom.window.close();
  }
});

test("completed visual structure catches a style block swallowing the diagram", () => {
  assert.match(interactiveVisualSourceIssue('<div><style>.flow { color: red; }</div><p>Flow</p>') ?? "", /unclosed <style>/);
  assert.match(interactiveVisualSourceIssue('<div>Flow</div><script>const step = 1;') ?? "", /unclosed <script>/);
  assert.equal(interactiveVisualSourceIssue('<style>.flow { color: red; }</style><div>Flow</div>'), null);
  assert.equal(interactiveVisualSourceIssue('<script>const example = "<style>";</script><div>Flow</div>'), null);
});
