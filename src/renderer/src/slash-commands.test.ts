import test from "node:test";
import assert from "node:assert/strict";
import { slashQueryAt, commandTokens, preferredCommand } from "../../shared/slash-commands";

test("picker follows the caret and replaces only the inline command", () => {
  const text = "Please /cOd origin/main";
  assert.deepEqual(slashQueryAt(text, 11), { query: "cOd", from: 7, to: 11 });
  assert.deepEqual(slashQueryAt(text, 9), { query: "c", from: 7, to: 11 });
  assert.deepEqual(slashQueryAt("Please /", 8), { query: "", from: 7, to: 8 });
  assert.deepEqual(slashQueryAt("Please /Code Review now", 12), { query: "Code", from: 7, to: 19 });
  assert.deepEqual(slashQueryAt("First line\n/Code", 16), { query: "Code", from: 11, to: 16 });
  for (const text of ["https://example.com/Code", "/path/to/file", "word/Code"]) {
    assert.equal(slashQueryAt(text, text.length), null);
  }
});

test("server token lookup excludes examples and preserves inline arguments", () => {
  assert.deepEqual(commandTokens("Please /CodeReview this PR"), [{ name: "CodeReview", rest: "this PR" }]);
  assert.deepEqual(commandTokens("```\n/CodeReview\n```\nThen /ProjectCheck"), [{ name: "ProjectCheck", rest: "" }]);
  assert.deepEqual(commandTokens("~~~\n/CodeReview\n~~~"), []);
  assert.deepEqual(commandTokens("`/CodeReview` and > text"), []);
});

test("Unbiased takes priority regardless of discovery order", () => {
  const shared = { source: "Shared" }, project = { source: "This project" }, bundled = { source: "Unbiased" };
  assert.equal(preferredCommand([shared, project, bundled]), bundled);
  assert.equal(preferredCommand([shared, project]), undefined);
  assert.equal(preferredCommand([project]), project);
});
