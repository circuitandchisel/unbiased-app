import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileActionError, localFileForAction, saveLocalFileCopy } from "./file-actions";

test("file actions require an existing regular local file", () => {
  const dir = mkdtempSync(join(tmpdir(), "unbiased-file-actions-"));
  try {
    const source = join(dir, "PRD.md");
    writeFileSync(source, "# PRD\n");
    assert.equal(localFileForAction(source), source);
    assert.throws(() => localFileForAction("PRD.md"), /local file path/);
    assert.throws(() => localFileForAction(dir), /Not a file/);
    assert.throws(() => localFileForAction(join(dir, "missing.md")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("save a copy preserves source bytes and never overwrites an existing file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "unbiased-file-actions-"));
  try {
    const source = join(dir, "PRD.md");
    const copy = join(dir, "PRD-copy.md");
    writeFileSync(source, "# PRD\n\nOriginal text\n");
    await saveLocalFileCopy(source, copy);
    assert.equal(readFileSync(copy, "utf8"), readFileSync(source, "utf8"));
    await assert.rejects(saveLocalFileCopy(source, copy), (error: unknown) => {
      assert.equal(fileActionError(error), "A file with that name already exists. Choose another name.");
      return true;
    });
    assert.equal(readFileSync(copy, "utf8"), "# PRD\n\nOriginal text\n");
    assert.equal(readFileSync(source, "utf8"), "# PRD\n\nOriginal text\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
