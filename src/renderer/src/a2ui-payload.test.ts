import assert from "node:assert/strict";
import test from "node:test";
import { parseVisualMessages, VISUAL_CATALOG_ID } from "./a2ui-payload";

const valid = [
  { version: "v0.9", createSurface: { surfaceId: "demo", catalogId: VISUAL_CATALOG_ID } },
  { version: "v0.9", updateComponents: { surfaceId: "demo", components: [
    { id: "root", component: "Column", children: ["label", "slider"] },
    { id: "label", component: "Text", text: { path: "/label" } },
    { id: "slider", component: "Slider", label: "Amount", value: { path: "/amount" }, min: 0, max: 100 },
  ] } },
  { version: "v0.9", updateDataModel: { surfaceId: "demo", path: "/", value: { label: "Try it", amount: 40 } } },
];

test("accepts a bounded A2UI visual that can be reconstructed from saved text", () => {
  assert.deepEqual(parseVisualMessages(JSON.stringify(valid)), valid);
});

test("leaves malformed and incomplete fences as ordinary code", () => {
  assert.equal(parseVisualMessages("[{"), null);
  assert.equal(parseVisualMessages(JSON.stringify(valid.slice(0, 1))), null);
  assert.equal(parseVisualMessages(" ".repeat(32_769)), null);
  const noRoot = structuredClone(valid);
  noRoot[1].updateComponents!.components.shift();
  assert.equal(parseVisualMessages(JSON.stringify(noRoot)), null);
});

test("rejects actions, unknown components and extra surfaces", () => {
  const action = structuredClone(valid);
  Object.assign(action[1].updateComponents!.components[0], { action: { event: { name: "send" } } });
  assert.equal(parseVisualMessages(JSON.stringify(action)), null);

  const unknown = structuredClone(valid);
  unknown[1].updateComponents!.components[0].component = "Image";
  assert.equal(parseVisualMessages(JSON.stringify(unknown)), null);

  const secondSurface = structuredClone(valid);
  secondSurface[2].updateDataModel!.surfaceId = "other";
  assert.equal(parseVisualMessages(JSON.stringify(secondSurface)), null);
});
