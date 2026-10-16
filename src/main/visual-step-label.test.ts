import assert from "node:assert/strict";
import test from "node:test";
import { visualValidationStepLabel } from "./visual-step-label";

test("visual step only claims a preview after successful validation", () => {
  assert.equal(visualValidationStepLabel(), "validate visual");
  assert.equal(visualValidationStepLabel(false), "validate visual");
  assert.equal(visualValidationStepLabel(true), "preview visual");
});
