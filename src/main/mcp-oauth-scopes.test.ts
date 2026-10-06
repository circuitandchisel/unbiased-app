import assert from "node:assert/strict";
import { test } from "node:test";
import { inferredOAuthScopes, protectedResourceScopes } from "./mcp-oauth-scopes";

test("uses the MCP resource's scopes without requesting every authorization-server scope", () => {
  const advertised = protectedResourceScopes({
    scopes_supported: ["files:read", "offline_access"],
  });
  assert.deepEqual(inferredOAuthScopes(undefined, advertised), ["files:read", "offline_access"]);
  assert.ok(!advertised.includes("public_metadata"));
});

test("does not forbid a scope when the MCP resource advertises it", () => {
  const advertised = protectedResourceScopes({ scopes_supported: ["files:read", "public_metadata"] });
  assert.deepEqual(inferredOAuthScopes(undefined, advertised), ["files:read", "public_metadata"]);
});

test("preserves explicit scopes and leaves missing metadata alone", () => {
  const advertised = protectedResourceScopes({ scopes_supported: ["read", "read", "bad scope", 4] });
  assert.deepEqual(advertised, ["read"]);
  assert.equal(inferredOAuthScopes(["custom"], advertised), undefined);
  assert.equal(inferredOAuthScopes(undefined, []), undefined);
  assert.deepEqual(protectedResourceScopes(null), []);
});
