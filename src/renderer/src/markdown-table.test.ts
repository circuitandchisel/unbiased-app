import assert from "node:assert/strict";
import test from "node:test";
import { tableToMarkdown } from "./markdown-table";

test("copies a rendered table as valid Markdown", () => {
  assert.equal(
    tableToMarkdown([
      ["Benchmark", "Needs"],
      [" Terminal-Bench ", "Docker containers"],
      ["DeepSWE", "Pier | mini-swe-agent"],
    ]),
    "| Benchmark | Needs |\n| --- | --- |\n| Terminal-Bench | Docker containers |\n| DeepSWE | Pier \\| mini-swe-agent |",
  );
});

test("keeps ragged rows rectangular and collapses cell whitespace", () => {
  assert.equal(tableToMarkdown([["A", "B"], ["one\n two"]]), "| A | B |\n| --- | --- |\n| one two |  |");
  assert.equal(tableToMarkdown([]), "");
});
