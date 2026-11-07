export type ConversationStatus = "running" | "idle" | "waiting" | "failed" | "interrupted";
export type ConversationContext = {
  goal: string; currentFocus: string; progress: string[]; decisions: string[]; pending: string[]; blockers: string[];
};
export type ConversationMetadata = {
  version: 1; threadId: string; revision: number; status: ConversationStatus; title: string; project: string | null;
  completedTurns: number; summarizedTurns: number; pendingTurnIds: string[]; seenTurnIds: string[];
  lastCompletedTurnId: string | null; lastSummarizedTurnId: string | null; updatedAt: number; summarizedAt: number | null;
  context: ConversationContext | null; baselineTurnId?: string | null; unavailableTurnIds?: string[]; evidenceTurnIds: string[]; coverage: "complete" | "partial";
};
