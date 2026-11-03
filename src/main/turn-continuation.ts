import { randomUUID } from "node:crypto";

export type ContinuationOffer = { token: string; attempt: number; limit: number };
export type CompletionCheck = { offer?: ContinuationOffer; exhausted?: boolean };
export const CONTINUATION_LIMIT = 2;
export const CONTINUATION_NOTICE = "↻ Automatic continuation of the already-authorized task.";
export const CONTINUATION_INPUT = "[Automatic continuation from Unbiased, not a new user request]\nYour previous reply ended the turn while explicitly promising further work. Continue only the unfinished work already authorized by the user's request. Perform the next concrete action instead of ending with another promise. Preserve all existing permissions and constraints. If you need approval or information, ask and wait. If the task is complete, give the actual result and verification; do not invent more work.";

/** Deliberately narrow: a question, quoted instructions or vague assent is not action authorization. */
export function requestsAction(text: string): boolean {
  return /^(?:(?:please\s+)?(?:proceed|continue|go ahead|fix|implement|build|run|test|check|review|update|add|remove|resolve|prepare|create|change|launch|relaunch|address|investigate|debug)\b|(?:can|could|would|will) you (?:please )?(?:fix|implement|build|run|test|check|review|update|add|remove|resolve|prepare|create|change|launch|address|investigate|debug)\b)/i.test(text.trim());
}
export function promisesFurtherAction(text: string): boolean {
  if (!text.trim() || text.length > 3000) return false;
  const prose = text.replace(/```[\s\S]*?```/g, "").split("\n").filter(line => !/^\s*>/.test(line)).join("\n");
  if (/[?？]/.test(prose) || /\b(?:awaiting|waiting for|blocked|need (?:you|your)|require (?:your|user)|approv(?:al|e|ed)|permission|confirm(?:ation)?|clarif\w*|sign[ -]?in|log[ -]?in|captcha|2fa|password|merge|deploy|publish|purchase|payment|if you|when you|once you|after you|with you|your (?:input|answer|decision|choice)|optional|tomorrow|later|next time|do not proceed)\b/i.test(prose)) return false;
  return /(?:^|[.!]\s+|\n)(?:now\s+|next,?\s+)?(?:i['’]ll|i will|let me|i (?:just )?need to|i am going to)\s*(?::\s*(?:\d+[.)]\s*)?)?(?:run|build|rebuild|test|fix|implement|update|add|remove|resolve|check|verify|inspect|read|commit|push|raise|create|stage|finish|complete|continue)\b/i.test(prose);
}

type Task = { authorized: boolean; readOnly: boolean; attempts: number; blocked: boolean; text: string; offer?: ContinuationOffer; controller?: AbortController; starting: boolean; offeredAt?: number };
/** Owns retry budget and one-use tickets in the host; the renderer cannot manufacture authorization. */
export class TurnContinuation {
  private tasks = new Map<string, Task>();
  startTask(thread: string, request: string, planMode: boolean): void {
    this.cancel(thread);
    this.tasks.set(thread, { authorized: !planMode && requestsAction(request), readOnly: /^(?:(?:please\s+)?|(?:can|could|would|will) you (?:please )?)(?:review|check|inspect|investigate|explain)\b/i.test(request.trim()), attempts: 0, blocked: false, text: "", starting: false });
  }
  turnStarted(thread: string): void { const task = this.tasks.get(thread); if (task) task.text = ""; }
  assistant(thread: string, text: string): void { const task = this.tasks.get(thread); if (task && text.trim()) task.text = text; }
  block(thread: string): void { const task = this.tasks.get(thread); if (task) { task.blocked = true; task.offer = undefined; task.controller?.abort(); } }
  cancel(thread: string): void { this.block(thread); }
  reset(): void { for (const thread of this.tasks.keys()) this.cancel(thread); this.tasks.clear(); }
  completed(thread: string, status: string, eligible: boolean): CompletionCheck {
    const task = this.tasks.get(thread);
    if (!task || !eligible || status !== "completed" || !task.authorized || task.blocked || !promisesFurtherAction(task.text)) return {};
    if (task.readOnly && /\b(?:fix|implement|update|add|remove|resolve|commit|push|raise|create|stage|deploy|publish|merge)\b/i.test(task.text)) return {};
    if (task.attempts >= CONTINUATION_LIMIT) return { exhausted: true };
    task.offeredAt = Date.now();
    task.offer = { token: randomUUID(), attempt: task.attempts + 1, limit: CONTINUATION_LIMIT };
    return { offer: task.offer };
  }
  claim(thread: string, token: string): { signal: AbortSignal; attempt: number } | null {
    const task = this.tasks.get(thread);
    if (!task || task.blocked || !task.offer || task.offer.token !== token || Date.now() - (task.offeredAt ?? 0) > 30_000) return null;
    task.attempts++; task.offer = undefined; task.starting = true;
    task.controller = new AbortController();
    return { signal: task.controller.signal, attempt: task.attempts };
  }
  startingCanceled(thread: string): boolean { const task = this.tasks.get(thread); return !!task?.starting && !!task.controller?.signal.aborted; }
  started(thread: string, signal: AbortSignal): void { const task = this.tasks.get(thread); if (task?.controller?.signal === signal) task.starting = false; }
}
