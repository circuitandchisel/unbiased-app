import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { commandKey, commandMatches, commandToken, PLAN_COMMAND, type SlashCommand } from "../../shared/slash-commands";

export function useSlashCommands({ paneId, contextKey, connected, draft, changeDraft, togglePlan, focus }: {
  paneId: string; contextKey: string; connected: boolean; draft: string;
  changeDraft: (text: string) => void; togglePlan: () => void; focus: () => void;
}) {
  const [commands, setCommands] = useState<SlashCommand[]>([PLAN_COMMAND]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ command: string; path: string } | null>(null);
  const loadingRequest = useRef(0);
  const hasSlash = draft.startsWith("/");
  const typedQuery = /^\/([^/\r\n]*)$/.exec(draft)?.[1] ?? null;
  const query = typedQuery !== null && !/\s$/.test(typedQuery) && (!/\s/.test(typedQuery) || commands.some(command => commandMatches(command, typedQuery))) ? typedQuery : null;
  const matches = query === null ? [] : commands.filter(command => commandMatches(command, query));
  const open = connected && query !== null && dismissed !== draft;
  const menuId = `slash-commands-${paneId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  useEffect(() => {
    if (!hasSlash || !connected) return;
    const current = ++loadingRequest.current;
    setLoading(true); setError(false); setCommands([PLAN_COMMAND]);
    if (typeof window.unbiased.slashCommands !== "function") { setError(true); setLoading(false); return; }
    void window.unbiased.slashCommands(paneId).then(result => {
      if (current !== loadingRequest.current) return;
      setCommands([PLAN_COMMAND, ...(Array.isArray(result.commands) ? result.commands.filter(command => command.id !== PLAN_COMMAND.id) : [])]);
      setError(!!result.error);
    }).catch(() => { if (current === loadingRequest.current) setError(true); })
      .finally(() => { if (current === loadingRequest.current) setLoading(false); });
    return () => { loadingRequest.current++; };
  }, [hasSlash, connected, paneId, contextKey]);
  useEffect(() => { setActive(0); setDismissed(null); }, [query, contextKey]);
  useEffect(() => { setSelection(null); }, [contextKey, paneId]);
  const selectedIndex = Math.min(active, Math.max(0, matches.length - 1));
  useEffect(() => {
    if (open) document.getElementById(`${menuId}-${selectedIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [open, menuId, selectedIndex, matches.length]);
  function select(command: SlashCommand) {
    if (!command.skill) { togglePlan(); changeDraft(""); setSelection(null); }
    else { setSelection({ command: command.command, path: command.skill.path }); changeDraft(`/${command.command} `); }
    focus();
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>): boolean {
    if (!open || event.nativeEvent.isComposing) return false;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setDismissed(draft); return true; }
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && matches.length) {
      event.preventDefault(); event.stopPropagation();
      setActive((selectedIndex + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length); return true;
    }
    if (!event.shiftKey && (event.key === "Enter" || event.key === "Tab")) {
      if (matches.length || loading) {
        event.preventDefault(); event.stopPropagation();
        if (!loading && matches[selectedIndex]) select(matches[selectedIndex]);
        return true;
      }
    }
    return false;
  }
  const token = commandToken(draft);
  const exact = token ? commands.filter(command => command.skill && commandKey(command.command) === commandKey(token.name)) : [];
  const skillPath = selection && token && commandKey(selection.command) === commandKey(token.name) ? selection.path : exact.length === 1 ? exact[0].skill?.path : undefined;
  const menu = open ? <div id={menuId} role="listbox" aria-label="Slash commands" data-popover style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, right: 0, maxHeight: 300, overflowY: "auto", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 14, padding: 6, zIndex: 20, boxShadow: "0 8px 24px rgba(0,0,0,0.45)" }}>
    {matches.map((command, index) => <button type="button" role="option" title={`/${command.command}`} aria-selected={index === selectedIndex} id={`${menuId}-${index}`} key={command.id} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => select(command)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", background: index === selectedIndex ? "var(--chip)" : "transparent", color: "var(--fg)", border: 0, borderRadius: 10, padding: "10px 12px", textAlign: "left", font: "inherit", cursor: "pointer" }}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ flexShrink: 0 }}><path d="m12 3 9 5v8l-9 5-9-5V8Z M3 8l9 5 9-5 M12 13v8" /></svg>
      <span style={{ flexShrink: 0 }}>{command.label}</span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--dim)", fontSize: 12.5 }}>{command.description}</span>
      <span style={{ flexShrink: 0, color: "var(--dim)", fontSize: 12 }}>{command.source}</span>
    </button>)}
    {!matches.length && <div role="status" style={{ padding: "10px 12px", color: "var(--dim)", fontSize: 13 }}>{loading ? "Loading commands…" : error ? "Could not load skill commands. Try again." : "No matching commands"}</div>}
  </div> : null;
  return { menu, keyDown, skillPath, suggestions: open ? { id: menuId, activeId: matches.length ? `${menuId}-${selectedIndex}` : undefined } : undefined };
}
