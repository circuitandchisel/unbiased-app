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
  unknown[1].updateComponents!.components[0].component = "UnregisteredWidget";
  assert.equal(parseVisualMessages(JSON.stringify(unknown)), null);

  const secondSurface = structuredClone(valid);
  secondSurface[2].updateDataModel!.surfaceId = "other";
  assert.equal(parseVisualMessages(JSON.stringify(secondSurface)), null);
});

test("rejects invalid Card child aliases", () => {
  const invalid = structuredClone(valid);
  Object.assign(invalid[1].updateComponents!.components[0], {
    component: "Card", child: "label", children: ["label", "slider"],
  });
  assert.equal(parseVisualMessages(JSON.stringify(invalid)), null);

  const tooMany = structuredClone(valid);
  Object.assign(tooMany[1].updateComponents!.components[0], {
    component: "Card", children: Array(41).fill("label"),
  });
  assert.equal(parseVisualMessages(JSON.stringify(tooMany)), null);
});

test("accepts local controls but rejects remote media and agent actions", () => {
  const controls = structuredClone(valid);
  Object.assign(controls[1].updateComponents!.components[1], {
    component: "TextField", label: "Name", value: { path: "/name" },
  });
  delete controls[1].updateComponents!.components[1].text;
  assert.ok(parseVisualMessages(JSON.stringify(controls)));

  const media = structuredClone(valid);
  Object.assign(media[1].updateComponents!.components[1], {
    component: "Image", url: "https://example.com/pixel.png",
  });
  assert.equal(parseVisualMessages(JSON.stringify(media)), null);

  const button = structuredClone(valid);
  Object.assign(button[1].updateComponents!.components[1], {
    component: "Button", action: { event: { name: "submit" } },
  });
  assert.equal(parseVisualMessages(JSON.stringify(button)), null);
});
