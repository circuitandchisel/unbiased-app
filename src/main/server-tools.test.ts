import test from "node:test";
import assert from "node:assert/strict";
import { ServerToolsClient, ServerToolSessions, parseServerToolAnswer, offeredServerTools, browserToolsForAccount } from "./server-tools";

const eligibleIdentity = { ok: true, organization: { id: "org", name: "Account" }, workload: { id: "work", name: "Desktop" },
  keyName: "Desktop", accessStatus: "granted", accountType: "personal", chatEligibility: { allowed: true, reason: "eligible" } };
const whoami = (overrides: Record<string, unknown> = {}) => Response.json({ ...eligibleIdentity, ...overrides });
const answer = (type: "web_search_call" | "image_generation_call", result?: string) => ({ status: "completed", output: [
  { type, status: "completed", ...(result ? { result } : {}) },
  { type: "message", content: [{ type: "output_text", text: "Tool answer", annotations: [
    { type: "url_citation", url: "https://example.com/source", title: "Source" },
    { type: "url_citation", url: "javascript:alert(1)", title: "Invalid" },
  ] }] },
] });
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";

test("Chat entitlement discovery is cached and scoped to the current key", async () => {
  let key: string | null = "first"; const calls: string[] = [];
  const client = new ServerToolsClient(() => key, async (_url, init) => { calls.push(new Headers(init?.headers).get("Authorization")!); return calls.length === 1 ? whoami() : whoami({ chatEligibility: { allowed: false, reason: "subscription_required" } }); });
  assert.deepEqual(await client.capabilities(), { web_search: true, image_generation: true });
  assert.deepEqual(offeredServerTools(await client.capabilities()).map(tool => tool.name), ["web_search", "image_generation"]);
  assert.equal(calls.length, 1);
  key = "second";
  assert.deepEqual(await client.capabilities(), { web_search: false, image_generation: false });
  assert.deepEqual(calls, ["Bearer first", "Bearer second"]);
  key = null;
  assert.deepEqual(await client.capabilities(), { web_search: false, image_generation: false });
});

for (const [label, overrides, allowed] of [
  ["active personal subscription", {}, true],
  ["allowlisted business", { accountType: "business", chatEligibility: { allowed: true, reason: "organization_grant" } }, true],
  ["allowlisted invoiced", { accountType: "invoiced", chatEligibility: { allowed: true, reason: "organization_grant" } }, true],
  ["allowlisted personal", { chatEligibility: { allowed: true, reason: "organization_grant" } }, true],
  ["allowlisted unknown account type", { accountType: null, chatEligibility: { allowed: true, reason: "organization_grant" } }, true],
  ["unsubscribed personal", { chatEligibility: { allowed: false, reason: "subscription_required" } }, false],
  ["revoked organization grant", { accountType: "business", chatEligibility: { allowed: false, reason: "account_type_ineligible" } }, false],
  ["API customer without Chat grant", { accountType: "business" }, false],
  ["invoiced customer without Chat grant", { accountType: "invoiced" }, false],
  ["unknown account type without grant", { accountType: null }, false],
  ["denied account access", { accessStatus: "denied", chatEligibility: { allowed: true, reason: "organization_grant" } }, false],
  ["unverified identity", { ok: false }, false],
  ["missing organization", { organization: undefined }, false],
  ["missing workload", { workload: undefined }, false],
  ["missing key name", { keyName: "" }, false],
  ["missing Chat eligibility", { chatEligibility: undefined }, false],
  ["unverified Chat eligibility", { chatEligibility: { allowed: false, reason: "verification_unavailable" } }, false],
  ["unknown eligibility reason", { chatEligibility: { allowed: true, reason: "unknown" } }, false],
  ["nonboolean eligibility", { chatEligibility: { allowed: "true", reason: "eligible" } }, false],
] as const) test(`Chat entitlement: ${label}`, async () => {
  let posts = 0;
  const client = new ServerToolsClient(() => "key", async (_url, init) => {
    if (init?.method === "POST") { posts++; throw new Error("unexpected paid request"); }
    return whoami(overrides);
  });
  assert.deepEqual(await client.capabilities(), { web_search: allowed, image_generation: allowed });
  if (!allowed) {
    await assert.rejects(client.execute("web_search", { query: "Current news" }, "chat"), /subscription or organization grant/);
    assert.equal(posts, 0);
  }
});

test("execution rechecks Chat entitlement instead of trusting the menu cache", async () => {
  let reads = 0; let posts = 0;
  const client = new ServerToolsClient(() => "key", async (_url, init) => {
    if (init?.method === "POST") { posts++; throw new Error("must not execute"); }
    return ++reads === 1 ? whoami() : whoami({ chatEligibility: { allowed: false, reason: "subscription_required" } });
  });
  assert.deepEqual(await client.capabilities(), { web_search: true, image_generation: true });
  await assert.rejects(client.execute("image_generation", { prompt: "A mountain" }, "chat"), /subscription or organization grant/);
  assert.equal(reads, 2); assert.equal(posts, 0);
  assert.deepEqual(await client.capabilities(), { web_search: false, image_generation: false });
});

test("entitlement uses the desktop's configured platform and keeps the key in the host", async () => {
  const calls: { url: string; authorization: string | null }[] = [];
  const client = new ServerToolsClient(() => "key", async (url, init) => {
    calls.push({ url: String(url), authorization: new Headers(init?.headers).get("Authorization") }); return whoami();
  }, () => "https://platform.example.test");
  await client.capabilities();
  assert.deepEqual(calls, [{ url: "https://platform.example.test/api/cli/whoami", authorization: "Bearer key" }]);
});

test("missing or malformed whoami responses never offer or execute a tool", async () => {
  for (const response of [new Response("missing", { status: 404 }), new Response("unauthorized", { status: 401 }), new Response("unavailable", { status: 503 }), Response.json({ tools: { web_search: { allowed: "true" } } })]) {
    const calls: string[] = [];
    const client = new ServerToolsClient(() => "key", async url => { calls.push(String(url)); return response; });
    await assert.rejects(client.execute("web_search", { query: "latest news" }, "chat"), /subscription or organization grant/);
    assert.deepEqual(offeredServerTools(await client.capabilities()), []);
    assert.equal(calls.length, 1);
    assert.ok(calls.every(url => url.endsWith("/api/cli/whoami")));
  }
});

for (const tool of ["web_search", "image_generation"] as const) test(`${tool} sends a forced native Responses request with no storage`, async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const client = new ServerToolsClient(() => "account-key", async (url, init) => {
    calls.push({ url: String(url), init });
    return String(url).endsWith("/api/cli/whoami") ? whoami() : Response.json(answer(tool === "web_search" ? "web_search_call" : "image_generation_call", tool === "image_generation" ? png : undefined));
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
  client.cancel("chat"); finish(whoami());
  await assert.rejects(pending); assert.equal(posts, 0);
});

test("reset discards an in-flight eligibility result even when a retained key is unchanged", async () => {
  let finish!: (response: Response) => void;
  const client = new ServerToolsClient(() => "retained-key", async () => new Promise(resolve => { finish = resolve; }));
  const pending = client.capabilities(); client.reset(); finish(whoami());
  assert.deepEqual(await pending, { web_search: false, image_generation: false });
});

test("Stop aborts only the chosen conversation's active server request", async () => {
  const signals = new Map<string, AbortSignal>();
  const client = new ServerToolsClient(() => "key", async (url, init) => {
    if (String(url).endsWith("/api/cli/whoami")) return whoami();
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
  const client = new ServerToolsClient(() => "key", async (url) => String(url).endsWith("/api/cli/whoami") ? whoami() : (posts++, new Response("private provider body", { status: 402 })));
  await assert.rejects(client.execute("image_generation", { prompt: "Scene" }, "chat"), /available balance/);
  assert.equal(posts, 1);
});

test("Stop also refuses later queued tool calls until the next turn begins", async () => {
  let posts = 0;
  const client = new ServerToolsClient(() => "key", async url => String(url).endsWith("/api/cli/whoami") ? whoami() : (posts++, Response.json(answer("web_search_call"))));
  client.cancel("chat");
  await assert.rejects(client.execute("web_search", { query: "Query" }, "chat"), /stopped/);
  assert.equal(posts, 0);
  client.begin("chat"); await client.execute("web_search", { query: "Query" }, "chat");
  assert.equal(posts, 1);
});

test("natural-language turns refresh unknown and changed eligible catalogs once", async () => {
  const sessions = new ServerToolSessions(); let refreshes = 0;
  const refresh = async () => { refreshes++; };
  const both = { web_search: true, image_generation: true };
  // No explicit tool selection: an older resumed thread gains both tools.
  await sessions.prepareAvailable("old-chat", both, false, refresh);
  await sessions.prepareAvailable("old-chat", both, false, refresh);
  assert.equal(refreshes, 1);
  sessions.remember("fresh-chat", both);
  await sessions.prepareAvailable("fresh-chat", both, false, refresh);
  assert.equal(refreshes, 1, "new and unchanged sessions avoid a resume round trip");
  sessions.remember("search-only", { web_search: true, image_generation: false });
  await assert.rejects(sessions.prepareAvailable("search-only", both, true, refresh), /current turn/);
  assert.equal(refreshes, 1, "never unload a running turn");
  await sessions.prepareAvailable("search-only", both, false, refresh);
  assert.equal(refreshes, 2);
  sessions.invalidate("old-chat");
  await sessions.prepareAvailable("old-chat", both, false, refresh);
  assert.equal(refreshes, 3, "resumed threads refresh before an automatic tool choice");
});

test("catalog refresh handles revoked eligibility and retries after a failed reload", async () => {
  const sessions = new ServerToolSessions(); let refreshes = 0;
  const none = { web_search: false, image_generation: false };
  const both = { web_search: true, image_generation: true };
  const refresh = async () => { refreshes++; };
  await sessions.prepareAvailable("unknown-ineligible", none, false, refresh);
  assert.equal(refreshes, 0, "accounts with no native tools need no cold refresh");
  sessions.remember("chat", both);
  await sessions.prepareAvailable("chat", none, false, refresh);
  await sessions.prepareAvailable("chat", none, false, refresh);
  assert.equal(refreshes, 1, "drop withdrawn tools once");
  await assert.rejects(sessions.prepareAvailable("chat", both, false, async () => { throw Error("reload failed"); }), /reload failed/);
  await sessions.prepareAvailable("chat", both, false, refresh);
  assert.equal(refreshes, 2, "failed reload does not claim the new catalog is installed");
});

test("eligible research offers native search without the competing browser search", () => {
  const browser = ["browser_search", "browser_open", "browser_read", "browser_connect", "browser_side_open"].map(name => ({ name }));
  const eligible = { web_search: true, image_generation: true };
  const catalog = [...offeredServerTools(eligible), ...browserToolsForAccount(browser, eligible)];
  assert.deepEqual(catalog.map(tool => tool.name), ["web_search", "image_generation", "browser_open", "browser_read", "browser_connect", "browser_side_open"]);
  assert.deepEqual(browserToolsForAccount(browser, { web_search: false, image_generation: false }), browser);
  assert.equal(browser[0].name, "browser_search", "do not mutate the browser runtime's catalog");
});
