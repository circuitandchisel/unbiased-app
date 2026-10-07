import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement, createRef } from "react";
import { JSDOM } from "jsdom";
import type { MarkdownComposerHandle } from "./markdown-composer";

test("composer renders Markdown in place and keeps Markdown as its value", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost", pretendToBeVisual: true });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element,
    MutationObserver: dom.window.MutationObserver, getSelection: dom.window.getSelection.bind(dom.window),
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { createRoot } = await import("react-dom/client");
  const { MarkdownComposer } = await import("./markdown-composer");
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  const ref = createRef<MarkdownComposerHandle>();
  const changes: string[] = [];
  const value = "# Markdown check\n\n**bold** and *italic*\n\n| Feature | Status |\n| --- | --- |\n| Tables | Ready |\n\n> A quote\n\n```js\nconst x = 1;\n```";
  try {
    await act(async () => root.render(createElement(MarkdownComposer, {
      ref, paneId: "main", value, onChange: (text) => changes.push(text),
      onKeyDown: () => {}, onPaste: () => {}, placeholder: "Do anything", title: "Message", disabled: false,
    })));
    assert.equal(container.querySelector("h1")?.textContent, "Markdown check");
    assert.equal(container.querySelector("strong")?.textContent, "bold");
    assert.equal(container.querySelector("em")?.textContent, "italic");
    assert.equal(container.querySelector("table th")?.textContent, "Feature");
    assert.equal(container.querySelector("blockquote")?.textContent, "A quote");
    assert.match(container.querySelector("pre")?.textContent ?? "", /const x = 1/);
    assert.equal(changes.length, 0, JSON.stringify(changes));

    await act(async () => ref.current?.appendText("tail"));
    assert.match(changes.at(-1) ?? "", /tail/);
    assert.match(changes.at(-1) ?? "", /\| Feature \| Status \|/);

    const count = changes.length;
    await act(async () => root.render(createElement(MarkdownComposer, {
      ref, paneId: "main", value: "# Restored draft", onChange: (text) => changes.push(text),
      onKeyDown: () => {}, onPaste: () => {}, placeholder: "Do anything", title: "Message", disabled: false,
    })));
    assert.equal(container.querySelector("h1")?.textContent, "Restored draft");
    assert.equal(changes.length, count);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});

test("pasting plain Markdown produces formatted content and Markdown output", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost", pretendToBeVisual: true });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element, MutationObserver: dom.window.MutationObserver,
    getSelection: dom.window.getSelection.bind(dom.window),
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { createRoot } = await import("react-dom/client");
  const { MarkdownComposer } = await import("./markdown-composer");
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  let latest = "";
  try {
    await act(async () => root.render(createElement(MarkdownComposer, {
      paneId: "main", value: "", onChange: (text) => { latest = text; },
      onKeyDown: () => {}, onPaste: () => {}, placeholder: "Do anything", title: "Message", disabled: false,
    })));
    const paste = new dom.window.Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: {
      items: [], getData: (type: string) => type === "text/plain"
        ? "# Heading\n\n| Feature | Status |\n| --- | --- |\n| Tables | Ready |"
        : "",
    } });
    await act(async () => { container.querySelector("[contenteditable]")!.dispatchEvent(paste); });
    assert.equal(container.querySelector("h1")?.textContent, "Heading");
    assert.equal(container.querySelector("table td")?.textContent, "Tables");
    assert.match(latest, /\| Tables\s+\| Ready/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
