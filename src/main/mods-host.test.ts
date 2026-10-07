import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

const { createHost } = require(join(process.cwd(), "resources", "mods", "host.cjs"));

const declaration = (id: string, events: string[], tool: string) => ({
  id, events, tools: [{ name: tool }],
});

test("a plugin registers an event and tool, then unloads both", async () => {
  let observed = 0;
  let cleaned = false;
  const host = createHost({ protocolVersion: 2, plugins: [declaration("sample", ["turn_started"], "mods_sample")] }, {
    sample: {
      setup(api: { onEvent: (kind: string, fn: () => void) => void; registerTool: (name: string, fn: () => string) => void }) {
        api.onEvent("turn_started", () => observed++);
        api.registerTool("mods_sample", () => String(observed));
        return () => { cleaned = true; };
      },
    },
  });
  host.observe({ threadId: "chat-a", kind: "turn_started" });
  assert.deepEqual(await host.callTool("chat-a", "mods_sample"), { text: "1" });
  host.dispose();
  host.observe({ threadId: "chat-a", kind: "turn_started" });
  assert.equal(observed, 1);
  assert.equal(cleaned, true);
  await assert.rejects(host.callTool("chat-a", "mods_sample"), /invalid Mods chat/);
});

test("a plugin cannot register an undeclared tool", () => {
  assert.throws(() => createHost({ protocolVersion: 2, plugins: [declaration("sample", [], "mods_allowed")] }, {
    sample: { setup(api: { registerTool: (name: string, fn: () => string) => void }) {
      api.registerTool("mods_other", () => "oops");
    } },
  }), /cannot register/);
});

test("a failed plugin activation cleans up earlier plugins", () => {
  let cleaned = false;
  const manifest = { protocolVersion: 2, plugins: [
    declaration("first", [], "mods_first"), declaration("second", [], "mods_second"),
  ] };
  assert.throws(() => createHost(manifest, {
    first: { setup(api: { registerTool: (name: string, fn: () => string) => void }) {
      api.registerTool("mods_first", () => "ok");
      return () => { cleaned = true; };
    } },
    second: { setup() { throw new Error("activation failed"); } },
  }), /activation failed/);
  assert.equal(cleaned, true);
});
