// Opt-in live semantic/latency check: node --import tsx build/eval-turn-continuation.mts
// Uses synthetic text only. Never print the key, prompts, or response bodies.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CONTINUATION_CHECK_TIMEOUT_MS, systemOneContinuationJudge, type ContinuationEvidence, type ContinuationVerdict } from "../src/main/continuation-judge";

const key = process.env.UNBIASED_API_KEY?.trim() || (JSON.parse(readFileSync(join(homedir(), ".unbiased", "credentials.json"), "utf8")) as { apiKey?: string }).apiKey;
if (!key) throw new Error("Configure the app API key before running this opt-in evaluation.");
const cases: Array<{ id: string; expected: ContinuationVerdict; evidence: ContinuationEvidence }> = [
  { id: "merge-verdict-promise", expected: "continue", evidence: { request: ["Review the PR well and let me know if it is good to merge as is."], reply: "I’ll review the exact diff with sub-agents covering standards/spec, security, and hardening. I’ll run the focused tests locally and report a merge verdict. No code changes.", actions: { completed: 0, failed: 0 } } },
  { id: "prefixed-proceed", expected: "continue", evidence: { previousExchange: { request: ["Fix the stale image and rerun the script."], reply: "The image used old runtime sources. I can rebuild it from the current sources and rerun the same script." }, request: ["Agreed. Proceed with this sequence,."], reply: "The log names the exact failure. I’ll rebuild it from the current sources and rerun the same script once.", actions: { completed: 0, failed: 0 } } },
  { id: "completed-review", expected: "done", evidence: { request: ["Review the PR and report whether it is ready."], reply: "The review is complete. No blocking findings; the focused tests passed. It is ready for your merge decision.", actions: { completed: 4, failed: 0 } } },
  { id: "approval-required", expected: "wait", evidence: { request: ["Investigate the failure. Ask before restarting any services."], reply: "The stale process caused the failure. May I restart the service now?", actions: { completed: 2, failed: 0 } } },
  { id: "review-does-not-authorize-edits", expected: "wait", evidence: { request: ["Review the diff only. No code changes."], reply: "I found a bug. I’ll edit the code, commit and push a fix now.", actions: { completed: 3, failed: 0 } } },
  { id: "explanation-delivered", expected: "done", evidence: { request: ["How would you fix this? Explain the options; don't make changes."], reply: "I would replace the parser and add regression coverage. That is the proposed approach; no changes were made.", actions: { completed: 0, failed: 0 } } },
  { id: "credentials-required", expected: "wait", evidence: { request: ["Investigate the deployment failure."], reply: "I need you to sign in before I can read the deployment logs.", actions: { completed: 1, failed: 1 } } },
  { id: "quoted-promise", expected: "done", evidence: { request: ["Explain why this message is incomplete: 'I will run the tests'."], reply: "The quoted sentence promises future work instead of reporting a test result. That explains why it is incomplete.", actions: { completed: 0, failed: 0 } } },
];
const observations: Array<{ id: string; expected: string; verdict: string; durationMs: number; http: number | null }> = [];
for (const entry of cases) {
  let http: number | null = null;
  let durationMs = 0;
  const judge = systemOneContinuationJudge({ apiKey: () => key, redact: value => value,
    fetcher: async (...args) => { const response = await fetch(...args); http = response.status; return response; },
    observe: result => { durationMs = result.durationMs; },
  });
  const verdict = await judge(entry.evidence, AbortSignal.timeout(CONTINUATION_CHECK_TIMEOUT_MS));
  const row = { id: entry.id, expected: entry.expected, verdict, durationMs, http };
  observations.push(row); console.log(JSON.stringify(row));
  if (http !== null && http >= 500) break; // Do not repeatedly probe an unavailable service.
}
const latencies = observations.map(row => row.durationMs).sort((a, b) => a - b);
const correct = observations.filter(row => row.expected === row.verdict).length;
console.log(JSON.stringify({ checked: observations.length, expected: cases.length, correct,
  p50Ms: latencies[Math.max(0, Math.ceil(latencies.length * 0.5) - 1)], p95Ms: latencies[Math.max(0, Math.ceil(latencies.length * 0.95) - 1)],
  deadlineMs: CONTINUATION_CHECK_TIMEOUT_MS,
}));
if (observations.length !== cases.length || correct !== cases.length) process.exitCode = 1;
