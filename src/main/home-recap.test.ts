import test from "node:test";
import assert from "node:assert/strict";
import { HomeRecaps, recapInput } from "./home-recap";
const sources = { chats: [{ title: "Improve image generation previews", project: "Desktop" }] };
const answer = (text = "You’ve been refining your desktop app’s image-generation experience.") => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text }] }] });
test("recap bounds title-only evidence and rejects malformed inputs", () => {
  assert.throws(() => recapInput({ chats: Array(21).fill(sources.chats[0]) }));
  assert.throws(() => recapInput({ chats: [{ title: "Title", project: 42 }] }));
  assert.equal(recapInput({ chats: [{ title: "a".repeat(300), project: "b".repeat(100) }] }).chats[0].title.length, 200);
});
test("recaps deduplicate requests, cache by account and throttle changed sources", async () => {
  let key = "account-one", now = 100000, calls = 0;
  const client = new HomeRecaps(() => key, () => null, (async (_url, init) => {
    calls++;
    const request = JSON.parse(String(init?.body));
    assert.equal(request.store, false); assert.equal(request.stream, false);
    assert.deepEqual(request.tools, []);
    assert.equal(request.input[0].role, "developer");
    assert.match(request.input[0].content, /untrusted/);
    assert.deepEqual(JSON.parse(request.input[1].content).chats, sources.chats);
    return answer();
  }) as typeof fetch, () => now);
  const [first, second] = await Promise.all([client.get(sources), client.get(sources)]);
  assert.equal(calls, 1); assert.deepEqual(first, second);
  await client.get(sources); assert.equal(calls, 1);
  const changed = await client.get({ chats: [{ title: "New title", project: "Desktop" }] });
  assert.ok(changed.ok && changed.stale); assert.equal(calls, 1);
  key = "account-two"; await client.get(sources); assert.equal(calls, 2);
  key = "account-one"; now += 3600001; await client.get(sources); assert.equal(calls, 2, "same evidence remains cached for a day");
});
test("switching accounts during generation cannot display the previous account recap", async () => {
  let key = "one"; let finish!: (response: Response) => void;
  const client = new HomeRecaps(() => key, () => null, (() => new Promise(resolve => { finish = resolve; })) as typeof fetch);
  const pending = client.get(sources); key = "two"; finish(answer());
  const result = await pending;
  assert.ok(!result.ok && result.error.includes("account changed"));
});
test("recap failures are bounded and retried without a request loop", async () => {
  let calls = 0, now = 100000;
  const client = new HomeRecaps(() => "key", () => null, (async () => { calls++; return Response.json({}, { status: 503 }); }) as typeof fetch, () => now);
  assert.equal((await client.get(sources)).ok, false);
  assert.equal((await client.get(sources)).ok, false); assert.equal(calls, 1);
  now += 60001; await client.get(sources); assert.equal(calls, 2);
});

test("conversation context replaces the old title-only cache and reaches the recap prompt", async () => {
  let calls = 0; const requests: Record<string, unknown>[] = [];
  const client = new HomeRecaps(() => "key", () => null, (async (_url, init) => { calls++; requests.push(JSON.parse(String(init?.body))); return answer(); }) as typeof fetch);
  await client.get(sources);
  const context = { goal: "Improve Home", currentFocus: "Calendar", progress: ["Reported: added date selection"], decisions: ["Use sidebar icons"], pending: ["GitHub integration"], blockers: [] };
  await client.get({ chats: [{ ...sources.chats[0], id: "chat", context, contextUpdatedAt: Date.now() }] });
  assert.equal(calls, 2, "new context bypasses a cached title-only recap");
  assert.deepEqual(JSON.parse((requests[1].input as { content: string }[])[1].content).chats[0].context, context);
});
test("deleting source context invalidates even an in-flight recap", async () => {
  let finish!: (value: Response) => void;
  const client = new HomeRecaps(() => "key", () => null, (() => new Promise(resolve => { finish = resolve; })) as typeof fetch);
  const pending = client.get(sources); client.invalidate(); finish(answer());
  assert.equal((await pending).ok, false);
});
