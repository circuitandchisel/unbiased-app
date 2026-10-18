import { test } from "node:test";
import assert from "node:assert/strict";
import { delegationProxyOrigin, isDelegationProxyUrl, parseDelegationFile } from "./delegation";

test("accepts loopback /v1 URLs only", () => {
  for (const ok of ["http://127.0.0.1:4040/v1", "http://127.0.0.1:4040/v1/", "http://localhost/v1", "https://[::1]:4040/v1", " http://127.0.0.1:4040/v1 "]) assert.equal(isDelegationProxyUrl(ok), true, ok);
  for (const bad of ["http://127.0.0.1.evil.com/v1", "http://10.0.0.5:4040/v1", "http://127.0.0.1:4040/", "http://127.0.0.1:4040/v2", "http://127.0.0.1:4040/v1/responses", "ftp://127.0.0.1/v1", "", "127.0.0.1:4040/v1"]) assert.equal(isDelegationProxyUrl(bad), false, bad);
});

test("reads the stored URL and rejects a missing, malformed or non-loopback file", () => {
  assert.equal(parseDelegationFile(JSON.stringify({ proxyUrl: "http://127.0.0.1:4040/v1" })), "http://127.0.0.1:4040/v1");
  assert.equal(parseDelegationFile(JSON.stringify({ proxyUrl: " http://localhost:4040/v1/ " })), "http://localhost:4040/v1/");
  assert.equal(parseDelegationFile(null), null);
  assert.equal(parseDelegationFile("not json"), null);
  assert.equal(parseDelegationFile(JSON.stringify({})), null);
  assert.equal(parseDelegationFile(JSON.stringify({ proxyUrl: 42 })), null);
  assert.equal(parseDelegationFile(JSON.stringify({ proxyUrl: "http://10.0.0.5:4040/v1" })), null);
});

test("the proxy's own routes are reached at the origin beside /v1", () => {
  assert.equal(delegationProxyOrigin("http://127.0.0.1:4040/v1"), "http://127.0.0.1:4040");
  assert.equal(delegationProxyOrigin("http://127.0.0.1:4040/v1/"), "http://127.0.0.1:4040");
});
