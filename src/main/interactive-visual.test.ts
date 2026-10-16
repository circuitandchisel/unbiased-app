import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";
import { INTERACTIVE_VISUAL_CSP, MAX_INTERACTIVE_VISUAL_LENGTH, interactiveVisualDocument, interactiveVisualId, isInteractiveVisualSource } from "../shared/interactive-visual";

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
  assert.match(document, /unbiased-visual-height/);
  assert.match(document, /unbiased-visual-ready/);
  assert.match(document, /unbiased-visual-error/);
  assert.match(document, /--visual-accent/);
  assert.match(document, /<button type="button">Next<\/button>/);
  assert.doesNotMatch(document, /window\.unbiased/);
});

test("height bridge reports content height rather than the iframe viewport", async () => {
  const events: { type: string; height?: number }[] = [];
  const dom = new JSDOM(interactiveVisualDocument('<div>Short visual</div>'), {
    url: "https://visual.test", runScripts: "dangerously",
    beforeParse(window) {
      window.postMessage = ((data: { type: string; height?: number }) => { events.push(data); }) as typeof window.postMessage;
    },
  });
  try {
    Object.defineProperty(dom.window.document.body, "scrollHeight", { value: 657 });
    Object.defineProperty(dom.window.document.documentElement, "scrollHeight", { value: 1400 });
    await new Promise<void>((resolve) => dom.window.addEventListener("load", () => resolve(), { once: true }));
    assert.equal(events.find((event) => event.type === "unbiased-visual-height")?.height, 657);
  } finally {
    dom.window.close();
  }
});

test("expanded visual scale enlarges the reported height and restores it on close", async () => {
  const events: { type: string; height?: number }[] = [];
  const dom = new JSDOM(interactiveVisualDocument('<div>Visual</div>'), {
    url: "https://visual.test", runScripts: "dangerously", pretendToBeVisual: true,
    beforeParse(window) {
      window.postMessage = ((data: { type: string; height?: number }) => { events.push(data); }) as typeof window.postMessage;
    },
  });
  try {
    Object.defineProperty(dom.window.document.body, "scrollHeight", { value: 657 });
    await new Promise<void>((resolve) => dom.window.addEventListener("load", () => resolve(), { once: true }));
    const setScale = (scale: number) => dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
      source: dom.window.parent, data: { type: "unbiased-visual-view-scale", scale },
    }));
    setScale(1.35);
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(dom.window.document.documentElement.style.zoom, "1.35");
    assert.equal(events.filter((event) => event.type === "unbiased-visual-height").at(-1)?.height, 887);
    setScale(1);
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(events.filter((event) => event.type === "unbiased-visual-height").at(-1)?.height, 657);
  } finally {
    dom.window.close();
  }
});

test("the visual canvas extends its own surface color across the frame", async () => {
  const events: { type: string; color?: string }[] = [];
  const dom = new JSDOM(interactiveVisualDocument('<style>.guide{background:#fff;max-width:680px}</style><main class="guide">Guide</main>'), {
    url: "https://visual.test", runScripts: "dangerously",
    beforeParse(window) {
      window.postMessage = ((data: { type: string; color?: string }) => { events.push(data); }) as typeof window.postMessage;
    },
  });
  try {
    await new Promise<void>((resolve) => dom.window.addEventListener("load", () => resolve(), { once: true }));
    assert.equal(events.find((event) => event.type === "unbiased-visual-surface")?.color, "rgb(255, 255, 255)");
    assert.equal(dom.window.document.body.style.backgroundColor, "rgb(255, 255, 255)");
  } finally {
    dom.window.close();
  }
});

test("dark-on-dark generated text is corrected without changing text on light surfaces", async () => {
  const source = '<style>.panel{background:#202020;color:#17364f}.note{background:#fff;color:#17364f}</style>' +
    '<section class="panel"><h2 id="heading">First to ten points wins</h2><div class="note" id="note">Settlement: one point</div></section>';
  const dom = new JSDOM(interactiveVisualDocument(source), {
    url: "https://visual.test", runScripts: "dangerously", pretendToBeVisual: true,
  });
  try {
    await new Promise<void>((resolve) => dom.window.addEventListener("load", () => resolve(), { once: true }));
    assert.equal(dom.window.document.getElementById("heading")?.style.color, "rgb(255, 255, 255)");
    assert.equal(dom.window.document.getElementById("note")?.style.color, "");
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

test("a static illustrated sequence is not rejected just for using numbered stages", async () => {
  const events: { type: string; issues?: string[] }[] = [];
  const stages = [1, 2, 3].map((index) => `<article><h2>${index}. Stage</h2><svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg></article>`).join("");
  const dom = new JSDOM(interactiveVisualDocument(`<div data-visual-scene>${stages}</div>`), {
    url: "https://visual.test", runScripts: "dangerously",
    beforeParse(window) {
      window.postMessage = ((data: { type: string; issues?: string[] }) => { events.push(data); }) as typeof window.postMessage;
    },
  });
  try {
    await new Promise<void>((resolve) => dom.window.addEventListener("load", () => resolve(), { once: true }));
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
      source: dom.window.parent,
      data: { type: "unbiased-visual-preview-probe", requestId: "static-stages" },
    }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(Array.from(events.find((event) => event.type === "unbiased-visual-preview-result")?.issues ?? ["probe missing"]), []);
  } finally {
    dom.window.close();
  }
});
