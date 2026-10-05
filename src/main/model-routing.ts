export const APP_MODEL = "pareto-26.10-preview";
export const FALLBACK_MODEL = "pareto";

type Params = Record<string, unknown>;
type Message = { method?: unknown; params?: unknown; [key: string]: unknown };
type Send = (method: string, params: Params) => Promise<unknown>;
type Attempt = {
  params: Params;
  turnId?: string;
  progressed: boolean;
  cancelled: boolean;
  fallback: boolean;
  retry?: Promise<void>;
};
const MODEL_REQUESTS = new Set(["thread/start", "thread/resume", "thread/fork", "turn/start"]);
const record = (value: unknown): Params => value !== null && typeof value === "object" ? value as Params : {};

/** Only service/transport failures qualify, never auth, quota, context, or tool errors. */
export function canFallback(error: unknown): boolean {
  const info = record(error).codexErrorInfo;
  if (info === "serverOverloaded") return true;
  if (info === null || typeof info !== "object") return false;
  for (const name of ["httpConnectionFailed", "responseStreamConnectionFailed", "responseStreamDisconnected", "responseTooManyFailedAttempts"]) {
    if (!(name in info)) continue;
    const status = record(record(info)[name]).httpStatusCode;
    return status === null || status === 404 || status === 408 || status === 500 || status === 502 || status === 503 || status === 504;
  }
  return false;
}

/** Owns model selection at the app's JSON-RPC boundary, including asynchronous turn failures. */
export class ModelRouting {
  private attempts = new Map<string, Attempt>();

  constructor(private send: Send, private emit: (message: Message) => void) {}

  reset(): void {
    this.attempts.clear();
  }

  async request(method: string, params: Params): Promise<unknown> {
    const threadId = typeof params.threadId === "string" ? params.threadId : undefined;
    const active = threadId ? this.attempts.get(threadId) : undefined;
    if (active && method === "turn/interrupt") {
      active.cancelled = true;
      // The failed turn may already be replaced. Interrupt the new turn, not its old id.
      if (active.retry) {
        await active.retry;
        if (!threadId || this.attempts.get(threadId) !== active) return {};
        return this.send(method, { ...params, turnId: active.turnId });
      }
    }
    if (active && (method === "turn/steer" || method === "turn/start")) {
      // New user input supersedes automatic recovery. Never replay over a steer.
      active.progressed = true;
      if (active.retry) {
        await active.retry;
        if (method === "turn/steer" && threadId && this.attempts.get(threadId) === active) {
          params = { ...params, expectedTurnId: active.turnId };
        }
      }
    }
    const selected = MODEL_REQUESTS.has(method) ? { ...params, model: APP_MODEL } : params;
    let attempt: Attempt | undefined;
    if (method === "turn/start" && threadId && !this.attempts.has(threadId)) {
      // Keep settings but not prompt/attachments. The engine already saved the user input.
      const { input: _input, toolOutput: _output, additionalContext: _context, clientUserMessageId: _id, ...settings } = selected;
      attempt = { params: settings, progressed: params.toolOutput !== undefined, cancelled: false, fallback: false };
      this.attempts.set(threadId, attempt);
    }
    try {
      const result = await this.send(method, selected);
      if (attempt && !attempt.fallback && threadId && this.attempts.get(threadId) === attempt) {
        const id = record(record(result).turn).id;
        if (typeof id === "string") attempt.turnId = id;
      }
      return result;
    } catch (error) {
      // RPC rejection (including Compact/busy) is not an upstream model failure.
      if (attempt && threadId && this.attempts.get(threadId) === attempt) this.attempts.delete(threadId);
      throw error;
    }
  }

  serverRequest(params: unknown): void {
    const threadId = record(params).threadId;
    if (typeof threadId === "string") {
      const attempt = this.attempts.get(threadId);
      if (attempt) attempt.progressed = true;
    } else {
      // An unattributed tool/approval request cannot safely be excluded from any active turn.
      for (const attempt of this.attempts.values()) attempt.progressed = true;
    }
  }

  notification(message: Message): void {
    const params = record(message.params);
    const threadId = typeof params.threadId === "string" ? params.threadId : undefined;
    const attempt = threadId ? this.attempts.get(threadId) : undefined;
    const turn = record(params.turn);
    if (attempt && message.method === "turn/started" && typeof turn.id === "string") {
      attempt.turnId = turn.id;
    }
    const matches = attempt && (params.turnId === undefined || params.turnId === attempt.turnId);
    if (matches && typeof message.method === "string" && message.method.startsWith("item/")) {
      const item = record(params.item);
      const userEcho = item.type === "userMessage" || (item.type === "message" && item.role === "user");
      // Even reasoning/partial output is progress; retrying must not discard or duplicate it.
      if (!userEcho) attempt.progressed = true;
    }
    if (attempt && threadId && message.method === "turn/completed" && turn.id === attempt.turnId) {
      if (turn.status === "failed" && !attempt.progressed && !attempt.cancelled && !attempt.fallback && canFallback(turn.error)) {
        attempt.fallback = true;
        attempt.retry = this.retry(threadId, attempt, message);
        return;
      }
      this.attempts.delete(threadId);
    }
    this.emit(message);
  }

  private async retry(threadId: string, attempt: Attempt, failed: Message): Promise<void> {
    // Let the engine retire the completed task before submitting an empty-input continuation.
    await new Promise<void>(resolve => setImmediate(resolve));
    if (this.attempts.get(threadId) !== attempt) return;
    if (attempt.cancelled || attempt.progressed) {
      this.attempts.delete(threadId);
      this.emit(attempt.cancelled ? {
        ...failed, params: { ...record(failed.params), turn: { ...record(record(failed.params).turn), status: "interrupted", error: null } },
      } : failed);
      return;
    }
    try {
      // No user message is added again and all approval/sandbox/effort settings are preserved.
      const result = await this.send("turn/start", { ...attempt.params, input: [], model: FALLBACK_MODEL });
      if (this.attempts.get(threadId) === attempt) {
        const id = record(record(result).turn).id;
        if (typeof id === "string") attempt.turnId = id;
      }
    } catch {
      if (this.attempts.get(threadId) !== attempt) return;
      this.attempts.delete(threadId);
      this.emit(failed);
    }
  }
}
