type TurnBoundary = { id: string; status: string };
export const SIDE_CHAT_THREAD_SOURCE = "unbiased_side_chat";

export function sideChatInstructions(instructions: string): string {
  return `${instructions}\n\nThis is a side chat. Inherited parent history is background context, not an active task. ` +
    "Follow this side chat's current request; do not continue parent work unless the user explicitly asks.";
}

export function lastFinishedTurnBeforeActive(turns: TurnBoundary[], activeTurnId: string | null): string | null {
  const activeIndex = activeTurnId ? turns.findIndex((turn) => turn.id === activeTurnId) : -1;
  const end = activeIndex >= 0 ? activeIndex : turns.length;
  for (let index = end - 1; index >= 0; index--) {
    const turn = turns[index];
    if (turn.status === "completed" || turn.status === "interrupted" || turn.status === "failed") return turn.id;
  }
  return null;
}

export function sideChatStartTarget(
  parentThreadId: string | null,
  parentRunning: boolean,
  cwd: string,
  lastFinishedTurnId: string | null = null,
): { method: "thread/fork"; params: { threadId: string; ephemeral: false; threadSource: string; excludeTurns: true; lastTurnId?: string } }
  | { method: "thread/start"; params: { cwd: string; ephemeral: false; threadSource: string } } {
  if (parentThreadId && (!parentRunning || lastFinishedTurnId)) {
    return {
      method: "thread/fork",
      params: {
        threadId: parentThreadId,
        ephemeral: false,
        threadSource: SIDE_CHAT_THREAD_SOURCE,
        excludeTurns: true,
        ...(parentRunning ? { lastTurnId: lastFinishedTurnId! } : {}),
      },
    };
  }
  return { method: "thread/start", params: { cwd, ephemeral: false, threadSource: SIDE_CHAT_THREAD_SOURCE } };
}
