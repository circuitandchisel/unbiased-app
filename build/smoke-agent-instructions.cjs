// Exercise the actual release wrapper/server against a loopback mock, without paid inference.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { createServer } = require("node:http");
const { createInterface } = require("node:readline");
const fs = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
require("tsx/cjs");
const { agentInstructionsGuidance, connectAgentInstructions, readAgentInstructions, saveAgentInstructions } = require("../src/main/agent-instructions.ts");
const { listSlashCommands, resolveSlashSkill } = require("../src/main/skill-commands.ts");

async function main() {
  assert.ok(process.env.UNBIASED_ENGINE_DIR, "Set UNBIASED_ENGINE_DIR to the release engine bundle");
  const home = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), "unbiased-global-instructions-")));
  const engineHome = join(home, ".unbiased", "app-engine", "home");
  const requests = [];
  let stderr = "";
  let proc;
  process.once("exit", () => proc?.kill());
  const server = createServer(async (req, res) => {
    if (req.method !== "POST" || !req.url.startsWith("/v1/responses")) {
      res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"data":[]}'); return;
    }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    requests.push(JSON.parse(Buffer.concat(chunks).toString()));
    const id = `response-${requests.length}`;
    const events = [
      { type: "response.created", response: { id } },
      { type: "response.completed", response: { id, usage: { input_tokens: 10, output_tokens: 0, total_tokens: 10 } } },
    ];
    res.writeHead(200, { "Content-Type": "text/event-stream", "Connection": "close" });
    res.end(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""));
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  const gateway = `http://127.0.0.1:${server.address().port}/v1`;
  const pending = new Map();
  const messages = [];
  let nextId = 0;
  function send(method, params = {}) { proc.stdin.write(JSON.stringify({ method, params }) + "\n"); }
  function request(method, params = {}) {
    const id = ++nextId;
    return new Promise((resolveRequest, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out: ${stderr}`)); }, 15000);
      pending.set(id, { resolve: value => { clearTimeout(timer); resolveRequest(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      proc.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }
  async function start() {
    messages.length = 0;
    proc = spawn(join(resolve(process.env.UNBIASED_ENGINE_DIR), "unbiased-app-engine"), ["--home", engineHome, "--base-url", gateway, "--mcp-config", join(home, "no-mcp.json")], {
      cwd: home, env: { ...process.env, HOME: home, UNBIASED_API_KEY: "local-test-only", UNBIASED_JEV_URL: gateway + "/jev", CODEX_HOME: engineHome }, stdio: ["pipe", "pipe", "pipe"],
    });
    proc.stderr.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-12000); });
    createInterface({ input: proc.stdout }).on("line", line => {
      let msg; try { msg = JSON.parse(line); } catch { return; }
      if (msg.id !== undefined && !msg.method) {
        const call = pending.get(msg.id); if (!call) return;
        pending.delete(msg.id); if (msg.error) call.reject(new Error(JSON.stringify(msg.error))); else call.resolve(msg.result);
      } else messages.push(msg);
    });
    proc.on("error", error => { for (const call of pending.values()) call.reject(error); pending.clear(); });
    const hello = await request("initialize", { clientInfo: { name: "unbiased_instructions_test", version: "1" }, capabilities: { experimentalApi: true } });
    send("initialized");
    connectAgentInstructions(home, hello.codexHome);
  }
  async function stop() {
    if (!proc || proc.exitCode !== null) return;
    const current = proc;
    await new Promise(done => { current.once("exit", done); current.kill(); });
  }
  async function thread(cwd) {
    return (await request("thread/start", { cwd, approvalPolicy: "never", sandbox: "danger-full-access", developerInstructions: agentInstructionsGuidance(home), config: { "features.code_mode": false } })).thread.id;
  }
  async function turn(id, extraInput = []) {
    const prior = requests.length;
    const firstMessage = messages.length;
    await request("turn/start", { threadId: id, input: [{ type: "text", text: "Reply briefly. This is a local fixture." }, ...extraInput] });
    for (let i = 0; i < 150; i++) {
      const completion = messages.slice(firstMessage).find(msg => msg.method === "turn/completed" && msg.params.threadId === id);
      if (completion) {
        assert.equal(completion.params.turn.status, "completed", JSON.stringify(completion));
        assert.equal(requests.length, prior + 1);
        return JSON.stringify(requests.at(-1));
      }
      await new Promise(done => setTimeout(done, 50));
    }
    throw new Error("Turn did not complete: " + stderr + JSON.stringify(messages.slice(firstMessage)));
  }
  function save(content) {
    const result = saveAgentInstructions(home, { content, expectedRevision: readAgentInstructions(home).revision });
    assert.ok(result.ok, JSON.stringify(result));
  }
  function latestInstructions(raw) {
    const input = JSON.parse(raw).input;
    return input.flatMap(item => item.role === "user" && Array.isArray(item.content) ? item.content.map(part => part.text ?? "") : [])
      .filter(text => text.includes("# AGENTS.md instructions")).at(-1) ?? "";
  }
  try {
    const projectA = join(home, "project-a"), projectB = join(home, "project-b");
    fs.mkdirSync(projectA); fs.mkdirSync(projectB); fs.mkdirSync(join(home, ".codex"));
    fs.writeFileSync(join(home, ".codex", "AGENTS.md"), "CODEX_ONLY_MUST_NOT_LOAD");
    fs.writeFileSync(join(projectA, "AGENTS.md"), "PROJECT_A_RULE");
    fs.writeFileSync(join(projectB, "AGENTS.md"), "PROJECT_B_RULE");
    save("GLOBAL_RULE_FIRST"); await start();
    const a = await thread(projectA);
    const first = await turn(a);
    assert.match(first, /GLOBAL_RULE_FIRST/); assert.match(first, /PROJECT_A_RULE/); assert.doesNotMatch(first, /CODEX_ONLY_MUST_NOT_LOAD/);
    save("GLOBAL_RULE_SECOND");
    const refreshed = latestInstructions(await turn(a));
    assert.match(refreshed, /GLOBAL_RULE_SECOND/, "existing thread refreshes instructions on next turn");
    assert.doesNotMatch(refreshed, /GLOBAL_RULE_FIRST/, "active instructions replace the previous global text");
    const secondProject = await turn(await thread(projectB));
    assert.match(secondProject, /GLOBAL_RULE_SECOND/); assert.match(secondProject, /PROJECT_B_RULE/); assert.doesNotMatch(secondProject, /PROJECT_A_RULE/);
    save("");
    const cleared = latestInstructions(await turn(a));
    assert.match(cleared, /PROJECT_A_RULE/);
    assert.doesNotMatch(cleared, /GLOBAL_RULE_FIRST|GLOBAL_RULE_SECOND/, "clearing removes global rules from active instructions");
    save("GLOBAL_RULE_SECOND");
    await stop(); await start();
    const resumed = await request("thread/resume", { threadId: a });
    assert.equal(resumed.thread.id, a);
    assert.match(await turn(a), /GLOBAL_RULE_SECOND/, "instructions survive engine restart and resume");
    const skillsRoot = resolve("resources/skills");
    await request("skills/extraRoots/set", { extraRoots: [skillsRoot] });
    const commands = await listSlashCommands(request, projectA, skillsRoot);
    const review = commands.find(command => command.command === "CodeReview");
    assert.ok(review?.skill, "packaged Code Review skill must be discovered");
    const skillInput = await resolveSlashSkill(request, projectA, skillsRoot, "/CodeReview origin/main", review.skill.path);
    const reviewRequest = await turn(await thread(projectA), [skillInput]);
    assert.match(reviewRequest, /Two-axis review/);
    assert.match(reviewRequest, /Mysterious Name/);
    assert.ok(reviewRequest.includes("references/github.md"));
    assert.equal(fs.readFileSync(join(home, ".codex", "AGENTS.md"), "utf8"), "CODEX_ONLY_MUST_NOT_LOAD");
    console.log("PASS: release wrapper/server preserve global/project instruction behavior and Codex isolation; discover CodeReview and expand its explicit skill input with complete review instructions and supporting-file references. All model requests used a local mock.");
  } finally { await stop(); server.closeAllConnections(); await new Promise(done => server.close(done)); fs.rmSync(home, { recursive: true, force: true }); }
}
const deadline = setTimeout(() => { console.error("Global instructions engine smoke timed out"); process.exit(1); }, 60000); deadline.unref();
main().catch(error => { console.error(error); process.exitCode = 1; });
