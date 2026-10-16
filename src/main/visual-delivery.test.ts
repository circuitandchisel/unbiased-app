import assert from "node:assert/strict";
import { test } from "node:test";
import { appendApprovedVisual } from "../shared/visual-delivery";

test("delivers an approved visual without duplicating an existing one", () => {
  const visual = { format: "visual-html" as const, source: "<svg><text>hello</text></svg>" };
  const answer = appendApprovedVisual("A useful explanation.", visual);
  assert.match(answer, /^A useful explanation\.\n\n````visual-html\n/);
  assert.equal(appendApprovedVisual(answer, visual), answer);
});

test("fence grows past backticks in authored HTML", () => {
  const answer = appendApprovedVisual("", { format: "visual-html", source: "<pre>```</pre>" });
  assert.match(answer, /^````visual-html\n/);
});

test("a different model fence is replaced by the approved bytes", () => {
  const answer = appendApprovedVisual("Intro.\n\n```openui\nroot = Stack([TextContent(\"wrong\")])\n```", {
    format: "openui", source: 'root = Stack([TextContent("approved")])',
  });
  assert.doesNotMatch(answer, /wrong/);
  assert.match(answer, /approved/);
  assert.match(answer, /^Intro\./);
});

test("bare approved source is wrapped instead of leaked as plain text", () => {
  const source = 'root = Stack([TextContent("approved")])';
  const answer = appendApprovedVisual(source, { format: "openui", source });
  assert.equal(answer, `\`\`\`\`openui\n${source}\n\`\`\`\``);
});
