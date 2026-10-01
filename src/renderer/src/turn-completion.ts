export function settleTurnOutput(
  status: string,
  narrated: boolean,
  produced: boolean,
  priorEmptyStreak: number,
): { empty: boolean; persistent: boolean; emptyStreak: number } {
  if (produced) return { empty: false, persistent: false, emptyStreak: 0 };
  if (status === "failed" || status === "interrupted" || narrated) {
    return { empty: false, persistent: false, emptyStreak: priorEmptyStreak };
  }
  const emptyStreak = priorEmptyStreak + 1;
  return { empty: true, persistent: emptyStreak >= 2, emptyStreak };
}
