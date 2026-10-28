import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

test("the packaged Code Review has one entrypoint and self-contained supporting links", () => {
  const root = resolve("resources/skills/code-review");
  const markdown: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".md")) markdown.push(path);
    }
  }
  walk(root);
  assert.deepEqual(markdown.filter(path => path.endsWith("/SKILL.md")), [join(root, "SKILL.md")]);
  for (const path of markdown) {
    const content = readFileSync(path, "utf8").replace(/```[\s\S]*?```/g, "");
    for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1].split("#")[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      const absolute = resolve(dirname(path), target);
      const local = relative(root, absolute);
      assert.ok(local !== ".." && !local.startsWith("../") && !isAbsolute(local), `${path}: reference escapes the packaged skill: ${target}`);
      assert.ok(existsSync(absolute), `${path}: missing packaged reference ${target}`);
    }
  }
});
