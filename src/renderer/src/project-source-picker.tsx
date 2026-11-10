import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Check, ChevronDown, FolderOpen, Globe, Laptop, Plus } from "lucide-react";
import { parseSshPath, sshPath, type SshStatus } from "../../shared/ssh";
import { ConnectionDialog, SshConnectionEditor } from "./SshSettings";
import "./project-source-picker.css";

/** Select paths on one device; creating a project remains the parent's action. */
export function ProjectSourcePicker({ folders, deviceId, onFolder, onDevice, onSetup }: {
  folders: string[];
  deviceId?: string | null;
  onFolder: (path: string, suggestedName: string) => void;
  onDevice: (id: string | null) => void;
  onSetup: () => void;
}) {
  const [connections, setConnections] = useState<SshStatus[]>([]);
  const [device, setDevice] = useState<string | null>(() => deviceId ?? parseSshPath(folders[0])?.connectionId ?? null);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [browser, setBrowser] = useState<{ id: string; path: string; loaded: string; entries: { name: string; dir: boolean }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const sequence = useRef(0);
  const menu = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState({ above: false, maxHeight: 260 });
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const anchor = root.current?.querySelector(".project-device-trigger")?.getBoundingClientRect();
      if (!anchor) return;
      const below = window.innerHeight - anchor.bottom - 20, above = anchor.top - 20;
      const flip = below < 230 && above > below;
      setPlacement({ above: flip, maxHeight: Math.max(80, Math.min(260, flip ? above : below)) });
    };
    position();
    menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    window.addEventListener("resize", position);
    return () => window.removeEventListener("resize", position);
  }, [open]);
  useEffect(() => {
    let live = true, updated = false;
    void window.unbiased.sshList().then(rows => { if (live && !updated) setConnections(rows); }).catch(() => { if (live) setError("Couldn't load SSH connections. Try opening the device menu again."); });
    const off = window.unbiased.onSshStatus(rows => { updated = true; if (live) setConnections(rows); });
    return () => { live = false; sequence.current++; off(); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); root.current?.querySelector<HTMLButtonElement>("button")?.focus(); } };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key, true); };
  }, [open]);
  const selected = connections.find(c => c.id === device);
  const lockedDevice = folders.length ? parseSshPath(folders[0])?.connectionId ?? null : undefined;
  const selectDevice = (id: string | null) => { setDevice(id); onDevice(id); setOpen(false); setError(""); };
  async function browse(id: string, path: string) {
    const request = ++sequence.current;
    setBusy(true); setError("");
    try {
      const result = await window.unbiased.sshFolders({ id, path });
      if (request === sequence.current) setBrowser({ id, path: result.dir, loaded: result.dir, entries: result.entries.filter(e => e.dir) });
    } catch (e) { if (request === sequence.current) setError(String(e instanceof Error ? e.message : e).split("\n").at(-1) ?? "Couldn't open folder"); }
    finally { if (request === sequence.current) setBusy(false); }
  }
  async function addFolder() {
    const request = ++sequence.current;
    setError("");
    if (!device) {
      setBusy(true);
      try { const result = await window.unbiased.pickProjectLocation(); if (request === sequence.current && result.path) onFolder(result.path, result.path.split(/[\\/]/).filter(Boolean).at(-1) ?? ""); }
      catch { setError("Couldn't open the folder chooser. Try again."); }
      finally { setBusy(false); }
      return;
    }
    let host = selected;
    if (host?.state !== "connected" || host.engineState !== "ready") {
      setBusy(true);
      try { host = await window.unbiased.sshConnect(device); setConnections(await window.unbiased.sshList()); }
      catch (e) { setError(String(e instanceof Error ? e.message : e).split("\n").at(-1) ?? "Couldn't connect"); return; }
      finally { setBusy(false); }
    }
    if (request !== sequence.current) return;
    if (!host || host.engineState !== "ready") { setError(host?.engineSetup?.message ?? "Finish app-engine setup in SSH settings, then try again."); return; }
    await browse(device, host.home ?? "/");
  }
  const closeBrowser = () => { sequence.current++; setBusy(false); setBrowser(null); setError(""); };
  return <div className="project-source-picker" ref={root}>
    <div className="project-source-actions">
      <button type="button" className="project-source-add" disabled={busy} onClick={() => void addFolder()}><Plus size={16} />{busy && !browser ? "Opening…" : "Add a folder"}</button>
      <div className="project-device-anchor">
        <button type="button" className="project-device-trigger" aria-label="Choose project device" disabled={busy} aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen(!open); if (!open) void window.unbiased.sshList().then(setConnections).catch(() => setError("Couldn't load SSH connections.")); }}>
          {device ? <Globe size={16} /> : <Laptop size={16} />}<span>{device ? selected?.name ?? "Remote device" : "This computer"}</span><ChevronDown size={14} />
        </button>
        {open && <div ref={menu} role="menu" aria-label="Project device" className="project-device-menu" style={{ top: placement.above ? "auto" : undefined, bottom: placement.above ? "calc(100% + 7px)" : undefined, maxHeight: placement.maxHeight }} onKeyDown={e => {
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
          e.preventDefault();
          const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          buttons[e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
        }}>
          <button role="menuitemradio" aria-checked={!device} disabled={lockedDevice !== undefined && lockedDevice !== null} onClick={() => selectDevice(null)}><Laptop size={17} /><span>This computer</span>{!device && <Check size={16} />}</button>
          <div className="project-device-heading">Remote devices</div>
          {connections.map(c => <button key={c.id} role="menuitemradio" aria-checked={device === c.id} disabled={lockedDevice !== undefined && lockedDevice !== c.id} onClick={() => selectDevice(c.id)}><Globe size={17} /><span>{c.name}</span>{device === c.id && <Check size={16} />}</button>)}
          {!connections.length && <p>No SSH connections yet</p>}
          <button role="menuitem" onClick={() => { setOpen(false); setAdding(true); }}><Plus size={17} /><span>Add remote</span></button>
          {folders.length > 0 && <p>Remove source folders to change devices.</p>}
        </div>}
      </div>
    </div>
    {error && !browser && <div className="project-source-error" role="alert">{error}{device && <button onClick={onSetup}>Open SSH settings</button>}</div>}
    {adding && <SshConnectionEditor onClose={() => setAdding(false)} onSaved={c => { setAdding(false); void window.unbiased.sshList().then(setConnections); if (!folders.length) selectDevice(c.id); }} />}
    {browser && <ConnectionDialog title="Choose remote folder" onClose={closeBrowser}>
      <p className="ssh-footnote">On {connections.find(c => c.id === browser.id)?.name ?? "remote device"}</p>
      <form className="ssh-location" onSubmit={e => { e.preventDefault(); void browse(browser.id, browser.path); }}><input aria-label="Remote folder path" value={browser.path} onChange={e => setBrowser({ ...browser, path: e.target.value })} /><button disabled={busy} type="submit">Go</button></form>
      <div className="ssh-folders" aria-busy={busy}>
        <button disabled={busy || browser.loaded === "/"} onClick={() => void browse(browser.id, browser.loaded.split("/").slice(0, -1).join("/") || "/")}><ArrowUp size={17} />Parent folder</button>
        {browser.entries.map(e => <button key={e.name} disabled={busy} onClick={() => void browse(browser.id, browser.loaded.replace(/\/$/, "") + "/" + e.name)}><FolderOpen size={17} />{e.name}</button>)}
        {!browser.entries.length && <p>No subfolders</p>}
      </div>
      {error && <p role="alert" className="ssh-error">{error}</p>}
      <footer><button onClick={closeBrowser}>Cancel</button><button className="ssh-primary" disabled={busy || browser.path !== browser.loaded} onClick={() => { onFolder(sshPath(browser.id, browser.loaded), browser.loaded.split("/").filter(Boolean).at(-1) ?? ""); closeBrowser(); }}>Use this folder</button></footer>
    </ConnectionDialog>}
  </div>;
}
