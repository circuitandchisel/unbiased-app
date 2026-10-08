import assert from "node:assert/strict";
import test from "node:test";
import { inspectVisualMessages, parseVisualMessages, VISUAL_CATALOG_ID } from "./a2ui-payload";

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

test("rejects malformed and incomplete A2UI fences", () => {
  assert.equal(parseVisualMessages("[{"), null);
  assert.equal(inspectVisualMessages("[1,2] garbage").failure, "invalid-json");
  assert.equal(parseVisualMessages(JSON.stringify(valid.slice(0, 1))), null);
  assert.equal(inspectVisualMessages(JSON.stringify(valid.slice(0, 1))).failure, "invalid-envelope");
  assert.equal(parseVisualMessages(" ".repeat(32_769)), null);
  assert.equal(inspectVisualMessages(" ".repeat(32_769)).failure, "too-large");
  const noRoot = structuredClone(valid);
  noRoot[1].updateComponents!.components.shift();
  assert.equal(parseVisualMessages(JSON.stringify(noRoot)), null);
  assert.equal(inspectVisualMessages(JSON.stringify(noRoot)).failure, "missing-root");
});

test("rejects a layout that references a missing component", () => {
  const missing = structuredClone(valid);
  missing[1].updateComponents!.components[0]!.children!.push("who-is-who");
  assert.equal(inspectVisualMessages(JSON.stringify(missing)).failure, "invalid-component");
});

test("accepts bounded Mermaid components and rejects invalid diagram props", () => {
  const visual = structuredClone(valid);
  const components = visual[1].updateComponents!.components as Record<string, unknown>[];
  components[0].children = ["diagram"];
  components.splice(1, 2, {
    id: "diagram", component: "Mermaid", title: "Connections",
    diagram: "flowchart LR\nAlice --> Bob",
  });
  assert.ok(parseVisualMessages(JSON.stringify(visual)));

  components[1].diagram = " ";
  assert.equal(parseVisualMessages(JSON.stringify(visual)), null);
  components[1].diagram = "x".repeat(16_001);
  assert.equal(parseVisualMessages(JSON.stringify(visual)), null);
  components[1].diagram = "flowchart LR\nAlice --> Bob";
  components[1].url = "https://example.com/diagram";
  assert.equal(parseVisualMessages(JSON.stringify(visual)), null);
});

test("rejects actions, unknown components and extra surfaces", () => {
  const action = structuredClone(valid);
  Object.assign(action[1].updateComponents!.components[0], { action: { event: { name: "send" } } });
  assert.equal(parseVisualMessages(JSON.stringify(action)), null);
  assert.equal(inspectVisualMessages(JSON.stringify(action)).failure, "unsafe-content");

  const unknown = structuredClone(valid);
  unknown[1].updateComponents!.components[0].component = "UnregisteredWidget";
  assert.equal(parseVisualMessages(JSON.stringify(unknown)), null);
  assert.equal(inspectVisualMessages(JSON.stringify(unknown)).failure, "unsupported-component");

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

test("normalizes model-generated Text.value without accepting conflicting fields", () => {
  const alias = structuredClone(valid);
  const text = alias[1].updateComponents!.components[1] as Record<string, unknown>;
  text.value = text.text;
  delete text.text;
  const parsed = parseVisualMessages(JSON.stringify(alias));
  assert.ok(parsed);
  assert.deepEqual((parsed[1].updateComponents as { components: Record<string, unknown>[] }).components[1].text, { path: "/label" });

  text.text = "Different";
  assert.equal(parseVisualMessages(JSON.stringify(alias)), null);
});

test("accepts a bounded whiteboard but rejects malformed or unsafe shapes", () => {
  const board = structuredClone(valid);
  const components = board[1].updateComponents!.components as Record<string, unknown>[];
  components[0].children = ["board"];
  components.splice(1, 2, { id: "board", component: "Whiteboard", title: "Friend graph", shapes: [
    { id: "maya", type: "circle", x: 60, y: 80, width: 70, fill: "#5da5e8", label: "Maya" },
    { id: "link", type: "arrow", x: 130, y: 115, width: 130, height: 45, stroke: "#f49a56" },
  ] });
  assert.ok(parseVisualMessages(JSON.stringify(board)));

  const shape = (components[1].shapes as Record<string, unknown>[])[0];
  shape.fill = "url(https://example.com)";
  assert.equal(parseVisualMessages(JSON.stringify(board)), null);
  shape.fill = "#5da5e8";
  shape.x = 790;
  assert.equal(parseVisualMessages(JSON.stringify(board)), null);
  shape.x = 60;
  shape.type = "script";
  assert.equal(parseVisualMessages(JSON.stringify(board)), null);
  shape.type = "circle";
  (components[1].shapes as Record<string, unknown>[]).push({ ...shape });
  assert.equal(parseVisualMessages(JSON.stringify(board)), null);
});

test("fits a slightly overflowing node without accepting distant geometry", () => {
  const visual = structuredClone(valid);
  const components = visual[1].updateComponents!.components as Record<string, unknown>[];
  components[0].children = ["board"];
  components.splice(1, 2, { id: "board", component: "Whiteboard", shapes: [
    { id: "ithaca", type: "circle", x: 745, y: 180, width: 60, label: "Ithaca" },
  ] });
  const parsed = parseVisualMessages(JSON.stringify(visual));
  assert.ok(parsed);
  const board = (parsed[1].updateComponents as { components: Record<string, unknown>[] }).components[1];
  assert.equal((board.shapes as { x: number }[])[0].x, 740);

  (components[1].shapes as { x: number }[])[0].x = 790;
  assert.equal(parseVisualMessages(JSON.stringify(visual)), null);
});

test("validates whiteboard connectors against distinct node IDs", () => {
  const board = structuredClone(valid);
  const components = board[1].updateComponents!.components as Record<string, unknown>[];
  components[0].children = ["board"];
  const shapes = [
    { id: "maya", type: "circle", x: 60, y: 80, width: 70, label: "Maya" },
    { id: "sam", type: "circle", x: 250, y: 80, width: 70, label: "Sam" },
    { id: "edge", type: "connector", from: "maya", to: "sam", directed: true, label: "follows" },
  ];
  components.splice(1, 2, { id: "board", component: "Whiteboard", shapes });
  assert.ok(parseVisualMessages(JSON.stringify(board)));

  shapes[2].to = "missing";
  assert.equal(parseVisualMessages(JSON.stringify(board)), null);
  shapes[2].to = "maya";
  assert.equal(parseVisualMessages(JSON.stringify(board)), null);
  shapes[2].to = "sam";
  shapes[2].from = "edge";
  assert.equal(parseVisualMessages(JSON.stringify(board)), null);
});

test("repairs model closing brackets and accepts horizontal and vertical lines", () => {
  const reply = [
    { version: "v0.9", createSurface: { surfaceId: "graph", catalogId: VISUAL_CATALOG_ID } },
    { version: "v0.9", updateComponents: { surfaceId: "graph", components: [
      { id: "root", component: "Column", children: ["board"] },
      { id: "board", component: "Whiteboard", shapes: [
        { id: "horizontal", type: "line", x: 20, y: 40, width: 180, height: 0, stroke: "#b0b8c4" },
        { id: "vertical", type: "line", x: 200, y: 40, width: 0, height: 120, stroke: "#b0b8c4" },
        { id: "person", type: "circle", x: 140, y: 120, width: 80, fill: "#4f8ef7", label: "Maya" },
      ] },
    ] } },
  ];
  const malformed = JSON.stringify(reply).replace(/\]\}\}\]$/, "]]]}");
  const parsed = parseVisualMessages(malformed);
  assert.ok(parsed);
  assert.equal((parsed[1].updateComponents as { components: unknown[] }).components.length, 2);

  const unsafe = malformed.replace('"component":"Whiteboard"', '"component":"Whiteboard","action":{"event":"send"}');
  assert.equal(parseVisualMessages(unsafe), null);
});
