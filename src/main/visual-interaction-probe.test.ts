import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { JSDOM } from "jsdom";
import { interactiveVisualDocument } from "../shared/interactive-visual";
import { validateVisualHtmlForAgent } from "../shared/visual-validation";

const example = readFileSync(join(process.cwd(), "examples/catan-roll.html"), "utf8");

function rendered(source: string): JSDOM {
  return new JSDOM(interactiveVisualDocument(source), {
    url: "https://visual.test/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
  });
}

async function probe(dom: JSDOM): Promise<{ tested: number; issues: string[]; states: { label: string; outcome: string }[]; navigationOnly: boolean }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Interaction probe did not respond")), 2000);
    dom.window.addEventListener("message", (event: MessageEvent) => {
      if (event.data?.type !== "unbiased-visual-preview-result") return;
      clearTimeout(timer);
      resolve({ tested: event.data.tested, issues: event.data.issues, states: event.data.states, navigationOnly: event.data.navigationOnly });
    });
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
      source: dom.window as unknown as Window,
      data: { type: "unbiased-visual-preview-probe", requestId: "test" },
    }));
  });
}

test("Catan reference changes the board, earned cards, and explanation together", async () => {
  assert.deepEqual(validateVisualHtmlForAgent(example), { valid: true, errors: [] });
  const dom = rendered(example);
  try {
    const doc = dom.window.document;
    doc.querySelector<HTMLButtonElement>('[data-roll-button="5"]')!.click();
    assert.equal(doc.querySelector('[data-roll="5"]')!.getAttribute("data-active"), "true");
    assert.match(doc.querySelector("[data-visual-outcome]")!.textContent!, /earns 1 wheat/);
    assert.equal(doc.querySelector("#earned-one")!.textContent, "wheat");

    doc.querySelector<HTMLButtonElement>("#city-button")!.click();
    assert.match(doc.querySelector("[data-visual-outcome]")!.textContent!, /earns 2 wheat/);
    assert.notEqual((doc.querySelector("#earned-two") as HTMLElement).style.display, "none");

    doc.querySelector<HTMLButtonElement>("#robber-button")!.click();
    assert.match(doc.querySelector("[data-visual-outcome]")!.textContent!, /collect nothing/);
    assert.equal((doc.querySelector("#earned-one") as HTMLElement).style.display, "none");

    doc.querySelector<HTMLButtonElement>("#robber-button")!.click();
    assert.match(doc.querySelector("[data-visual-outcome]")!.textContent!, /earns 2 wheat/);
    assert.equal((doc.querySelector("#robber-5") as HTMLElement).style.display, "none");
  } finally {
    dom.window.close();
  }
});

test("preview probe exercises Catan controls without unchanged states", async () => {
  const dom = rendered(example);
  try {
    const result = await probe(dom);
    assert.equal(result.tested, 4);
    assert.deepEqual(Array.from(result.issues), []);
    assert.equal(result.navigationOnly, false);
    assert.equal(result.states.length, 4);
  } finally {
    dom.window.close();
  }
});

test("preview identifies a step-only slideshow and lists the tested states", async () => {
  const dom = rendered(`<svg data-visual-scene><text id="scene">Start</text></svg>
    <p data-visual-outcome>Start</p>
    <button data-step="1" onclick="document.querySelector('#scene').textContent='Fold';document.querySelector('[data-visual-outcome]').textContent='Fold paper'">1 Fold</button>
    <button data-step="2" onclick="document.querySelector('#scene').textContent='Boat';document.querySelector('[data-visual-outcome]').textContent='Finish boat'">2 Boat</button>`);
  try {
    const result = await probe(dom);
    assert.deepEqual(Array.from(result.issues), []);
    assert.equal(result.navigationOnly, true);
    assert.deepEqual(Array.from(result.states, ({ label, outcome }) => ({ label, outcome })), [
      { label: "1 Fold", outcome: "Fold paper" },
      { label: "2 Boat", outcome: "Finish boat" },
    ]);
  } finally {
    dom.window.close();
  }
});

test("preview permits a static numbered-diagram gallery when the task warrants it", async () => {
  const panels = [1, 2, 3].map((step) => `<article><h3>${step} · Fold</h3><svg><path d="M0 0L10 10"/></svg></article>`).join("");
  const dom = rendered(`<div data-visual-scene>${panels}</div>`);
  try {
    const result = await probe(dom);
    assert.equal(result.tested, 0);
    assert.deepEqual(Array.from(result.issues), []);
  } finally {
    dom.window.close();
  }
});

test("preview accepts a focused Back and Next lesson", async () => {
  const dom = rendered(`<svg data-visual-scene><text id="scene">Start</text></svg>
    <p data-visual-outcome>Start</p>
    <button onclick="document.querySelector('#scene').textContent='First';document.querySelector('[data-visual-outcome]').textContent='First fold'">Back</button>
    <button onclick="document.querySelector('#scene').textContent='Second';document.querySelector('[data-visual-outcome]').textContent='Second fold'">Next</button>`);
  try {
    const result = await probe(dom);
    assert.equal(result.tested, 2);
    assert.deepEqual(Array.from(result.issues), []);
  } finally {
    dom.window.close();
  }
});

test("preview retests an initially selected stage without accepting a dead control", async () => {
  const dom = rendered(`<svg data-visual-scene><text id="scene">Stage 1</text></svg>
    <p data-visual-outcome>Stage 1</p>
    <button onclick="document.querySelector('#scene').textContent='Stage 1';document.querySelector('[data-visual-outcome]').textContent='Stage 1'">Stage 1</button>
    <button onclick="document.querySelector('#scene').textContent='Stage 2';document.querySelector('[data-visual-outcome]').textContent='Stage 2'">Stage 2</button>
    <button>Broken choice</button>`);
  try {
    const result = await probe(dom);
    assert.equal(result.tested, 3);
    assert.doesNotMatch(result.issues.join(" "), /Stage 1 did not change/);
    assert.match(result.issues.join(" "), /Broken choice did not change the illustration/);
    assert.match(result.issues.join(" "), /Broken choice did not change the explanation/);
  } finally {
    dom.window.close();
  }
});

test("preview recognizes a scene changed by CSS on an ancestor", async () => {
  const dom = rendered(`<style>
    body[data-stage="one"] #second, body[data-stage="two"] #first { display: none; }
  </style>
  <div data-visual-scene><svg><circle id="first" cx="20" cy="20" r="10"/><rect id="second" x="10" y="10" width="20" height="20"/></svg></div>
  <p data-visual-outcome>Circle</p>
  <button onclick="document.body.dataset.stage='one';document.querySelector('[data-visual-outcome]').textContent='Circle stage'">Circle</button>
  <button onclick="document.body.dataset.stage='two';document.querySelector('[data-visual-outcome]').textContent='Square stage'">Square</button>`);
  try {
    const result = await probe(dom);
    assert.deepEqual(Array.from(result.issues), []);
  } finally {
    dom.window.close();
  }
});

test("preview probe rejects text-only controls and missing scene markers", async () => {
  const textOnly = rendered('<svg data-visual-scene><circle cx="5" cy="5" r="5"/></svg><p data-visual-outcome>Before</p><button onclick="document.querySelector(\'[data-visual-outcome]\').textContent=\'After\'">Next</button>');
  const missing = rendered('<button type="button">Next</button>');
  try {
    assert.match((await probe(textOnly)).issues.join(" "), /did not change the illustration/);
    assert.match((await probe(missing)).issues.join(" "), /data-visual-scene/);
  } finally {
    textOnly.window.close();
    missing.window.close();
  }
});
