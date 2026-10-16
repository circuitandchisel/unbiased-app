export type VisualTimingPhase = "unobserved" | "output" | "tool";

export type VisualTimingRecord = {
  at: string;
  threadId: string;
  turnId: string;
  elapsedMs: number;
} & (
  | { kind: "interval"; phase: VisualTimingPhase; ms: number; fromMs: number; after: string; until: string }
  | { kind: "tool-start"; tool: string; callId: string }
  | { kind: "tool-end"; tool: string; callId: string; ms: number; ok: boolean }
  | { kind: "milestone"; name: string }
  | { kind: "tool-result-sent"; tool: string }
  | { kind: "engine-event-after-tool"; event: string; sinceToolResultMs: number; tool: string }
  | { kind: "output-chunk"; timing: "first" | "gap"; sincePreviousMs: number; chars: number }
  | { kind: "heartbeat"; phase: VisualTimingPhase; msSincePhaseStart: number; after: string; activeTools: string[] }
  | { kind: "summary"; status: string; totalMs: number; unobservedMs: number; outputMs: number;
      toolWallMs: number; toolCallMs: number; toolCalls: number; unfinishedTools: number;
      firstDraftMs: number | null; firstPreviewMs: number | null; committedMs: number | null;
      longestUnobservedMs: number; longestUnobservedAfter: string | null; longestUnobservedUntil: string | null;
      droppedEvents: number }
);

type TimingPayload = VisualTimingRecord extends infer R
  ? R extends { kind: string } ? Omit<R, "at" | "threadId" | "turnId" | "elapsedMs"> : never
  : never;

type ToolSpan = { tool: string; startedAt: number };
type Turn = {
  threadId: string;
  turnId: string;
  startedAt: number;
  wallStartedAt: number;
  phase: VisualTimingPhase;
  phaseStartedAt: number;
  after: string;
  visual: boolean;
  buffered: VisualTimingRecord[];
  droppedEvents: number;
  tools: Map<string, ToolSpan>;
  totals: Record<VisualTimingPhase, number>;
  toolCallMs: number;
  toolCalls: number;
  firstDraftMs: number | null;
  firstPreviewMs: number | null;
  committedMs: number | null;
  longestUnobservedMs: number;
  longestUnobservedAfter: string | null;
  longestUnobservedUntil: string | null;
  lastToolResultAt: number | null;
  lastToolResultTool: string | null;
  lastOutputAt: number | null;
  outputAnchorAt: number | null;
};

const MAX_BUFFERED_EVENTS = 512;

function safeName(value: string): string {
  return /^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/.test(value) ? value : "other";
}

function safeCallId(value: string): string {
  return /^[a-zA-Z0-9:_-]{1,100}$/.test(value) ? value : "other";
}

/** App-observed wall time, not a claim about the model's private reasoning or provider queue. */
export class VisualTurnTiming {
  private turns = new Map<string, Turn>();

  constructor(
    private readonly write: (record: VisualTimingRecord) => void,
    private readonly now: () => number = () => performance.now(),
    private readonly wallNow: () => number = () => Date.now(),
  ) {}

  start(threadId: string, turnId: string): void {
    const now = this.now();
    this.turns.set(threadId, {
      threadId, turnId, startedAt: now, wallStartedAt: this.wallNow(),
      phase: "unobserved", phaseStartedAt: now, after: "turn_started",
      visual: false, buffered: [], droppedEvents: 0, tools: new Map(),
      totals: { unobserved: 0, output: 0, tool: 0 }, toolCallMs: 0, toolCalls: 0,
      firstDraftMs: null, firstPreviewMs: null, committedMs: null,
      longestUnobservedMs: 0, longestUnobservedAfter: null, longestUnobservedUntil: null,
      lastToolResultAt: null, lastToolResultTool: null, lastOutputAt: null,
      outputAnchorAt: null,
    });
  }

  private record(turn: Turn, record: TimingPayload, now: number): void {
    const elapsedMs = Math.max(0, Math.round(now - turn.startedAt));
    const entry = {
      at: new Date(turn.wallStartedAt + elapsedMs).toISOString(),
      threadId: turn.threadId, turnId: turn.turnId, elapsedMs, ...record,
    } as VisualTimingRecord;
    if (turn.visual) this.write(entry);
    else if (turn.buffered.length < MAX_BUFFERED_EVENTS) turn.buffered.push(entry);
    else turn.droppedEvents += 1;
  }

  private transition(turn: Turn, phase: VisualTimingPhase, until: string, now: number): void {
    const ms = Math.max(0, Math.round(now - turn.startedAt) - Math.round(turn.phaseStartedAt - turn.startedAt));
    turn.totals[turn.phase] += ms;
    if (turn.phase === "unobserved" && ms > turn.longestUnobservedMs) {
      turn.longestUnobservedMs = ms;
      turn.longestUnobservedAfter = turn.after;
      turn.longestUnobservedUntil = until;
    }
    if (ms > 0) {
      this.record(turn, { kind: "interval", phase: turn.phase, ms,
        fromMs: Math.max(0, Math.round(turn.phaseStartedAt - turn.startedAt)),
        after: turn.after, until }, now);
    }
    turn.phase = phase;
    turn.phaseStartedAt = now;
    turn.after = until;
  }

  outputStarted(threadId: string): void {
    const turn = this.turns.get(threadId);
    if (!turn || turn.tools.size || turn.phase === "output") return;
    this.transition(turn, "output", "assistant_output_started", this.now());
  }

  toolResultSent(threadId: string, tool: string): void {
    const turn = this.turns.get(threadId);
    if (!turn) return;
    const now = this.now();
    turn.lastToolResultAt = now;
    turn.lastToolResultTool = safeName(tool);
    turn.lastOutputAt = null;
    turn.outputAnchorAt = now;
    this.record(turn, { kind: "tool-result-sent", tool: turn.lastToolResultTool }, now);
  }

  engineEvent(threadId: string, method: string): void {
    const turn = this.turns.get(threadId);
    if (!turn || turn.lastToolResultAt === null) return;
    const now = this.now();
    const event = method === "item/agentMessage/delta" ? "agent_message_delta"
      : method === "item/reasoning/textDelta" ? "reasoning_delta"
      : method === "item/started" ? "item_started"
      : method === "item/completed" ? "item_completed"
      : method === "turn/completed" ? "turn_completed" : "other";
    this.record(turn, { kind: "engine-event-after-tool", event,
      sinceToolResultMs: Math.max(0, Math.round(now - turn.lastToolResultAt)),
      tool: turn.lastToolResultTool ?? "other" }, now);
    turn.lastToolResultAt = null;
    turn.lastToolResultTool = null;
  }

  outputChunk(threadId: string, chars: number): void {
    const turn = this.turns.get(threadId);
    if (!turn || chars <= 0) return;
    const now = this.now();
    const previous = turn.lastOutputAt;
    const sincePreviousMs = previous === null
      ? Math.max(0, Math.round(now - (turn.outputAnchorAt ?? turn.phaseStartedAt)))
      : Math.max(0, Math.round(now - previous));
    if (previous === null || sincePreviousMs >= 5_000) {
      this.record(turn, { kind: "output-chunk", timing: previous === null ? "first" : "gap",
        sincePreviousMs, chars: Math.min(chars, 1_000_000) }, now);
    }
    turn.lastOutputAt = now;
    turn.outputAnchorAt = null;
  }

  messageCompleted(threadId: string): void {
    const turn = this.turns.get(threadId);
    if (!turn || turn.tools.size) return;
    this.transition(turn, "unobserved", "assistant_message_completed", this.now());
  }

  toolStarted(threadId: string, callId: string, tool: string): void {
    const turn = this.turns.get(threadId);
    if (!turn || turn.tools.has(callId)) return;
    const now = this.now();
    const name = safeName(tool);
    if (turn.tools.size === 0) this.transition(turn, "tool", `tool:${name}:started`, now);
    turn.tools.set(callId, { tool: name, startedAt: now });
    this.record(turn, { kind: "tool-start", tool: name, callId: safeCallId(callId) }, now);
  }

  toolCompleted(threadId: string, callId: string, ok: boolean): void {
    const turn = this.turns.get(threadId);
    const span = turn?.tools.get(callId);
    if (!turn || !span) return;
    const now = this.now();
    const ms = Math.max(0, Math.round(now - span.startedAt));
    turn.toolCallMs += ms;
    turn.toolCalls += 1;
    turn.tools.delete(callId);
    this.record(turn, { kind: "tool-end", tool: span.tool, callId: safeCallId(callId), ms, ok }, now);
    if (turn.tools.size === 0) this.transition(turn, "unobserved", `tool:${span.tool}:completed`, now);
  }

  milestone(threadId: string, name: "visual_requested" | "draft_staged" | "preview_ready" | "visual_committed"): void {
    const turn = this.turns.get(threadId);
    if (!turn) return;
    const now = this.now();
    const elapsedMs = Math.max(0, Math.round(now - turn.startedAt));
    if (!turn.visual) {
      turn.visual = true;
      for (const event of turn.buffered) this.write(event);
      turn.buffered = [];
    }
    if (name === "draft_staged" && turn.firstDraftMs === null) turn.firstDraftMs = elapsedMs;
    if (name === "preview_ready" && turn.firstPreviewMs === null) turn.firstPreviewMs = elapsedMs;
    if (name === "visual_committed") turn.committedMs = elapsedMs;
    this.record(turn, { kind: "milestone", name }, now);
  }

  heartbeat(): void {
    const now = this.now();
    for (const turn of this.turns.values()) {
      if (!turn.visual) continue;
      this.record(turn, { kind: "heartbeat", phase: turn.phase,
        msSincePhaseStart: Math.max(0, Math.round(now - turn.phaseStartedAt)),
        after: turn.after, activeTools: [...turn.tools.values()].map((span) => span.tool) }, now);
    }
  }

  complete(threadId: string, status: string): void {
    const turn = this.turns.get(threadId);
    if (!turn) return;
    const now = this.now();
    this.transition(turn, turn.phase, "turn_completed", now);
    if (turn.visual) {
      this.record(turn, { kind: "summary", status: safeName(status),
        totalMs: Math.max(0, Math.round(now - turn.startedAt)),
        unobservedMs: turn.totals.unobserved, outputMs: turn.totals.output,
        toolWallMs: turn.totals.tool, toolCallMs: turn.toolCallMs,
        toolCalls: turn.toolCalls, unfinishedTools: turn.tools.size,
        firstDraftMs: turn.firstDraftMs, firstPreviewMs: turn.firstPreviewMs,
        committedMs: turn.committedMs,
        longestUnobservedMs: turn.longestUnobservedMs,
        longestUnobservedAfter: turn.longestUnobservedAfter,
        longestUnobservedUntil: turn.longestUnobservedUntil,
        droppedEvents: turn.droppedEvents }, now);
    }
    this.turns.delete(threadId);
  }
}
