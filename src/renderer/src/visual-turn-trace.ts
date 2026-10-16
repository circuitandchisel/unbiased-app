import { visualOutputType } from "./assistant-visual-markdown";

type TranscriptEntry = { kind: string; text?: string };

export function lastUserIndex(entries: readonly TranscriptEntry[]): number {
  for (let index = entries.length - 1; index >= 0; index--) {
    if (entries[index].kind === "user") return index;
  }
  return -1;
}

export function finalAssistantForTurn(entries: readonly TranscriptEntry[]): { index: number; text: string } | null {
  const lastUser = lastUserIndex(entries);
  for (let index = entries.length - 1; index > lastUser; index--) {
    const entry = entries[index];
    if (entry.kind === "assistant" && entry.text?.trim()) return { index, text: entry.text };
  }
  return null;
}

export function outputSignature(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  }
  return `${text.length}:${hash >>> 0}`;
}

export function completedVisualOutput(entries: readonly TranscriptEntry[]): { type: string; signature: string | null } {
  const answer = finalAssistantForTurn(entries);
  return answer
    ? { type: visualOutputType(answer.text), signature: outputSignature(answer.text) }
    : { type: "none", signature: null };
}

export function visualReadyElapsed(
  info: { turnId?: string | null; startedAt: number; totalMs: number | null; outputType: string | null; outputSignature: string | null; visualReadyMs: number | null },
  turnId: string,
  signature: string,
  observedAt: number,
): number | null {
  if (info.turnId !== turnId || info.totalMs === null || info.visualReadyMs !== null ||
      info.outputSignature !== signature || !["openui", "visual-html"].includes(info.outputType ?? "")) return null;
  const completedAt = info.startedAt + info.totalMs;
  if (observedAt < completedAt || observedAt - completedAt > 10_000) return null;
  return observedAt - info.startedAt;
}
