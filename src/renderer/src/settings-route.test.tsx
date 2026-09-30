import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsRoute } from "./settings-route";

test("settings keeps the conversation in the tree while hiding it", () => {
  const markup = renderToStaticMarkup(
    <SettingsRoute active settings={<div id="settings">Settings</div>}>
      <div id="chat" style={{ display: "flex" }}>Latest reply</div>
    </SettingsRoute>,
  );
  assert.match(markup, /id="chat" style="display:none" aria-hidden="true"/);
  assert.match(markup, /aria-hidden="true">Latest reply/);
  assert.match(markup, /id="settings">Settings/);
});

test("returning from settings shows the same conversation without settings", () => {
  const markup = renderToStaticMarkup(
    <SettingsRoute active={false} settings={<div id="settings">Settings</div>}>
      <div id="chat" style={{ display: "flex" }}>Latest reply</div>
    </SettingsRoute>,
  );
  assert.match(markup, /id="chat" style="display:flex"/);
  assert.doesNotMatch(markup, /aria-hidden/);
  assert.match(markup, /style="display:flex">Latest reply/);
  assert.doesNotMatch(markup, /id="settings"/);
});
