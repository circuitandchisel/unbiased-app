import type { ApprovedVisual } from "../shared/visual-delivery";
import type { VisualReviewBrief } from "./visual-review";

export type VisualPreviewCandidate = {
  turnId: string | null;
  previewId: string;
  visual: ApprovedVisual;
  review: VisualReviewBrief;
  committed: boolean;
};

export class VisualPreviewCandidates {
  private readonly candidates = new Map<string, VisualPreviewCandidate>();

  get(threadId: string, turnId: string | null): VisualPreviewCandidate | undefined {
    const candidate = this.candidates.get(threadId);
    return candidate?.turnId === turnId ? candidate : undefined;
  }

  accept(threadId: string, candidate: VisualPreviewCandidate): void {
    this.candidates.set(threadId, candidate);
  }

  clear(threadId: string): void {
    this.candidates.delete(threadId);
  }
}
