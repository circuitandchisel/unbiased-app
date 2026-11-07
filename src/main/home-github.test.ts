import test from "node:test";
import assert from "node:assert/strict";
import { HomeGithub, githubRepository, githubWindow } from "./home-github";
const input = { start: "2026-11-06T00:00:00-06:00", end: "2026-11-07T00:00:00-06:00" };
const pr = { number: 7, title: "Improve Home", url: "https://github.com/org/app/pull/7", repository: { nameWithOwner: "org/app" }, createdAt: "2026-11-06T10:00:00Z", mergedAt: "2026-11-06T15:00:00Z", state: "MERGED" };
function response(login: string) { return JSON.stringify({ data: { viewer: { login }, opened: { issueCount: 2, pageInfo: { hasNextPage: true }, nodes: [pr] }, merged: { issueCount: 1, pageInfo: { hasNextPage: false }, nodes: [pr] } } }); }
test("GitHub repository scoping accepts GitHub origins and rejects injected search syntax", () => {
  for (const remote of ["git@github.com:org/app.git", "https://github.com/org/app.git", "ssh://git@github.com/org/app.git"]) assert.equal(githubRepository(remote), "org/app");
  for (const remote of ["https://github.com.evil/org/app", "git@github.com:org/app repo:other/private", "https://gitlab.com/org/app", "/local/repo"]) assert.equal(githubRepository(remote), null);
});
test("GitHub dates retain the selected day's timezone and reject unbounded requests", () => {
  assert.deepEqual(githubWindow(input), { start: "2026-11-06T06:00:00Z", end: "2026-11-07T06:00:00Z" });
  assert.throws(() => githubWindow({ start: "bad", end: input.end }));
  assert.throws(() => githubWindow({ start: input.end, end: input.start }));
  assert.throws(() => githubWindow({ start: "2026-01-01", end: "2026-12-01" }));
});
test("PR activity uses authored creation and merge dates, deduplicates rows and caches by GitHub identity", async () => {
  let login = "alice", queries = 0;
  const client = new HomeGithub(async (_command, args) => {
    if (args.includes("user")) return login;
    queries++;
    assert.ok(args.includes("graphql"));
    assert.ok(args.some(arg => arg.startsWith(`opened=is:pr author:${login}`) && arg.includes("created:2026-11-06T06:00:00Z..2026-11-07T05:59:59Z")));
    assert.ok(args.some(arg => arg.startsWith("merged=") && arg.includes("merged:2026-11-06T06:00:00Z..2026-11-07T05:59:59Z")));
    return response(login);
  });
  const result = await client.get(input);
  assert.ok(result.ok); assert.equal(result.opened, 2); assert.equal(result.merged, 1);
  assert.equal(result.pullRequests.length, 1); assert.equal(result.partial, true);
  await client.get(input); assert.equal(queries, 1);
  login = "bob"; const changed = await client.get(input); assert.ok(changed.ok && changed.login === "bob"); assert.equal(queries, 2);
});
test("project requests use only that project's GitHub remotes and never fall back to all repositories", async () => {
  const client = new HomeGithub(async (command, args, cwd) => {
    if (args.includes("user")) return "alice";
    if (command === "git") return cwd === "/project" ? "git@github.com:org/app.git" : "https://gitlab.com/org/app";
    assert.ok(args.some(arg => arg.startsWith("opened=") && arg.includes("repo:org/app")));
    return response("alice");
  });
  assert.equal((await client.get(input, ["/project"])).ok, true);
  const missing = await client.get(input, ["/other"]); assert.ok(!missing.ok && missing.error.includes("no GitHub"));
});
test("CLI and GraphQL failures stay unavailable rather than showing zero activity", async () => {
  const client = new HomeGithub(async (_command, args) => args.includes("user") ? "alice" : JSON.stringify({ errors: [{ message: "rate limited" }] }));
  assert.equal((await client.get(input)).ok, false);
  const absent = new HomeGithub(async () => { throw new Error("sensitive stderr"); });
  const result = await absent.get(input); assert.ok(!result.ok && !result.error.includes("sensitive"));
});

test("manual refresh bypasses the cache and expected identity prevents mixed-account details", async () => {
  let login = "alice", queries = 0;
  const client = new HomeGithub(async (_command, args) => {
    if (args.includes("user")) return login;
    queries++; return response(login);
  });
  await client.get(input); await client.get(input); assert.equal(queries, 1);
  await client.get({ ...input, refresh: true }); assert.equal(queries, 2);
  login = "bob";
  const mismatch = await client.get({ ...input, expectedLogin: "alice", includeActivity: true });
  assert.ok(!mismatch.ok && mismatch.error.includes("account changed"));
  assert.equal(queries, 2, "a mismatched account must not load private activity");
});

test("cached detail history cannot overwrite freshly refreshed PR totals", async () => {
  let count = 1;
  const client = new HomeGithub(async (_command, args) => {
    if (args.includes("user")) return "alice";
    if (args.some(arg => arg.startsWith("search="))) return JSON.stringify({ data: { viewer: { login: "alice" }, search: { nodes: [], pageInfo: { hasNextPage: false } } } });
    if (!args.includes("graphql")) return "[]";
    const result = JSON.parse(response("alice")); result.data.opened.issueCount = count;
    return JSON.stringify(result);
  });
  const first = await client.get({ ...input, includeActivity: true }); assert.ok(first.ok && first.opened === 1);
  count = 5; await client.get({ ...input, refresh: true });
  const withCachedDetails = await client.get({ ...input, includeActivity: true });
  assert.ok(withCachedDetails.ok && withCachedDetails.opened === 5);
});
