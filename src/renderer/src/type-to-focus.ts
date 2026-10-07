const EDITABLE_OR_OVERLAY =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="dialog"], [role="menu"], [role="listbox"], [data-popover]';

export function isComposerTypingKey(
  event: Pick<KeyboardEvent, "key" | "defaultPrevented" | "isComposing" | "metaKey" | "ctrlKey" | "altKey">,
  target: Element | null,
): boolean {
  return !event.defaultPrevented && !event.isComposing &&
    !event.metaKey && !event.ctrlKey && !event.altKey &&
    event.key.length === 1 && event.key !== " " &&
    !target?.closest(EDITABLE_OR_OVERLAY);
}
