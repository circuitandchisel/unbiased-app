import assert from "node:assert/strict";
import test from "node:test";
import type { UserInputField } from "../../shared/user-input";
import { firstInvalidQuestionIndex, validateQuestion } from "./user-input-navigation";

const fields: UserInputField[] = [
  { id: "task", label: "Task", type: "choice", required: true,
    options: [{ value: "build", label: "Build" }, { value: "review", label: "Review" }] },
  { id: "details", label: "Details", type: "text", required: true },
];

test("question navigation validates only the visible field", () => {
  assert.equal(validateQuestion(fields, { task: "build" }, 0).ok, true);
  assert.equal(validateQuestion(fields, { task: "build" }, 1).ok, false);
});

test("submission returns to the first unanswered question after jumping ahead", () => {
  assert.equal(firstInvalidQuestionIndex(fields, { details: "Use the current app" }), 0);
  assert.equal(firstInvalidQuestionIndex(fields, { task: "review" }), 1);
  assert.equal(firstInvalidQuestionIndex(fields, { task: "build", details: "Use the current app" }), -1);
});
