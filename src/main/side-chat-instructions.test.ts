import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";
import { SideChatRecents } from "./side-chat-recents";
import { sideChatInstructions } from "./side-chat-start";

test("cold and catalog resumes preserve the side-chat boundary without applying it to the parent", async () => {
  const recents = new SideChatRecents();
  recents.register({ paneId: "side:one", threadId: "child", parentThreadId: "parent", cwd: "/repo", baselineTurns: 3, title: "Hello" });
  recents.close("side:one");
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const start = source.indexOf("async function resumeParamsFor(");
  const end = source.indexOf("// Project identity", start);
  assert.ok(start >= 0 && end > start);
  const invalidated: string[] = [];
  const context: any = {
    serverToolSessions: { invalidate: (id: string) => invalidated.push(id) },
    threadPolicy: () => ({ approvalPolicy: "on-request" }),
    threadCwds: new Map([["parent", "/repo"], ["child", "/repo"]]),
    developerInstructionsFor: (_cwd: string, id: string) => `Instructions for ${id}`,
    sideChatRecents: recents,
    sideChatInstructions,
    mcpOverrideFor: (id: string) => ({ selection: id }),
  };
  runInNewContext(transformSync(source.slice(start, end), { loader: "ts" }).code, context);
  const resumed = await context.resumeParamsFor("child");
  assert.equal(resumed.developerInstructions, sideChatInstructions("Instructions for child"));
  assert.equal(resumed.config.selection, "child");
  assert.equal(resumed.approvalPolicy, "on-request");
  recents.reopen("side:one", "parent");
  assert.equal((await context.resumeParamsFor("child")).developerInstructions, resumed.developerInstructions);
  assert.equal((await context.resumeParamsFor("parent")).developerInstructions, "Instructions for parent");
  assert.deepEqual(invalidated, ["child", "child", "parent"]);
});
