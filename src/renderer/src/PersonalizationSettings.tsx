import { useEffect, useState } from "react";
import type { AgentInstructions, AgentInstructionsSaveResult, SaveAgentInstructions } from "../../shared/agent-instructions";

export type AgentInstructionsAPI = {
  read: () => Promise<AgentInstructions>;
  save: (value: SaveAgentInstructions) => Promise<AgentInstructionsSaveResult>;
};

export function PersonalizationSettings({ api }: { api: AgentInstructionsAPI }) {
  const [editing, setEditing] = useState(false);
  const [document, setDocument] = useState<AgentInstructions | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    setSaved(false);
    void api.read().then(value => {
      if (!cancelled) { setDocument(value); setDraft(value.content); }
    }).catch(() => {
      if (!cancelled) setError("Could not load custom instructions. Reload to try again.");
    }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [api, editing, reload]);

  async function save() {
    if (!document || busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = await api.save({ content: draft, expectedRevision: document.revision });
      if (result.ok) { setDocument(result.document); setDraft(result.document.content); setSaved(true); }
      else setError(result.error);
    } catch {
      setError("Could not save custom instructions. Your draft is still here.");
    } finally { setBusy(false); }
  }

  const button = { border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", background: "var(--panel-2)", color: "var(--fg)", font: "inherit", fontSize: 13, cursor: "pointer" };
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "var(--track-title)", lineHeight: 1.15, margin: "0 0 32px" }}>Personalization</h1>
      <h2 style={{ fontSize: 14, fontWeight: 500, margin: "0 0 12px" }}>Custom instructions</h2>
      <section style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--panel)", overflow: "hidden" }}>
        <button type="button" aria-expanded={editing} aria-controls="custom-agent-instructions-editor" onClick={() => setEditing(!editing)} disabled={busy} style={{ width: "100%", border: 0, background: "transparent", color: "var(--fg)", textAlign: "left", padding: "18px 20px", display: "flex", alignItems: "center", gap: 20, cursor: "pointer", font: "inherit" }}>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontSize: 14 }}>Custom agent instructions</span>
            <span style={{ display: "block", color: "var(--dim)", fontSize: 12.5, lineHeight: 1.6, marginTop: 4 }}>Guide how the agent works across all your chats. Project instructions may also apply.</span>
          </span>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ transform: editing ? "rotate(90deg)" : undefined, flexShrink: 0 }}><path d="m6 3 5 5-5 5" /></svg>
        </button>
        {editing && <div id="custom-agent-instructions-editor" style={{ borderTop: "1px solid var(--border)", padding: 20 }}>
          <label htmlFor="custom-agent-instructions" style={{ display: "block", fontSize: 13, marginBottom: 10 }}>Instructions for every chat</label>
          <textarea id="custom-agent-instructions" value={draft} disabled={busy || !document} onChange={e => { setDraft(e.target.value); setSaved(false); }} placeholder="For example: Never merge a pull request without my explicit consent." spellCheck={false} style={{ boxSizing: "border-box", display: "block", width: "100%", minHeight: 260, resize: "vertical", padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel-2)", color: "var(--fg)", font: "inherit", fontSize: 13, lineHeight: 1.7 }} />
          <p style={{ color: "var(--dim)", fontSize: 12, lineHeight: 1.6, margin: "10px 0 18px" }}>Saved to <span title={document?.path}>~/.unbiased/AGENTS.md</span>. Changes apply from the next turn, including in existing chats.</p>
          {error && <p role="alert" style={{ color: "var(--err, #ff7764)", fontSize: 13, lineHeight: 1.5 }}>{error}</p>}
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
            <span role="status" style={{ color: "var(--dim)", fontSize: 12, flex: 1 }}>{busy ? "Working…" : saved ? "Saved. Applies from the next turn." : ""}</span>
            <button type="button" style={button} disabled={busy} onClick={() => setReload(n => n + 1)}>Reload from file</button>
            <button type="button" style={button} disabled={busy} onClick={() => { setEditing(false); setSaved(false); }}>Cancel</button>
            <button type="button" style={{ ...button, background: "var(--fg)", color: "var(--bg)", opacity: busy || !document || draft === document.content ? 0.5 : 1 }} disabled={busy || !document || draft === document.content} onClick={() => void save()}>Save</button>
          </div>
        </div>}
      </section>
    </div>
  );
}
