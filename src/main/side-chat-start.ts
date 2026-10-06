export function sideChatStartTarget(
  parentThreadId: string | null,
  parentRunning: boolean,
  cwd: string,
): { method: "thread/fork"; params: { threadId: string; ephemeral: true; excludeTurns: true } }
  | { method: "thread/start"; params: { cwd: string; ephemeral: true } } {
  if (parentThreadId && !parentRunning) {
    return { method: "thread/fork", params: { threadId: parentThreadId, ephemeral: true, excludeTurns: true } };
  }
  return { method: "thread/start", params: { cwd, ephemeral: true } };
}
