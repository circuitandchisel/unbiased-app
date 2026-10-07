import assert from "node:assert/strict";
import { test } from "node:test";
import { agentInputFields, codexInputResponse, mcpInputFields, mcpInputResponse, validateUserInput, withoutUserInputDefaults } from "../shared/user-input";

test("agent questions accept choices, other answers, and free text", () => {
  const fields = agentInputFields([
    { id: "mode", question: "Which mode?", options: [{ label: "Fast" }, { label: "Careful" }], isOther: true },
    { id: "reason", question: "Why?" },
  ]);
  assert.ok(fields);
  assert.equal(fields[0].type, "choice");
  assert.deepEqual(validateUserInput(fields, { mode: "Fast", reason: "For this task" }), {
    ok: true, values: { mode: "Fast", reason: "For this task" },
  });
  assert.deepEqual(validateUserInput(fields, { mode: "A custom mode", reason: "For this task" }), {
    ok: true, values: { mode: "A custom mode", reason: "For this task" },
  });
  assert.equal(validateUserInput(fields, { mode: "Fast" }).ok, false);
});

test("agent questions reject malformed and duplicate ids", () => {
  assert.equal(agentInputFields([{ id: "same", question: "One?" }, { id: "same", question: "Two?" }]), null);
  assert.equal(agentInputFields([{ id: "bad id", question: "One?" }]), null);
  assert.equal(agentInputFields([{ id: "x", question: "One?", options: [{ label: "Only one" }] }]), null);
});

test("native free-text question accepts null options", () => {
  const fields = agentInputFields([{ id: "detail", header: "More detail", question: "What happened?", options: null }]);
  assert.equal(fields?.[0].type, "text");
});

test("MCP flat form preserves enum wire values and numeric/boolean types", () => {
  const fields = mcpInputFields({
    type: "object",
    required: ["region", "count", "confirmed"],
    properties: {
      region: { type: "string", title: "Region", enum: ["us-east-1", "eu-west-1"], enumNames: ["US", "Europe"] },
      count: { type: "integer", title: "Count", minimum: 1, maximum: 3 },
      confirmed: { type: "boolean", title: "Confirm" },
    },
  });
  assert.ok(fields);
  assert.deepEqual(fields[0].options?.[0], { value: "us-east-1", label: "US" });
  assert.deepEqual(validateUserInput(fields, { region: "us-east-1", count: 2, confirmed: false }), {
    ok: true, values: { region: "us-east-1", count: 2, confirmed: false },
  });
  assert.equal(validateUserInput(fields, { region: "US", count: 2, confirmed: false }).ok, false);
  assert.equal(validateUserInput(fields, { region: "us-east-1", count: 2.5, confirmed: false }).ok, false);
  assert.equal(validateUserInput(fields, { region: "us-east-1", count: 4, confirmed: false }).ok, false);
});

test("unsupported MCP schemas fail closed", () => {
  assert.equal(mcpInputFields({ type: "object", properties: { nested: { type: "object" } } }), null);
  assert.equal(mcpInputFields({ type: "object", properties: { secret: { type: "string", format: "password" } } }), null);
  assert.equal(mcpInputFields({ type: "object", properties: {}, required: ["missing"] }), null);
});

test("MCP titled choices and multi-select retain protocol values", () => {
  const fields = mcpInputFields({ type: "object", required: ["plan", "regions"], properties: {
    plan: { type: "string", oneOf: [{ const: "pro", title: "Professional" }, { const: "team", title: "Team" }] },
    regions: { type: "array", minItems: 1, maxItems: 2, items: {
      anyOf: [{ const: "us", title: "United States" }, { const: "eu", title: "Europe" }],
    } },
  } });
  assert.ok(fields);
  assert.deepEqual(validateUserInput(fields, { plan: "team", regions: ["us", "eu"] }), {
    ok: true, values: { plan: "team", regions: ["us", "eu"] },
  });
  assert.equal(validateUserInput(fields, { plan: "Team", regions: ["us"] }).ok, false);
  assert.equal(validateUserInput(fields, { plan: "team", regions: ["us", "us"] }).ok, false);
});

test("native and MCP answers use their distinct wire shapes", () => {
  const fields = agentInputFields([{ id: "choice", question: "Which?", options: [{ label: "A" }, { label: "B" }] }]);
  assert.ok(fields);
  assert.deepEqual(codexInputResponse(fields, { choice: "B" }), { answers: { choice: { answers: ["B"] } } });
  assert.deepEqual(codexInputResponse(fields, null), { answers: {} });
  assert.deepEqual(mcpInputResponse({ confirmed: false }), { action: "accept", content: { confirmed: false } });
  assert.deepEqual(mcpInputResponse(null), { action: "cancel" });
});

test("transcript copy omits field defaults without mutating the live request", () => {
  const request = {
    requestId: "input_1", title: "Choose", source: "mcp" as const,
    fields: [{ id: "name", label: "Name", type: "text" as const, required: true, defaultValue: "private value" }],
  };
  assert.equal(withoutUserInputDefaults(request).fields[0].defaultValue, undefined);
  assert.equal(request.fields[0].defaultValue, "private value");
});
