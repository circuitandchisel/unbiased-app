import assert from "node:assert/strict";
import test from "node:test";
import { isComposerTypingKey } from "./type-to-focus";

const key = (key: string, overrides: Partial<KeyboardEvent> = {}) => ({
  key,
  defaultPrevented: false,
  isComposing: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...overrides,
});

test("printable keys can start a composer draft", () => {
  assert.equal(isComposerTypingKey(key("a"), null), true);
  assert.equal(isComposerTypingKey(key("A"), null), true);
  assert.equal(isComposerTypingKey(key("?"), null), true);
});

test("shortcuts, composition, and action keys stay in their current control", () => {
  for (const event of [
    key("k", { metaKey: true }),
    key("k", { ctrlKey: true }),
    key("k", { altKey: true }),
    key("a", { isComposing: true }),
    key("a", { defaultPrevented: true }),
    key("Enter"),
    key("ArrowDown"),
    key(" "),
  ]) {
    assert.equal(isComposerTypingKey(event, null), false);
  }
});

test("editable fields and overlays keep their typed keys", () => {
  for (const selector of ["input", "textarea", "select", "[contenteditable]", '[role="textbox"]', '[role="combobox"]', '[role="dialog"]', '[role="menu"]', '[role="listbox"]', "[data-popover]"]) {
    const target = { closest: (query: string) => query.includes(selector) ? {} : null } as unknown as Element;
    assert.equal(isComposerTypingKey(key("a"), target), false, selector);
  }
});
