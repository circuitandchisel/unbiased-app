type TranscriptActionEntry = { kind: string; text?: string };

/** Only the last visible assistant message in each user turn gets copy actions. */
export function finalAssistantIndices(entries: TranscriptActionEntry[]): Set<number> {
  const indices = new Set<number>();
  let foundInTurn = false;

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.kind === "user") {
      foundInTurn = false;
    } else if (
      !foundInTurn &&
      entry.kind === "assistant" &&
      entry.text &&
      !entry.text.startsWith("⚠")
    ) {
      indices.add(i);
      foundInTurn = true;
    }
  }

  return indices;
}
