import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Globe, Plus, X, ArrowUp, FolderOpen, KeyRound, Trash2, Copy, Check, SquareTerminal } from "lucide-react";
import type { SshConnection, SshStatus } from "../../shared/ssh";
import "./ssh-settings.css";

const connectionLabel = (c: SshStatus) => c.state === "connected" ? "Connected" : c.state === "connecting" ? c.stage === "preparing-session" ? "Preparing SSH session…" : c.stage === "starting-engine" ? "Starting app engine…" : "Connecting via SSH…" : c.state === "error" ? "Connection needs attention" : "Disconnected";
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).trim().split("\n").at(-1)?.replace(/^Error invoking remote method '[^']+': Error: /, "").replace(/^(?:RuntimeError|ValueError|Error): /, "") ?? "Connection failed";
export function ConnectionDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input,button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeRef.current(); }
      if (e.key === "Tab") {
        const els = [...ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled)") ?? []];
        const index = els.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && index <= 0) { e.preventDefault(); els.at(-1)?.focus(); }
        else if (!e.shiftKey && index === els.length - 1) { e.preventDefault(); els[0]?.focus(); }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("keydown", key, true); previous?.focus(); };
  }, []);
  return createPortal(<div className="ssh-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="ssh-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="ssh-dialog-title">
      <header><h2 id="ssh-dialog-title">{title}</h2><button aria-label="Close dialog" onClick={onClose}><X size={19} /></button></header>
      {children}
    </div>
  </div>, document.querySelector(".ssh-settings") ?? document.body);
}

export function SshSettings({ onProject }: { onProject: (project: { id: string; name: string; path: string }) => void }) {
  const [connections, setConnections] = useState<SshStatus[]>([]);
  const [editing, setEditing] = useState<Partial<SshConnection> | null>(null);
  const [folder, setFolder] = useState<{ connection: SshStatus; path: string; name: string; nameEdited?: boolean } | null>(null);
  const [entries, setEntries] = useState<{ name: string; dir: boolean }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const browseSequence = useRef(0);
  useEffect(() => {
    let live = true;
    void window.unbiased.sshList().then(rows => { if (live) setConnections(rows); }).catch(e => { if (live) setError(errorText(e)); });
    const off = window.unbiased.onSshStatus(rows => { if (live) setConnections(rows); });
    return () => { live = false; off(); };
  }, []);
  async function run(id: string, action: () => Promise<unknown>) {
    setBusy(id); setError("");
    try { await action(); setConnections(await window.unbiased.sshList()); }
    catch (e) {
      const rows = await window.unbiased.sshList().catch(() => null);
      if (rows) setConnections(rows);
      setError(rows?.some(c => c.id === id && c.error) ? "" : errorText(e));
    }
    finally { setBusy(null); }
  }
  async function copyInstallCommand(id: string, command: string) {
    try { await navigator.clipboard.writeText(command); setCopiedId(id + command); }
    catch { setError("Couldn't copy the command. Select it and copy it manually."); }
  }
  async function browse(connection: SshStatus, path: string) {
    const sequence = ++browseSequence.current;
    setBusy("browse"); setError("");
    try {
      const result = await window.unbiased.sshFolders({ id: connection.id, path });
      if (sequence !== browseSequence.current) return;
      setEntries(result.entries);
      setFolder(old => ({ connection, path: result.dir, name: old?.connection.id === connection.id && old.nameEdited ? old.name : result.dir.split("/").filter(Boolean).at(-1) ?? "", nameEdited: old?.connection.id === connection.id && old.nameEdited }));
    } catch (e) { if (sequence === browseSequence.current) setError(errorText(e)); }
    finally { if (sequence === browseSequence.current) setBusy(null); }
  }
  const projectName = folder ? folder.nameEdited ? folder.name : folder.path.split("/").filter(Boolean).at(-1) ?? "" : "";
  const close = () => { if (!busy) { setEditing(null); setFolder(null); setError(""); browseSequence.current++; } };
  return <section className="ssh-settings">
    <h1>SSH</h1>
    <p className="ssh-intro">Work on a remote server while keeping your desktop workspace here.</p>
    <div className="ssh-section-heading"><h2>SSH connections from this Mac</h2><button className="ssh-add" onClick={() => { setError(""); setEditing({}); }}><Plus size={16} /> Add connection</button></div>
    {error && !editing && !folder && <p role="alert" className="ssh-error">{error}</p>}
    {!connections.length && <div className="ssh-empty"><Globe size={28} /><h3>Your remote workspace, connected.</h3><p>Add an SSH host or an alias from your SSH config, such as dev-server.</p></div>}
    <div className="ssh-connections">{connections.map(c => <div className="ssh-connection" key={c.id}>
      <div className="ssh-connection-summary">
      <div className="ssh-host-icon"><Globe size={22} /></div>
      <div className="ssh-host-detail"><strong>{c.name}</strong><span><i data-state={c.state} />{connectionLabel(c)}<span className="ssh-host-address">{c.host}</span></span>
        {c.error && <p className="ssh-error">{c.error}</p>}
        {c.state === "connected" && c.sandboxReady === false && <small>Sandbox prerequisites are missing on this host. Full Access works; sandboxed modes need host setup.</small>}
      </div>
      <div className="ssh-host-actions">
        {c.state === "connected" && c.engineState === "ready" && <button title="Add a remote project" aria-label={"Add project on " + c.name} disabled={!!busy} onClick={() => void browse(c, c.home ?? "/")}><FolderOpen size={18} /></button>}
        <button disabled={!!busy || c.state === "connecting"} onClick={() => void run(c.id, () => c.state === "connected" ? window.unbiased.sshDisconnect(c.id) : window.unbiased.sshConnect(c.id))}>{c.state === "connected" ? "Disconnect" : c.state === "connecting" ? "Connecting…" : "Connect"}</button>
        <button title="Edit connection" disabled={!!busy || c.state === "connected" || c.state === "connecting"} onClick={() => { setError(""); setEditing(c); }}>Edit</button>
        <button aria-label={"Remove " + c.name} disabled={!!busy || c.state === "connecting"} onClick={() => void run(c.id, () => window.unbiased.sshRemove(c.id))}><Trash2 size={15} /></button>
      </div>
      </div>
      {c.state === "connected" && c.engineState !== "ready" && <section className="ssh-runtime" aria-label={"App engine on " + c.name}>
        <div className="ssh-runtime-ready"><SquareTerminal size={17} /><div><strong>{c.engineSetup?.title ?? "Checking app engine…"}</strong><p>{c.engineSetup?.message ?? "Checking the installed runtime. No installation commands will be run."}</p></div></div>
        <div className="ssh-install-heading"><span>{c.standaloneEngine?.state === "installed" ? `Engine ${c.standaloneEngine.version} installed` : c.standaloneEngine?.state === "missing" ? "App engine not installed" : c.standaloneEngine?.state === "error" ? "Engine installation needs attention" : "Installation not checked"}</span><button disabled={!!busy} onClick={() => void run(c.id, () => window.unbiased.sshCheckEngine(c.id))}>{busy === c.id ? "Checking…" : "Check again"}</button></div>
        {c.engineSetup?.command && (() => {
          const command = c.engineSetup.command;
          return <>
            <p className="ssh-install-help">Run this yourself on {c.name}, then choose Check again:</p>
            <div className="ssh-install-command"><code>{command}</code><button aria-label={"Copy engine setup command for " + c.name} onClick={() => void copyInstallCommand(c.id, command)}>{copiedId === c.id + command ? <Check size={15} /> : <Copy size={15} />}{copiedId === c.id + command ? "Copied" : "Copy"}</button></div>
          </>;
        })()}
      </section>}
    </div>)}</div>
    <p className="ssh-footnote">Uses your SSH config, SSH agent and verified host keys. Sign in to Unbiased on the remote host before connecting. SSH keys and your Mac’s sign-in credentials stay on this Mac.</p>
    <p className="ssh-footnote">Disconnecting leaves the remote engine running so work can finish. Reconnect to recover its updates.</p>
    {editing && <SshConnectionEditor connection={editing} onClose={close} onSaved={() => { setEditing(null); void window.unbiased.sshList().then(setConnections); }} />}
    {folder && <ConnectionDialog title="Create remote project" onClose={close}>
      <label>Project name<input value={projectName} onChange={e => setFolder({ ...folder, name: e.target.value, nameEdited: true })} placeholder="My project" /></label>
      <label>Source folder <span>on {folder.connection.name}</span></label>
      <form className="ssh-location" onSubmit={e => { e.preventDefault(); void browse(folder.connection, folder.path); }}><input aria-label="Remote folder path" value={folder.path} onChange={e => setFolder({ ...folder, path: e.target.value })} /><button type="submit" disabled={!!busy}>Go</button></form>
      <div className="ssh-folders" aria-busy={busy === "browse"}>
        <button disabled={!!busy || folder.path === "/"} onClick={() => void browse(folder.connection, folder.path.split("/").slice(0,-1).join("/") || "/")}><ArrowUp size={17} /> Parent folder</button>
        {entries.map(entry => <button key={entry.name} disabled={!!busy} onClick={() => void browse(folder.connection, folder.path.replace(/\/$/, "") + "/" + entry.name)}><FolderOpen size={17} />{entry.name}</button>)}
        {!entries.length && <p>No subfolders</p>}
      </div>
      {error && <p role="alert" className="ssh-error">{error}</p>}
      <footer><button disabled={!!busy} onClick={close}>Cancel</button><button className="ssh-primary" disabled={!!busy || !projectName.trim()} onClick={() => void run("project", async () => { const project = await window.unbiased.sshProject({ id: folder.connection.id, path: folder.path, name: projectName }); setFolder(null); onProject(project); })}>Create project</button></footer>
    </ConnectionDialog>}
  </section>;
}

export function SshConnectionEditor({ connection = {}, onClose, onSaved }: { connection?: Partial<SshConnection>; onClose: () => void; onSaved: (connection: SshConnection) => void }) {
  const [editing, setEditing] = useState(connection);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true); setError("");
    try { onSaved(await window.unbiased.sshSave(editing)); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  return <ConnectionDialog title={editing.id ? "Edit SSH connection" : "Add SSH connection"} onClose={() => { if (!busy) onClose(); }}>
      <form onSubmit={e => { e.preventDefault(); void save(); }}>
        <label>Display name<input autoFocus required maxLength={100} value={editing.name ?? ""} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Development server" /></label>
        <label>SSH host or alias<input required value={editing.host ?? ""} onChange={e => setEditing({ ...editing, host: e.target.value })} placeholder="dev-server or user@host" /></label>
        <label>SSH port <span>(optional)</span><input type="number" min={1} max={65535} value={editing.port ?? ""} onChange={e => setEditing({ ...editing, port: e.target.value ? Number(e.target.value) : undefined })} placeholder="Use SSH config" /></label>
        <label>Identity file <span>(optional)</span><div className="ssh-identity"><input value={editing.identityFile ?? ""} onChange={e => setEditing({ ...editing, identityFile: e.target.value || undefined })} placeholder="Use SSH agent or SSH config" /><button type="button" aria-label="Choose identity file" onClick={() => void window.unbiased.sshIdentity().then(path => { if (path) setEditing({ ...editing, identityFile: path }); })}><KeyRound size={18} /></button></div></label>
        <p className="ssh-footnote">The app checks for a compatible engine after SSH connects. If installation is needed, it shows a command for you to run yourself.</p>
        {error && <p role="alert" className="ssh-error">{error}</p>}
        <footer><button type="button" disabled={!!busy} onClick={onClose}>Cancel</button><button className="ssh-primary" disabled={!!busy} type="submit">{busy ? "Saving…" : "Save connection"}</button></footer>
      </form>
  </ConnectionDialog>;
}
