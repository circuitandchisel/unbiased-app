import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FRONTEND_PREVIEW_INSTRUCTIONS } from "./frontend-preview-instructions";
import { defaultAgentInstructions } from "../shared/default-agent-instructions";

test("frontend previews have a supported route and a distinct completion contract", () => {
  const prompt = FRONTEND_PREVIEW_INSTRUCTIONS.join("\n");
  for (const expected of [/actual changed frontend/, /Passing tests.*do not replace/, /browser_snapshot/, /browser_screenshot/, /full working URL/, /Keep the preview server running/, /existing Playwright test runner/, /Label mocked data/, /specific.*blocker|exact blocker/]) assert.match(prompt, expected);
  assert.match(defaultAgentInstructions(), /Show the actual frontend/);
  const main = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  assert.match(main, /\.\.\.FRONTEND_PREVIEW_INSTRUCTIONS/);
  assert.match(main, /handleAgentBrowserCall\(tool, args, approvalThread, typeof params.callId/);
});
