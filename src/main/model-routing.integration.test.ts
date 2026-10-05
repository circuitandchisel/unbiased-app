import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { EngineClient } from "./engine";
import { APP_MODEL, FALLBACK_MODEL } from "./model-routing";

function completion(engine: EngineClient): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error("No terminal notification within 25s")); }, 25000);
    const listener = (message: any) => {
      if (message.method === "turn/completed") { cleanup(); resolve(message.params.turn); }
    };
    const cleanup = () => { clearTimeout(timer); engine.off("notification", listener); };
    engine.on("notification", listener);
  });
}

test("EngineClient routes async JSON-RPC failures to a single alias continuation", { skip: process.platform === "win32", timeout: 30000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "unbiased-routing-wire-"));
  const executable = join(dir, "engine.cjs");
  writeFileSync(executable, `#!/usr/bin/env node
const { createInterface } = require('node:readline');
const emit = x => process.stdout.write(JSON.stringify(x) + '\\n');
let turns = 0;
createInterface({input: process.stdin}).on('line', line => {
  const {id,method,params} = JSON.parse(line);
  if (method !== 'turn/start') { emit({id,result:params}); return; }
  turns++;
  const expected = turns === 1 ? '${APP_MODEL}' : '${FALLBACK_MODEL}';
  if (params.model !== expected || turns > 2 || (turns === 2 && params.input.length !== 0)) {
    emit({id,error:{code:-32603,message:'incorrect model or duplicated input'}}); return;
  }
  const turn = {id:'turn-'+turns,status:'inProgress'};
  emit({id,result:{turn}});
  emit({method:'turn/started',params:{threadId:'thread',turn}});
  emit({method:'turn/completed',params:{threadId:'thread',turn:{...turn,status:turns===1?'failed':'completed',error:turns===1?{message:'not available',codexErrorInfo:{httpConnectionFailed:{httpStatusCode:404}}}:null}}});
});
`, { mode: 0o755 });
  const engine = new EngineClient();
  try {
    engine.start(executable);
    for (const method of ["thread/start", "thread/resume", "thread/fork"]) {
      assert.deepEqual(await engine.request(method, { model: "pareto", threadId: "thread" }), { model: APP_MODEL, threadId: "thread" });
    }
    const finished = completion(engine);
    await engine.request("turn/start", { threadId: "thread", input: [{ type: "text", text: "test" }] });
    const turn = await finished;
    assert.equal(turn.id, "turn-2"); assert.equal(turn.status, "completed");
  } finally { engine.stop(); rmSync(dir, { recursive: true, force: true }); }
});

// Opt-in local conformance check: real engine, isolated home, loopback API, no credentials or paid calls.
test("real app-server resumes persisted user input on the fallback without duplicating it", { skip: !process.env.UNBIASED_TEST_APP_SERVER, timeout: 30000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "unbiased-routing-real-"));
  const requests: any[] = [];
  const server = createServer(async (req, res) => {
    if (req.method !== "POST" || !req.url?.endsWith("/responses")) { res.writeHead(404); res.end(); return; }
    let body = ""; for await (const chunk of req) body += chunk;
    const request = JSON.parse(body); requests.push(request);
    if (request.model === APP_MODEL) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { type: "invalid_request_error", code: "model_not_found", message: "Preview model unavailable" } })); return;
    }
    const item = { type: "message", id: "msg_test", role: "assistant", status: "completed", content: [{ type: "output_text", text: "OK", annotations: [] }] };
    const response = { id: "resp_test", object: "response", model: FALLBACK_MODEL, status: "completed", output: [item], usage: { input_tokens: 20, output_tokens: 1, total_tokens: 21 } };
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    for (const e of [
      { type: "response.created", response: { ...response, status: "in_progress", output: [] } },
      { type: "response.output_item.added", output_index: 0, item: { ...item, status: "in_progress", content: [] } },
      { type: "response.output_text.delta", item_id: item.id, output_index: 0, content_index: 0, delta: "OK" },
      { type: "response.output_item.done", output_index: 0, item },
      { type: "response.completed", response },
    ]) res.write(`data: ${JSON.stringify(e)}\n\n`);
    res.end();
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert(address && typeof address !== "string");
  writeFileSync(join(dir, "config.toml"), `model = "pareto"
model_provider = "fixture"
model_context_window = 1048576
model_reasoning_effort = "none"
[model_providers.fixture]
name = "Local routing test"
base_url = "http://127.0.0.1:${address.port}/v1"
wire_api = "responses"
env_key = "UNBIASED_ROUTING_TEST_KEY"
request_max_retries = 0
stream_max_retries = 0
supports_websockets = false
`, { mode: 0o600 });
  const engine = new EngineClient();
  try {
    engine.start(process.env.UNBIASED_TEST_APP_SERVER!, { CODEX_HOME: dir, UNBIASED_ROUTING_TEST_KEY: "local-test-only", RUST_LOG: "error" });
    await engine.handshake("routing-test");
    const start = await engine.request("thread/start", { cwd: dir, ephemeral: true, approvalPolicy: "on-request", sandbox: "read-only" }) as any;
    const finished = completion(engine);
    const prompt = "routing-fixture-unique-user-input";
    await engine.request("turn/start", { threadId: start.thread.id, input: [{ type: "text", text: prompt }] });
    const turn = await finished;
    assert.equal(turn.status, "completed", JSON.stringify(turn.error));
    assert.deepEqual(requests.map(r => r.model), [APP_MODEL, FALLBACK_MODEL]);
    assert.equal(JSON.stringify(requests[1].input).split(prompt).length - 1, 1, "the original message occurs exactly once");
  } finally {
    engine.stop(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
});
