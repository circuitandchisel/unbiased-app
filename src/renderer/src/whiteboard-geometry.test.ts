import assert from "node:assert/strict";
import test from "node:test";
import { connectorPoints } from "./whiteboard-geometry";
import type { DrawableShape } from "./whiteboard-model";

test("connectors end at node perimeters and follow moved nodes", () => {
  const maya: DrawableShape = { id: "maya", type: "circle", x: 100, y: 100, width: 80 };
  const sam: DrawableShape = { id: "sam", type: "circle", x: 300, y: 100, width: 80 };
  assert.deepEqual(connectorPoints(maya, sam), [182, 140, 298, 140]);
  assert.deepEqual(connectorPoints(maya, { ...sam, x: 400 }), [182, 140, 398, 140]);
});

test("connectors handle overlapping centers without invalid coordinates", () => {
  const a: DrawableShape = { id: "a", type: "square", x: 100, y: 100, width: 80 };
  const b: DrawableShape = { ...a, id: "b" };
  assert.equal(connectorPoints(a, b), null);
});
