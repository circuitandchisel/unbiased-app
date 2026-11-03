import { InAppBrowserCursor } from "./in-app-browser-cursor";
import { randomUUID } from "node:crypto";
import type { WebContents } from "electron";
import type { Locator, Page } from "playwright-core";
import { connectSidePage } from "./side-browser-cdp";
import type { SideBrowserHelp, SideBrowserTab } from "../shared/side-browser";

export function sideBrowserUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("Provide an HTTP or HTTPS URL.");
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Only HTTP/HTTPS pages without embedded credentials are supported.");
  return url.href;
}
const text = (value: unknown, max = 1000) => { if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`Provide text of 1–${max} characters.`); return value; };
export const SIDE_BROWSER_TOOLS = [
  { name: "browser_side_list", description: "List browser tabs belonging to this conversation. Does not reveal the side panel." },
  { name: "browser_side_open", description: "Open an HTTP/HTTPS page in a background in-app browser tab. Uses an isolated session for this conversation; does not raise the app. Reuses the same open URL.", properties: { url: { type: "string" } }, required: ["url"] },
  { name: "browser_side_use", description: "Request permission to control an existing in-app browser tab, including its signed-in page. Does not switch the user's tab. Approval is required even in Full access.", properties: { tabId: { type: "number" } }, required: ["tabId"] },
  { name: "browser_side_navigate", description: "Navigate an authorized in-app browser tab to an HTTP/HTTPS URL, preserving that tab's signed-in session. Does not reveal the panel.", properties: { tabId: { type: "number" }, url: { type: "string" } }, required: ["tabId", "url"] },
  { name: "browser_side_snapshot", description: "Read the selected tab's accessible page structure, without revealing it.", properties: { tabId: { type: "number" } }, required: ["tabId"] },
  { name: "browser_side_click", description: "Click a unique element in an authorized in-app browser tab. Use either selector or role and name from the snapshot.", properties: { tabId: { type: "number" }, selector: { type: "string" }, role: { type: "string" }, name: { type: "string" } }, required: ["tabId"] },
  { name: "browser_side_fill", description: "Fill an input in an authorized in-app browser tab. Use either selector or role and name. Do not log passwords.", properties: { tabId: { type: "number" }, selector: { type: "string" }, role: { type: "string" }, name: { type: "string" }, text: { type: "string" } }, required: ["tabId", "text"] },
  { name: "browser_side_press", description: "Press a page navigation/editing key. Does not send OS shortcuts.", properties: { tabId: { type: "number" }, key: { type: "string", enum: ["Enter", "Tab", "Shift+Tab", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Backspace", "Delete", "Home", "End", "PageUp", "PageDown", "Space", "ControlOrMeta+A"] } }, required: ["tabId", "key"] },
  { name: "browser_side_scroll", description: "Scroll an authorized in-app browser tab vertically in the background.", properties: { tabId: { type: "number" }, pixels: { type: "number" } }, required: ["tabId", "pixels"] },
  { name: "browser_side_screenshot", description: "Capture an authorized in-app browser tab as an image without raising the window.", properties: { tabId: { type: "number" } }, required: ["tabId"] },
  { name: "browser_side_request_help", description: "Pause ALL automation of this tab and reveal it with a specific user request (sign-in, 2FA, CAPTCHA or a decision). Stop and wait: only the user can resume via Continue agent. Do not solve CAPTCHA or handle passwords yourself.", properties: { tabId: { type: "number" }, message: { type: "string" } }, required: ["tabId", "message"] },
].map(tool => ({ type: "function", name: tool.name, description: tool.description, inputSchema: { type: "object", properties: tool.properties ?? {}, required: tool.required ?? [], additionalProperties: false } }));

type Entry = { id: number; root: string; contents: WebContents; agentOwned: boolean; controlled: boolean; help: SideBrowserHelp | null; requested?: string; connection?: Awaited<ReturnType<typeof connectSidePage>>; queue: Promise<unknown>; cursor: InAppBrowserCursor; closed: boolean; generation: number; cleanup?: () => void };
export class SideBrowserController {
  private entries = new Map<number, Entry>();
  constructor(private host: { create: (root: string) => { id: number; contents: WebContents }; update: (root: string, revealId?: number) => void; controlled: (id: number) => void }, private connect = connectSidePage) {}
  register(id: number, root: string, contents: WebContents, agentOwned = false): void {
    if (this.entries.has(id)) return;
    const entry: Entry = { id, root, contents, agentOwned, controlled: agentOwned, help: null, queue: Promise.resolve(), cursor: new InAppBrowserCursor(contents), closed: false, generation: 0 };
    this.entries.set(id, entry);
    const destroyed = () => { if (this.entries.get(id) === entry) void this.dispose(id); };
    contents.once("destroyed", destroyed);
    // Bound pages never navigate into local files or Electron internals.
    const guard = (event: { preventDefault(): void }, url: string) => {
      if (!entry.controlled) return;
      try { sideBrowserUrl(url); } catch { event.preventDefault(); }
    };
    contents.on("will-navigate", guard);
    contents.on("will-redirect", guard);
    entry.cleanup = () => { contents.off("destroyed", destroyed); contents.off("will-navigate", guard); contents.off("will-redirect", guard); };
  }
  adoptDraft(root: string): void { for (const entry of this.entries.values()) if (entry.root === "main") entry.root = root; }
  list(root: string): SideBrowserTab[] {
    return [...this.entries.values()].filter(e => e.root === root && !e.closed && !e.contents.isDestroyed()).map(e => ({ id: e.id, root, url: e.requested ?? e.contents.getURL(), title: e.contents.getTitle() || "In-app browser", agentOwned: e.agentOwned, controlled: e.controlled, help: e.help }));
  }
  get(root: string, id: number): Entry {
    const entry = this.entries.get(id);
    if (!entry || entry.root !== root || entry.closed || entry.contents.isDestroyed()) throw new Error("This browser tab is closed or belongs to a different conversation.");
    return entry;
  }
  needsBackgroundHost(id: number): boolean { return this.entries.get(id)?.controlled === true; }
  owner(id: number): string | null { return this.entries.get(id)?.root ?? null; }
  grant(root: string, id: number): void { const entry = this.get(root, id); sideBrowserUrl(entry.contents.getURL()); entry.controlled = true; this.host.controlled(id); this.host.update(root); }
  async open(root: string, rawUrl: unknown): Promise<SideBrowserTab> {
    const url = sideBrowserUrl(rawUrl);
    const match = this.list(root).find(tab => { try { return sideBrowserUrl(tab.url) === url; } catch { return false; } });
    if (match) return match;
    if (this.list(root).length >= 5) throw new Error("This conversation already has five browser tabs. Close a tab before opening another.");
    if (this.entries.size >= 20) throw new Error("Twenty in-app browser tabs are already open. Close an unused tab before opening another.");
    const { id, contents } = this.host.create(root);
    this.register(id, root, contents, true);
    const entry = this.get(root, id); entry.requested = url;
    this.host.update(root);
    try { await this.run(root, id, page => page.goto(url, { waitUntil: "domcontentloaded" }), true); }
    finally { entry.requested = undefined; this.host.update(root); }
    this.get(root, id);
    return this.list(root).find(tab => tab.id === id)!;
  }
  async run<T>(root: string, id: number, action: (page: Page, cursor: InAppBrowserCursor) => Promise<T>, navigating = false): Promise<T> {
    const entry = this.get(root, id);
    const generation = entry.generation;
    const task = entry.queue.catch(() => {}).then(async () => {
      this.get(root, id);
      if (entry.generation !== generation) throw new Error("Browser control changed while this action was queued. Inspect the page before retrying.");
      if (!entry.controlled) throw new Error("Call browser_side_use and obtain permission before controlling this tab.");
      if (entry.help) throw new Error("This tab is waiting for the user. Only Continue agent in the app can resume automation.");
      if (!navigating) sideBrowserUrl(entry.contents.getURL());
      if (entry.connection?.page.isClosed()) { await entry.connection.close(); entry.connection = undefined; }
      if (!entry.connection) {
        const connection = await this.connect(entry.contents);
        if (entry.closed || entry.help || entry.generation !== generation) {
          await connection.close();
          throw new Error("Browser control was paused or the tab closed while connecting.");
        }
        entry.connection = connection;
      }
      await entry.cursor.begin();
      if (entry.closed || entry.help || entry.generation !== generation) { await entry.cursor.hide(); throw new Error("Browser control changed before this action could start."); }
      try { return await action(entry.connection.page, entry.cursor); }
      finally { await entry.cursor.end(); }
    });
    entry.queue = task;
    return task;
  }
  async requestHelp(root: string, id: number, message: unknown): Promise<SideBrowserHelp> {
    const entry = this.get(root, id);
    if (!entry.controlled) throw new Error("Obtain permission to use this tab first.");
    if (entry.help) return entry.help;
    entry.generation++;
    entry.help = { requestId: randomUUID(), message: text(message, 800) };
    const connection = entry.connection; entry.connection = undefined;
    await Promise.all([entry.cursor.hide(), connection?.close()]);
    this.get(root, id);
    this.host.update(root, id);
    return entry.help!;
  }
  resume(root: string, id: number, requestId: string): void {
    const entry = this.get(root, id);
    if (!entry.help || entry.help.requestId !== requestId) throw new Error("This browser help request has expired.");
    entry.generation++;
    entry.help = null; this.host.update(root);
  }
  async dispose(id: number): Promise<void> {
    const entry = this.entries.get(id); if (!entry) return;
    entry.closed = true; entry.cleanup?.(); this.entries.delete(id);
    await entry.cursor.dispose();
    await entry.connection?.close(); this.host.update(entry.root);
  }
  async shutdown(): Promise<void> { await Promise.all([...this.entries.keys()].map(id => this.dispose(id))); }
}
export function sideLocator(page: Page, args: Record<string, unknown>): Locator {
  if (typeof args.selector === "string") return page.locator(text(args.selector, 500));
  const role = text(args.role, 80) as Parameters<Page["getByRole"]>[0];
  return page.getByRole(role, { name: text(args.name, 300), exact: true });
}
