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

test("packaged app keeps installed Chrome first and bundled Chrome as fallback", () => {
  const candidates = chromeCandidates("/App/Contents/Resources", true, 22);
  assert.equal(candidates[0], "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  assert.equal(candidates.at(-1), "/App/Contents/Resources/browser/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
  assert.ok(!chromeCandidates("/App/Contents/Resources", false, 22).some((path) => path.includes("/App/Contents/Resources")));
  assert.ok(!chromeCandidates("/App/Contents/Resources", true, 21).some((path) => path.includes("/App/Contents/Resources")));
});
