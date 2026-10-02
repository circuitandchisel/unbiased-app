export function isTranscriptAtBottom(scroll: { scrollHeight: number; scrollTop: number; clientHeight: number }): boolean {
  return scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop <= 2;
}
