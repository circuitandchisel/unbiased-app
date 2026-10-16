import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { visualApprovalTheme } from "./visual-approval-theme";

test("a body-level visual approval portal carries the active chat theme", () => {
  const dom = new JSDOM('<div id="chat" style="--panel:#f7f7f7;--panel-2:#eeeeee;--border:#cccccc;--fg-msg:#222222;--dim:#555555;--accent:#b03020;font-family:Arial"></div>');
  const previous = globalThis.getComputedStyle;
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  try {
    const theme = visualApprovalTheme(dom.window.document.getElementById("chat"));
    assert.equal(theme["--panel" as keyof typeof theme], "#f7f7f7");
    assert.equal(theme["--fg-msg" as keyof typeof theme], "#222222");
    assert.equal(theme["--accent" as keyof typeof theme], "#b03020");
    assert.equal(theme.fontFamily, "Arial");
  } finally {
    globalThis.getComputedStyle = previous;
    dom.window.close();
  }
});

test("the visual approval portal remains legible before its host mounts", () => {
  const theme = visualApprovalTheme(null);
  assert.equal(theme["--panel" as keyof typeof theme], "#202020");
  assert.equal(theme["--fg-msg" as keyof typeof theme], "#e5e5e5");
});
