// Fixed first-party plugins only. The manifest cannot load arbitrary code.
const { createInterface } = require("node:readline");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createHost } = require("./host.cjs");

const catalog = JSON.parse(readFileSync(join(__dirname, "manifest.json"), "utf8"));
const host = createHost(catalog, {
  "session-activity": require("./plugins/session-activity.cjs"),
  "turn-timing": require("./plugins/turn-timing.cjs"),
});

function respond(id, result, error) {
  process.stdout.write(JSON.stringify(error ? { id, error: { message: error } } : { id, result }) + "\n");
}

createInterface({ input: process.stdin }).on("line", (line) => {
  if (line.length > 8192) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (!msg || typeof msg.method !== "string") return;
  if (msg.method === "mods/event") {
    host.observe(msg.params);
    return;
  }
  if (!Number.isSafeInteger(msg.id)) return;
  if (msg.method === "mods/initialize") {
    if (msg.params?.protocolVersion !== catalog.protocolVersion) return respond(msg.id, null, "protocol mismatch");
    return respond(msg.id, { protocolVersion: catalog.protocolVersion, plugins: host.plugins, tools: host.tools });
  }
  if (msg.method === "mods/tool/call") {
    void host.callTool(msg.params?.threadId, msg.params?.tool)
      .then((result) => respond(msg.id, result), (error) => respond(msg.id, null, String(error)));
    return;
  }
  respond(msg.id, null, "unknown method");
});

process.on("exit", () => host.dispose());
