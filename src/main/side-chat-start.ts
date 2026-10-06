type TurnBoundary = { id: string; status: string };

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
): { method: "thread/fork"; params: { threadId: string; ephemeral: true; excludeTurns: true; lastTurnId?: string } }
  | { method: "thread/start"; params: { cwd: string; ephemeral: true } } {
  if (parentThreadId && (!parentRunning || lastFinishedTurnId)) {
    return {
      method: "thread/fork",
      params: {
        threadId: parentThreadId,
        ephemeral: true,
        excludeTurns: true,
        ...(parentRunning ? { lastTurnId: lastFinishedTurnId! } : {}),
      },
    };
  }
  return { method: "thread/start", params: { cwd, ephemeral: true } };
}
