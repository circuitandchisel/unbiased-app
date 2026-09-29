export type ConversationDraft<Attachment> = {
  text: string;
  attachments: Attachment[];
};

export class ConversationDrafts<Attachment> {
  private drafts = new Map<string, ConversationDraft<Attachment>>();
  private key: string;
  private threadId: string | null;
  private resetNonce: number;

  constructor(threadId: string | null, resetNonce: number) {
    this.threadId = threadId;
    this.resetNonce = resetNonce;
    this.key = this.draftKey(threadId, resetNonce);
  }

  private draftKey(threadId: string | null, resetNonce: number): string {
    return threadId === null ? `new:${resetNonce}` : `thread:${threadId}`;
  }

  current(): ConversationDraft<Attachment> {
    return this.drafts.get(this.key) ?? { text: "", attachments: [] };
  }

  identity(): string {
    return this.key;
  }

  private save(key: string, draft: ConversationDraft<Attachment>): void {
    if (draft.text || draft.attachments.length > 0) this.drafts.set(key, draft);
    else this.drafts.delete(key);
  }

  setText(text: string): void {
    this.save(this.key, { ...this.current(), text });
  }

  updateAttachments(
    key: string,
    update: Attachment[] | ((current: Attachment[]) => Attachment[]),
  ): Attachment[] | null {
    const draft = this.drafts.get(key) ?? { text: "", attachments: [] };
    const attachments = typeof update === "function" ? update(draft.attachments) : update;
    this.save(key, { ...draft, attachments });
    return key === this.key ? attachments : null;
  }

  deleteThread(threadId: string): void {
    this.drafts.delete(this.draftKey(threadId, this.resetNonce));
  }

  transition(threadId: string | null, resetNonce: number): ConversationDraft<Attachment> | null {
    const nextKey = this.draftKey(threadId, resetNonce);
    if (nextKey === this.key) return null;

    // The first send gives a new chat its permanent thread id. It is still
    // the same composer, including anything typed while that send was pending.
    if (this.threadId === null && threadId !== null && resetNonce === this.resetNonce) {
      const draft = this.current();
      this.drafts.delete(this.key);
      if (draft.text || draft.attachments.length > 0) this.drafts.set(nextKey, draft);
    }

    this.threadId = threadId;
    this.resetNonce = resetNonce;
    this.key = nextKey;
    return this.current();
  }
}
