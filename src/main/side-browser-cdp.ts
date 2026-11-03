import { randomUUID } from "node:crypto";
import type { WebContents } from "electron";
import { chromium, type Browser, type Page } from "playwright-core";
import { WebSocketServer, WebSocket } from "ws";

/** A private, one-page CDP transport. Electron's app-wide debugger port stays disabled. */
export async function connectSidePage(contents: WebContents): Promise<{ page: Page; close: () => Promise<void> }> {
  if (contents.isDestroyed()) throw new Error("This browser tab is closed.");
  if (contents.debugger.isAttached()) throw new Error("This tab already has a debugger attached. Close its DevTools before agent control.");
  // A newly constructed WebContentsView has no renderer/frame until its first load.
  if (!contents.getURL()) await contents.loadURL("about:blank");
  const token = randomUUID();
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0, path: `/${token}`, maxPayload: 2_000_000 });
  await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not create the tab connection.");
  let socket: WebSocket | undefined;
  let browser: Browser | undefined;
  let closed = false;
  const session = "side-page";
  let targetId = String(contents.id);
  const children = new Set<string>();
  let attached = false;
  let ownsDebugger = false;
  const send = (value: unknown) => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value)); };
  const info = () => ({ targetId, type: "page", title: contents.getTitle(), url: contents.getURL(), attached: true, browserContextId: "side-context", canAccessOpener: false });
  const onMessage = (_event: unknown, method: string, params: Record<string, unknown>, child?: string) => {
    if (method === "Target.attachedToTarget" && typeof params.sessionId === "string") children.add(params.sessionId);
    if (method === "Target.detachedFromTarget" && typeof params.sessionId === "string") children.delete(params.sessionId);
    send({ method, params, sessionId: child || session });
  };
  const onDetach = () => { ownsDebugger = false; socket?.close(); };
  const close = async () => {
    if (closed) return;
    closed = true;
    contents.debugger.off("message", onMessage);
    contents.debugger.off("detach", onDetach);
    try { if (ownsDebugger && !contents.isDestroyed() && contents.debugger.isAttached()) contents.debugger.detach(); } catch { /* tab closed */ }
    socket?.terminate();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await browser?.close().catch(() => {});
  };
  try {
    contents.debugger.attach("1.3");
    ownsDebugger = true;
    targetId = (await contents.debugger.sendCommand("Target.getTargetInfo")).targetInfo.targetId;
    contents.debugger.on("message", onMessage);
    contents.debugger.on("detach", onDetach);
    server.on("connection", (client, request) => {
      if (socket || request.headers.origin) { client.close(); return; }
      socket = client;
      client.on("error", () => client.close());
      client.on("message", async raw => {
        let command: { id: number; method: string; params?: Record<string, unknown>; sessionId?: string };
        try { command = JSON.parse(raw.toString()); } catch { client.close(); return; }
        if (!command || typeof command.id !== "number" || !Number.isFinite(command.id) || typeof command.method !== "string" || (command.params !== undefined && (!command.params || typeof command.params !== "object" || Array.isArray(command.params)))) { client.close(); return; }
        const { id, method, params = {}, sessionId } = command;
        try {
          let result: unknown;
          if (!sessionId) {
            switch (method) {
              case "Browser.getVersion": result = { protocolVersion: "1.3", product: `Chrome/${process.versions.chrome}`, userAgent: contents.getUserAgent(), revision: "" }; break;
              case "Browser.setDownloadBehavior": result = {}; break;
              case "Target.getTargetInfo":
                if (params.targetId && params.targetId !== targetId) throw new Error("Tab is outside this connection.");
                result = { targetInfo: info() }; break;
              case "Target.getTargets": result = { targetInfos: [info()] }; break;
              case "Target.setAutoAttach":
                result = {};
                if (!attached) { attached = true; send({ method: "Target.attachedToTarget", params: { sessionId: session, targetInfo: info(), waitingForDebugger: false } }); }
                break;
              default: throw new Error(`Browser-wide command is unavailable: ${method}`);
            }
          } else {
            if (sessionId !== session && !children.has(sessionId)) throw new Error("Unknown page session.");
            // Never forward browser-wide target discovery, new tabs, or host-window focus.
            if (method.startsWith("Browser.") || (method.startsWith("Target.") && !["Target.setAutoAttach", "Target.getTargetInfo", "Target.detachFromTarget"].includes(method))) throw new Error(`Command is outside the selected tab: ${method}`);
            if (method === "Target.getTargetInfo") {
              if (params.targetId && params.targetId !== targetId) throw new Error("Tab is outside this connection.");
              result = { targetInfo: info() };
            } else if (method === "Page.bringToFront") result = {};
            else result = await contents.debugger.sendCommand(method, params, sessionId === session ? undefined : sessionId);
          }
          send({ id, result, ...(sessionId ? { sessionId } : {}) });
        } catch (error) { send({ id, error: { code: -32000, message: error instanceof Error ? error.message : String(error) }, ...(sessionId ? { sessionId } : {}) }); }
      });
    });
    browser = await chromium.connectOverCDP(`ws://127.0.0.1:${address.port}/${token}`, { timeout: 10_000, isLocal: true });
    const page = browser.contexts()[0]?.pages()[0];
    if (!page) throw new Error("The selected browser tab did not initialize.");
    page.setDefaultTimeout(8000);
    page.setDefaultNavigationTimeout(15_000);
    return { page, close };
  } catch (error) { await close(); throw error; }
}
