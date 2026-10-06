// First-party Mods v1 sidecar. It receives metadata only, never conversation content.
const { createInterface } = require("node:readline");

const PROTOCOL = 1;
const sessions = new Map();
const MAX_SESSIONS = 1000;

function respond(id, result, error) {
  process.stdout.write(JSON.stringify(error ? { id, error: { message: error } } : { id, result }) + "\n");
}

function observe(params) {
  if (!params || typeof params.threadId !== "string" || params.threadId.length > 200) return;
  if (!["turn_started", "turn_completed", "tool_called"].includes(params.kind)) return;
  let stats = sessions.get(params.threadId);
  if (!stats) {
    if (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
    stats = { turnsStarted: 0, turnsCompleted: 0, toolsCalled: 0 };
    sessions.set(params.threadId, stats);
  }
  if (params.kind === "turn_started") stats.turnsStarted++;
  if (params.kind === "turn_completed") stats.turnsCompleted++;
  if (params.kind === "tool_called") stats.toolsCalled++;
}

createInterface({ input: process.stdin }).on("line", (line) => {
  if (line.length > 8192) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (!msg || typeof msg.method !== "string") return;
  if (msg.method === "mods/event") {
    observe(msg.params);
    return;
  }
  if (!Number.isSafeInteger(msg.id)) return;
  if (msg.method === "mods/initialize") {
    if (msg.params?.protocolVersion !== PROTOCOL) return respond(msg.id, null, "protocol mismatch");
    return respond(msg.id, { protocolVersion: PROTOCOL, tools: ["mods_session_stats"] });
  }
  if (msg.method === "mods/tool/call") {
    const p = msg.params;
    if (p?.tool !== "mods_session_stats" || typeof p.threadId !== "string")
      return respond(msg.id, null, "unknown tool or thread");
    return respond(msg.id, sessions.get(p.threadId) ?? { turnsStarted: 0, turnsCompleted: 0, toolsCalled: 0 });
  }
  respond(msg.id, null, "unknown method");
});
