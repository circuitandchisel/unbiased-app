import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { atomicJson, readJson, noSymlinks } from "./atomic-store";
import type { BrowserCapture } from "../shared/browser-capture";

type ToolResponse = {
  success: boolean;
  contentItems: ({ type: "inputText"; text: string } | { type: "inputImage"; imageUrl: string })[];
};
const MAX_CAPTURE_BYTES = 15_000_000;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function capturePath(root: string, threadId: string, itemId: string): string {
  return join(root, hash(threadId), `${hash(itemId)}.png`);
}

function captureIndex(root: string, threadId: string): Record<string, { itemId?: unknown; name?: unknown }> {
  try { const value = readJson<Record<string, { itemId?: unknown; name?: unknown }> | null>(join(root, hash(threadId), "index.json"), {}); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch { return {}; }
}

export function readBrowserCapture(root: string, threadId: string, itemId: string): BrowserCapture | null {
  const path = capturePath(root, threadId, itemId);
  try {
    noSymlinks(path);
    const file = statSync(path);
    if (!file.isFile() || !file.size || file.size > MAX_CAPTURE_BYTES) return null;
    const index = captureIndex(root, threadId);
    return { name: index[hash(itemId)]?.name === "Generated image" ? "Generated image" : "Browser screenshot", path };
  } catch { return null; }
}

export function removeBrowserCaptures(root: string, threadId: string): void {
  const dir = join(root, hash(threadId));
  noSymlinks(dir);
  rmSync(dir, { recursive: true, force: true });
}

/** Persist the runtime's image before its temporary source disappears. No runtime fork needed. */
export function retainBrowserCapture(root: string, threadId: string, itemId: string, response: ToolResponse, turnId?: string | null, name: "Browser screenshot" | "Generated image" = "Browser screenshot"): { response: ToolResponse; capture?: BrowserCapture } {
  if (!response.success) return { response };
  const image = response.contentItems.find(item => item.type === "inputImage");
  if (!image || image.type !== "inputImage") return { response };
  try {
    const prefix = "data:image/png;base64,";
    if (!image.imageUrl.startsWith(prefix) || image.imageUrl.length > prefix.length + Math.ceil(MAX_CAPTURE_BYTES / 3) * 4) throw new Error("Unsupported or oversized screenshot");
    const encoded = image.imageUrl.slice(prefix.length);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error("Invalid screenshot encoding");
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length < 24 || bytes.length > MAX_CAPTURE_BYTES || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("Invalid PNG screenshot");
    if (bytes.subarray(12, 16).toString() !== "IHDR" || !bytes.readUInt32BE(16) || !bytes.readUInt32BE(20) || bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 50_000_000) throw new Error("Invalid or oversized screenshot dimensions");
    const path = capturePath(root, threadId, itemId);
    noSymlinks(path);
    mkdirSync(join(root, hash(threadId)), { recursive: true, mode: 0o700 });
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, bytes, { flag: "wx", mode: 0o600 });
      renameSync(temp, path);
    } finally { rmSync(temp, { force: true }); }
    if (turnId || name === "Generated image") {
      const indexPath = join(root, hash(threadId), "index.json");
      const index = readJson<Record<string, { turnId?: string; itemId: string; name?: string }>>(indexPath, {});
      index[hash(itemId)] = { ...(turnId ? { turnId } : {}), itemId, name };
      atomicJson(indexPath, index);
    }
    const capture = { name, path };
    return { capture, response: { ...response, contentItems: [...response.contentItems, {
      type: "inputText", text: `Screenshot saved and automatically attached to this chat at ${path}. Describe what it shows in your reply. You do not need to repeat the image in Markdown.`,
    }] } };
  } catch (error) {
    return { response: { ...response, contentItems: [...response.contentItems, {
      type: "inputText", text: `The screenshot was captured, but its chat attachment could not be saved: ${error instanceof Error ? error.message : String(error)}. Do not claim an attachment was saved.`,
    }] } };
  }
}

export function readBrowserCapturesForItem(root: string, threadId: string, itemId: string): BrowserCapture[] {
  const index = captureIndex(root, threadId);
  const ids = new Set([itemId, ...Object.values(index).flatMap(record => typeof record?.itemId === "string" && record.itemId.startsWith(`${itemId}:image:`) ? [record.itemId] : [])]);
  return [...ids].map(id => readBrowserCapture(root, threadId, id)).filter((capture): capture is BrowserCapture => capture !== null);
}

export function readBrowserCaptureTurns(root: string, threadId: string): Record<string, BrowserCapture[]> {
  try {
    const index = readJson<Record<string, { turnId?: unknown; itemId?: unknown }>>(join(root, hash(threadId), "index.json"), {});
    const turns: Record<string, BrowserCapture[]> = Object.create(null);
    for (const record of Object.values(index)) {
      if (!record || typeof record.turnId !== "string" || typeof record.itemId !== "string") continue;
      const capture = readBrowserCapture(root, threadId, record.itemId);
      if (capture) (turns[record.turnId] ??= []).push(capture);
    }
    return turns;
  } catch { return {}; }
}
