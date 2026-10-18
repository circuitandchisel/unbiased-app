import { test } from "node:test";
import assert from "node:assert/strict";
import { delegationSignInOffered, delegationSignInResultText, delegationStatusText, type DelegationStatus } from "./delegation-status";

const plan = (over: Partial<Extract<DelegationStatus, { reachable: true }>> = {}): DelegationStatus => ({ reachable: true, provider: "openai", cred: "plan", declared: true, ...over });
const withdrawn = (reason: "limit" | "signin" | "refused" | "ineligible", cred: "plan" | "key" = "plan") =>
  plan({ cred, declared: false, withdrawn: { reason, since: "2026-10-05T17:00:00.000Z", until: "2026-10-05T18:00:00.000Z" } });

test("declared, unreachable, and each withdrawal reason read right for a plan and for a key", () => {
  assert.equal(delegationStatusText({ reachable: false }), "The proxy is not reachable; Pareto answers on its own.");
  assert.equal(delegationStatusText(plan()), "Frontier escalations run on your ChatGPT plan.");
  assert.equal(delegationStatusText(plan({ cred: "key" })), "Frontier escalations run on your OpenAI API key.");
  assert.match(delegationStatusText(withdrawn("limit")), /usage limit was reached; Pareto answers on its own until /);
  assert.equal(delegationStatusText(withdrawn("signin")), "Your ChatGPT sign-in lapsed; Pareto answers on its own until you sign in again.");
  assert.equal(delegationStatusText(plan({ declared: false, withdrawn: { reason: "signin", since: "", until: "" }, signIn: { pending: true } })), "Waiting for the ChatGPT sign-in in your browser…");
  assert.match(delegationStatusText(withdrawn("signin", "key")), /API key was refused/);   // a key never has a sign-in to redo, whatever the proxy says
  assert.match(delegationStatusText(withdrawn("refused", "key")), /API key was refused/);
  assert.match(delegationStatusText(withdrawn("ineligible")), /not available to this app/);
  assert.equal(delegationStatusText(plan({ declared: false })), "Pareto answers on its own.");
});

test("the sign-in button is offered only for a lapsed plan sign-in with nothing pending", () => {
  assert.equal(delegationSignInOffered(withdrawn("signin")), true);
  assert.equal(delegationSignInOffered(withdrawn("signin", "key")), false);
  assert.equal(delegationSignInOffered(withdrawn("refused", "key")), false);
  assert.equal(delegationSignInOffered(withdrawn("ineligible")), false);
  assert.equal(delegationSignInOffered(plan({ declared: false, withdrawn: { reason: "signin", since: "", until: "" }, signIn: { pending: true } })), false);
  assert.equal(delegationSignInOffered({ reachable: false }), false);
});

test("the proxy's answer to a sign-in request is shown, not dropped", () => {
  assert.match(delegationSignInResultText("started")!, /Opening your browser/);
  assert.match(delegationSignInResultText("pending")!, /already waiting/);
  assert.match(delegationSignInResultText("suppressed")!, /offered recently/);
  assert.match(delegationSignInResultText("unreachable")!, /did not answer/);
  assert.equal(delegationSignInResultText("???"), null);
});
