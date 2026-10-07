import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UserMessageMarkdown } from "./user-message-markdown";

const render = (text: string) => renderToStaticMarkup(createElement(UserMessageMarkdown, { text }));

test("sent user messages render Markdown blocks and inline formatting", () => {
  const html = render("**Bold**\n\n- first\n- second\n\n***\n\n`code`");
  assert.match(html, /<strong>Bold<\/strong>/);
  assert.match(html, /<ul>[\s\S]*<li>first<\/li>[\s\S]*<li>second<\/li>[\s\S]*<\/ul>/);
  assert.match(html, /<hr\/?\s*>/);
  assert.match(html, /<code>code<\/code>/);
});

test("user Markdown does not interpret pasted HTML", () => {
  const html = render("<script>alert('x')</script>\n\n<a href=\"https://example.com\">link</a>");
  assert.doesNotMatch(html, /<script|<a href=/);
});

test("Markdown tables stay inside a scrollable user bubble", () => {
  const html = render("| A | B |\n| - | - |\n| 1 | 2 |");
  assert.match(html, /class="u-user-markdown-table"/);
  assert.match(html, /<table>/);
});
