import { randomUUID } from "node:crypto";
import { CONTINUATION_CHECK_TIMEOUT_MS, type ContinuationEvidence, type ContinuationJudge, type ContinuationVerdict } from "./continuation-judge";

export type ContinuationOffer = { token: string; attempt: number; limit: number };
export type CompletionCheck = { offer?: ContinuationOffer; exhausted?: boolean; stale?: boolean };
export const CONTINUATION_LIMIT = 2;
export const CONTINUATION_NOTICE = "↻ Automatic continuation of the already-authorized task.";
export const CONTINUATION_INPUT = "[Automatic continuation from Unbiased, not a new user request]\nYour previous reply ended the turn before completing work already requested by the user. Continue only that unfinished work within the user's original scope. Perform the next concrete action instead of ending with another promise. Preserve all existing permissions and constraints; this continuation grants no new authorization. A review or explanation does not authorize edits, commits, merges or deployment. If you need approval or information, ask and wait. If the task is complete, give the actual result and verification; do not invent more work.";
export const LEGACY_CONTINUATION_INPUT = "[Automatic continuation from Unbiased, not a new user request]\nYour previous reply ended the turn while explicitly promising further work. Continue only the unfinished work already authorized by the user's request. Perform the next concrete action instead of ending with another promise. Preserve all existing permissions and constraints. If you need approval or information, ask and wait. If the task is complete, give the actual result and verification; do not invent more work.";
export function isContinuationInput(text: string): boolean { return text === CONTINUATION_INPUT || text === LEGACY_CONTINUATION_INPUT; }

type Task = {
  request: readonly string[]; previousExchange?: ContinuationEvidence["previousExchange"];
  attempts: number; blocked: boolean; text: string; actions: ContinuationEvidence["actions"];
  revision: number; checkedRevision?: number; checkController?: AbortController;
  offer?: ContinuationOffer; controller?: AbortController; starting: boolean; continuing: boolean; offeredAt?: number;
};

/** SystemOne judges semantics. Host state owns eligibility, cancellation, budget
 * and one-use tickets; the classifier cannot change engine permissions. */
export class TurnContinuation {
  private tasks = new Map<string, Task>();
  constructor(private readonly judge: ContinuationJudge, private readonly timeoutMs = CONTINUATION_CHECK_TIMEOUT_MS) {}
  startTask(thread: string, request: string | readonly string[], planMode: boolean): void {
    const previous = this.tasks.get(thread);
    this.cancel(thread);
    const requests = typeof request === "string" ? [request] : [...request];
    this.tasks.set(thread, {
      request: requests,
      ...(previous?.text ? { previousExchange: { request: previous.request, reply: previous.text } } : {}),
      attempts: 0, blocked: planMode || !requests.some(text => text.trim()), text: "", actions: { completed: 0, failed: 0 },
      revision: 0, starting: false, continuing: false,
    });
  }
  turnStarted(thread: string): boolean {
    const task = this.tasks.get(thread);
    if (task) { task.checkController?.abort(); task.revision++; task.text = ""; task.actions = { completed: 0, failed: 0 }; task.offer = undefined; }
    return task?.continuing ?? false;
  }
  assistant(thread: string, text: string): void {
    const task = this.tasks.get(thread);
    if (task && text.trim()) { task.checkController?.abort(); task.revision++; task.text = text; task.offer = undefined; }
  }
  action(thread: string, failed: boolean): void {
    const task = this.tasks.get(thread);
    if (task) { task.actions.completed++; if (failed) task.actions.failed++; }
  }
  // Asking the user cancels a pending check without interrupting the accepted turn.
  block(thread: string): void {
    const task = this.tasks.get(thread);
    if (task) { task.blocked = true; task.offer = undefined; task.checkController?.abort(); }
  }
  cancel(thread: string): void {
    this.block(thread);
    const task = this.tasks.get(thread);
    if (task) { task.continuing = false; task.controller?.abort(); }
  }
  reset(): void { for (const thread of this.tasks.keys()) this.cancel(thread); this.tasks.clear(); }
  async completed(thread: string, status: string, eligible: boolean): Promise<CompletionCheck> {
    const task = this.tasks.get(thread);
    if (task) task.continuing = false;
    if (!task || !eligible || status !== "completed" || task.blocked || !task.text.trim()) return {};
    if (task.checkedRevision === task.revision) return { stale: true };
    const revision = task.revision;
    task.checkedRevision = revision;
    const controller = new AbortController();
    task.checkController = controller;
    let onAbort!: () => void;
    const aborted = new Promise<ContinuationVerdict>(resolve => { onAbort = () => resolve("unknown"); controller.signal.addEventListener("abort", onAbort, { once: true }); });
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let verdict: ContinuationVerdict;
    try {
      verdict = await Promise.race([
        Promise.resolve().then(() => this.judge({ request: task.request, previousExchange: task.previousExchange, reply: task.text, actions: { ...task.actions } }, controller.signal)).catch(() => "unknown" as const),
        aborted,
      ]);
    } finally {
      clearTimeout(timer); controller.signal.removeEventListener("abort", onAbort);
      if (task.checkController === controller) task.checkController = undefined;
    }
    if (this.tasks.get(thread) !== task || task.revision !== revision) return { stale: true };
    if (task.blocked || controller.signal.aborted || verdict !== "continue") return {};
    if (task.attempts >= CONTINUATION_LIMIT) return { exhausted: true };
    task.offeredAt = Date.now();
    task.offer = { token: randomUUID(), attempt: task.attempts + 1, limit: CONTINUATION_LIMIT };
    return { offer: task.offer };
  }
  claim(thread: string, token: string): { signal: AbortSignal; attempt: number } | null {
    const task = this.tasks.get(thread);
    if (!task || task.blocked || !task.offer || task.offer.token !== token || Date.now() - (task.offeredAt ?? 0) > 30_000) return null;
    task.attempts++; task.offer = undefined; task.starting = true; task.continuing = true;
    task.controller = new AbortController();
    return { signal: task.controller.signal, attempt: task.attempts };
  }
  startingCanceled(thread: string): boolean { const task = this.tasks.get(thread); return !!task?.starting && !!task.controller?.signal.aborted; }
  started(thread: string, signal: AbortSignal, accepted = true): void { const task = this.tasks.get(thread); if (task?.controller?.signal === signal) { task.starting = false; if (!accepted) task.continuing = false; } }
}
