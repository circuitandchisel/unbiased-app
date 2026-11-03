/** A composer-local snapshot: navigating never loses the draft being written. */
export class PromptHistory {
  private prompts: string[] | null = null;
  private index = 0;
  private draft = "";
  get active(): boolean { return this.prompts !== null; }
  reset(): void { this.prompts = null; }
  navigate(direction: "up" | "down", prompts: string[], draft: string): string | null {
    if (!this.prompts) {
      if (direction === "down" || !prompts.length) return null;
      this.prompts = [...prompts]; this.index = prompts.length; this.draft = draft;
    }
    this.index = Math.max(0, Math.min(this.prompts.length, this.index + (direction === "up" ? -1 : 1)));
    if (this.index === this.prompts.length) { const original = this.draft; this.reset(); return original; }
    return this.prompts[this.index];
  }
}
