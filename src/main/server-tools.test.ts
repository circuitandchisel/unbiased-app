import test from "node:test";
import assert from "node:assert/strict";
import { ServerToolsClient, ServerToolSessions, parseServerToolAnswer, offeredServerTools } from "./server-tools";

const caps = (search = true, image = true) => Response.json({ tools: { web_search: { allowed: search }, image_generation: { allowed: image } } });
const answer = (type: "web_search_call" | "image_generation_call", result?: string) => ({ status: "completed", output: [
  { type, status: "completed", ...(result ? { result } : {}) },
  { type: "message", content: [{ type: "output_text", text: "Tool answer", annotations: [
    { type: "url_citation", url: "https://example.com/source", title: "Source" },
    { type: "url_citation", url: "javascript:alert(1)", title: "Invalid" },
  ] }] },
] });
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";

test("capability discovery is strict, cached, and scoped to the current key", async () => {
  let key: string | null = "first"; const calls: string[] = [];
  const client = new ServerToolsClient(() => key, async (_url, init) => { calls.push(new Headers(init?.headers).get("Authorization")!); return calls.length === 1 ? caps(true, false) : caps(false, true); });
  assert.deepEqual(await client.capabilities(), { web_search: true, image_generation: false });
  assert.deepEqual(offeredServerTools(await client.capabilities()).map(tool => tool.name), ["web_search"]);
  assert.equal(calls.length, 1);
  key = "second";
  assert.deepEqual(await client.capabilities(), { web_search: false, image_generation: true });
  assert.deepEqual(calls, ["Bearer first", "Bearer second"]);
  key = null;
  assert.deepEqual(await client.capabilities(), { web_search: false, image_generation: false });
});

test("missing or malformed capability endpoints never offer or execute a tool", async () => {
  for (const response of [new Response("missing", { status: 404 }), Response.json({ tools: { web_search: { allowed: "true" } } })]) {
    const calls: string[] = [];
    const client = new ServerToolsClient(() => "key", async url => { calls.push(String(url)); return response; });
    await assert.rejects(client.execute("web_search", { query: "latest news" }, "chat"), /unavailable/);
    assert.deepEqual(offeredServerTools(await client.capabilities()), []);
    assert.equal(calls.length, 1);
    assert.ok(calls.every(url => url.endsWith("/v1/tool-capabilities")));
  }
});

for (const tool of ["web_search", "image_generation"] as const) test(`${tool} sends a forced native Responses request with no storage`, async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const client = new ServerToolsClient(() => "account-key", async (url, init) => {
    calls.push({ url: String(url), init });
    return String(url).endsWith("capabilities") ? caps() : Response.json(answer(tool === "web_search" ? "web_search_call" : "image_generation_call", tool === "image_generation" ? png : undefined));
  });
  const field = tool === "web_search" ? "query" : "prompt";
  const result = await client.execute(tool, { [field]: "User request" }, "chat");
  assert.equal(calls[1].url, "https://api.unbiased.ai/v1/responses");
  assert.equal(new Headers(calls[1].init?.headers).get("Authorization"), "Bearer account-key");
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { model: "pareto", input: [{ role: "user", content: "User request" }], store: false, stream: false, tools: [{ type: tool }], tool_choice: { type: tool } });
  assert.deepEqual(result.sources, [{ url: "https://example.com/source", title: "Source" }]);
  assert.equal(result.images.length, tool === "image_generation" ? 1 : 0);
});

test("a stopped request cannot send a billable call after capability lookup finishes", async () => {
  let finish!: (response: Response) => void; let posts = 0;
  const client = new ServerToolsClient(() => "key", async (_url, init) => {
    if (init?.method === "POST") { posts++; throw new Error("must not execute"); }
    return new Promise(resolve => { finish = resolve; });
  });
  const pending = client.execute("image_generation", { prompt: "A scene" }, "chat");
  client.cancel("chat"); finish(caps());
  await assert.rejects(pending); assert.equal(posts, 0);
});

test("reset discards an in-flight eligibility result even when a retained key is unchanged", async () => {
  let finish!: (response: Response) => void;
  const client = new ServerToolsClient(() => "retained-key", async () => new Promise(resolve => { finish = resolve; }));
  const pending = client.capabilities(); client.reset(); finish(caps());
  assert.deepEqual(await pending, { web_search: false, image_generation: false });
});

test("Stop aborts only the chosen conversation's active server request", async () => {
  const signals = new Map<string, AbortSignal>();
  const client = new ServerToolsClient(() => "key", async (url, init) => {
    if (String(url).endsWith("capabilities")) return caps();
    const prompt = JSON.parse(String(init?.body)).input[0].content;
    signals.set(prompt, init!.signal as AbortSignal);
    return new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  });
  await client.capabilities();
  const first = client.execute("web_search", { query: "one" }, "first");
  const second = client.execute("web_search", { query: "two" }, "second");
  await new Promise(resolve => setImmediate(resolve));
  client.cancel("first"); await assert.rejects(first, /aborted/);
  assert.equal(signals.get("two")!.aborted, false);
  client.cancel("second"); await assert.rejects(second, /aborted/);
});

test("incomplete tool results, invalid images and paid errors are not reported as success or retried", async () => {
  assert.throws(() => parseServerToolAnswer({ status: "completed", output: [] }, "web_search"), /completed tool/);
  assert.throws(() => parseServerToolAnswer(answer("image_generation_call", Buffer.from("not an image").toString("base64")), "image_generation"), /Invalid generated image/);
  let posts = 0;
  const client = new ServerToolsClient(() => "key", async (url) => String(url).endsWith("capabilities") ? caps() : (posts++, new Response("private provider body", { status: 402 })));
  await assert.rejects(client.execute("image_generation", { prompt: "Scene" }, "chat"), /available balance/);
  assert.equal(posts, 1);
});

test("Stop also refuses later queued tool calls until the next turn begins", async () => {
  let posts = 0;
  const client = new ServerToolsClient(() => "key", async url => String(url).endsWith("capabilities") ? caps() : (posts++, Response.json(answer("web_search_call"))));
  client.cancel("chat");
  await assert.rejects(client.execute("web_search", { query: "Query" }, "chat"), /stopped/);
  assert.equal(posts, 0);
  client.begin("chat"); await client.execute("web_search", { query: "Query" }, "chat");
  assert.equal(posts, 1);
});

test("existing engine sessions refresh once when a newly eligible tool is selected", async () => {
  const sessions = new ServerToolSessions(); let refreshes = 0;
  const refresh = async () => { refreshes++; };
  sessions.remember("chat", { web_search: true, image_generation: false });
  await sessions.prepare("chat", "web_search", { web_search: true, image_generation: true }, false, refresh);
  assert.equal(refreshes, 0);
  await assert.rejects(sessions.prepare("chat", "image_generation", { web_search: true, image_generation: true }, true, refresh), /current turn/);
  await sessions.prepare("chat", "image_generation", { web_search: true, image_generation: true }, false, refresh);
  await sessions.prepare("chat", "image_generation", { web_search: true, image_generation: true }, false, refresh);
  assert.equal(refreshes, 1);
  sessions.invalidate("chat");
  await sessions.prepare("chat", "web_search", { web_search: true, image_generation: false }, false, refresh);
  assert.equal(refreshes, 2);
  await assert.rejects(sessions.prepare("chat", "image_generation", { web_search: true, image_generation: false }, false, refresh), /unavailable/);
  assert.equal(refreshes, 2);
});
