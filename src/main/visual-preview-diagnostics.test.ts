import assert from "node:assert/strict";
import test from "node:test";
import { blockingPreviewConsoleErrors, isStaleOptimizedDependency } from "./visual-preview-diagnostics";

const note = " Note that 'script-src' was not explicitly set, so 'default-src' is used as a fallback.";
const devtools = "Loading the script 'https://cdn.jsdelivr.net/npm/@openuidev/devtools@0/dist/devtools.browser.js?t=5972010' violates the following Content Security Policy directive: \"default-src 'self'\".";

test("ignores the OpenUI devtools CSP noise only in a dev preview", () => {
  assert.deepEqual(blockingPreviewConsoleErrors([note, devtools], true), []);
  assert.deepEqual(blockingPreviewConsoleErrors([note, devtools], false), [note, devtools]);
});

test("preserves unrelated CSP violations and runtime failures", () => {
  const otherCsp = "Loading the script 'https://example.com/unsafe.js' violates the following Content Security Policy directive";
  const runtime = "Uncaught TypeError: Cannot read properties of undefined";
  assert.deepEqual(blockingPreviewConsoleErrors([note, devtools, otherCsp, runtime], true), [otherCsp, runtime]);
  assert.deepEqual(blockingPreviewConsoleErrors([note, otherCsp], true), [otherCsp]);
  assert.deepEqual(blockingPreviewConsoleErrors([note, runtime], true), [runtime]);
});

test("only Vite optimized-dependency failures trigger a preview reload", () => {
  assert.equal(isStaleOptimizedDependency(["504 Outdated Optimize Dep"]), true);
  assert.equal(isStaleOptimizedDependency(["Uncaught (in promise) TypeError: Failed to fetch dynamically imported module: http://localhost:5187/@fs/app/node_modules/.vite/deps/rehype-katex-old.js?v=123"]), true);
  assert.equal(isStaleOptimizedDependency(["Failed to fetch dynamically imported module: https://example.com/app.js"]), false);
  assert.equal(isStaleOptimizedDependency(["Uncaught TypeError: Cannot read properties of undefined"]), false);
});
