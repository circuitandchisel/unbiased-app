import assert from "node:assert/strict";
import { test } from "node:test";
import { agentBrowserCandidates, chromeCandidates } from "./browser-binaries";

test("packaged app prefers its bundled agent-browser over a global install", () => {
  const candidates = agentBrowserCandidates("/App/Contents/Resources", true, "/Users/test", "/usr/bin:/opt/homebrew/bin");
  assert.equal(candidates[0], "/App/Contents/Resources/browser/agent-browser");
  assert.ok(candidates.includes("/opt/homebrew/bin/agent-browser"));
});

test("development app uses installed agent-browser", () => {
  const candidates = agentBrowserCandidates("/App/Contents/Resources", false, "/Users/test", "/usr/bin");
  assert.equal(candidates[0], "/usr/bin/agent-browser");
  assert.ok(!candidates.some((path) => path.includes("/App/Contents/Resources")));
});

test("browser requires an installed Chrome-family executable", () => {
  const candidates = chromeCandidates();
  assert.equal(candidates[0], "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  assert.equal(candidates.length, 4);
  assert.ok(candidates.every((path) => path.startsWith("/Applications/")));
});
