import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { assistantVisualMarkdown, visualOutputType } from "./assistant-visual-markdown";

test("bare OpenUI is rendered as a visual without changing the saved response", () => {
  const raw = 'root = Stack([TextContent("Hello")])';
  assert.equal(assistantVisualMarkdown(raw, false), `\`\`\`\`openui\n${raw}\n\`\`\`\``);
  assert.equal(visualOutputType(raw), "openui");
  assert.equal(assistantVisualMarkdown(`\`\`\`openui\n${raw}\n\`\`\``, false), `\`\`\`openui\n${raw}\n\`\`\``);
});

test("a bare program stays hidden while its opening tokens stream", () => {
  for (const partial of ["r", "root =", "root = Stack(", "root = Stack([TextContent("]) {
    assert.match(assistantVisualMarkdown(partial, true), /^````openui\n/);
  }
  assert.equal(assistantVisualMarkdown("root", false), "root");
  assert.equal(assistantVisualMarkdown("A root is part of a tree", true), "A root is part of a tree");
});

test("visual fences attached to preceding prose still render as fences", () => {
  const source = 'root = Stack([TextContent("Journey")])';
  const malformed = `A short introduction.\`\`\`openui\n${source}\n\`\`\``;
  const expected = `A short introduction.\n\`\`\`openui\n${source}\n\`\`\``;
  assert.equal(assistantVisualMarkdown(malformed, false), expected);
  assert.equal(assistantVisualMarkdown(malformed, true), expected);
  assert.equal(visualOutputType(malformed), "openui");
  assert.equal(assistantVisualMarkdown(expected, false), expected);
  const rendered = renderToStaticMarkup(createElement(Markdown, null, expected));
  assert.match(rendered, /<code class="language-openui">/);
  assert.doesNotMatch(rendered, /A short introduction\.[^<]*root = Stack/);
});

test("four-backtick approved visuals do not leave a stray backtick before the UI", () => {
  const source = '<div data-visual-scene>Fold</div>';
  for (const fence of ["````", "`````"]) {
    const response = `Follow the folding direction.\n\n${fence}visual-html\n${source}\n${fence}`;
    assert.equal(assistantVisualMarkdown(response, false), response);
    assert.equal(assistantVisualMarkdown(response, true), response);
    const rendered = renderToStaticMarkup(createElement(Markdown, null, assistantVisualMarkdown(response, false)));
    assert.match(rendered, /<code class="language-visual-html">/);
    assert.doesNotMatch(rendered, /<p>`<\/p>/);
  }
});

test("completed invalid visuals never expose their source or hide surrounding prose", () => {
  const invalid = `root = Stack([Milestone("Troy", "${"x".repeat(241)}")])`;
  const response = `Before the visual.\n\n\`\`\`openui\n${invalid}\n\`\`\`\n\nAfter the visual.`;
  const displayed = assistantVisualMarkdown(response, false);
  assert.match(displayed, /Before the visual/);
  assert.match(displayed, /visual couldn't be displayed/);
  assert.match(displayed, /After the visual/);
  assert.doesNotMatch(displayed, /root = Stack|Milestone/);
  assert.match(assistantVisualMarkdown(response, true), /root = Stack/);
  assert.equal(assistantVisualMarkdown(invalid, false).includes("root = Stack"), false);
  assert.equal(visualOutputType(response), "text");
});

test("completed malformed fences are rejected after newline normalization", () => {
  const response = 'Intro.```openui\nroot = Stack([\n```';
  const displayed = assistantVisualMarkdown(response, false);
  assert.match(displayed, /Intro/);
  assert.match(displayed, /visual couldn't be displayed/);
  assert.doesNotMatch(displayed, /root = Stack/);
  assert.equal(assistantVisualMarkdown('```js\nroot = Stack([\n```', false), '```js\nroot = Stack([\n```');
});

test("output tracing distinguishes visuals, tables, and prose", () => {
  assert.equal(visualOutputType("```mermaid\nflowchart LR\nA-->B\n```"), "text");
  assert.equal(visualOutputType("```visual-html\n<svg viewBox=\"0 0 10 10\"></svg>\n```"), "visual-html");
  assert.equal(visualOutputType("| Name |\n| --- |\n| Ada |"), "table");
  assert.equal(visualOutputType("Here is the explanation."), "text");
});

test("removed flowcharts do not expose source in completed replies", () => {
  const displayed = assistantVisualMarkdown("Intro.\n\n```mermaid\nflowchart LR\nA-->B\n```\n\nOutro.", false);
  assert.match(displayed, /visual couldn.t be displayed/);
  assert.doesNotMatch(displayed, /flowchart LR|A-->B/);
});
