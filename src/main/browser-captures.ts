import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { noSymlinks } from "./atomic-store";
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

export function readBrowserCapture(root: string, threadId: string, itemId: string): BrowserCapture | null {
  const path = capturePath(root, threadId, itemId);
  try {
    noSymlinks(path);
    const file = statSync(path);
    if (!file.isFile() || !file.size || file.size > MAX_CAPTURE_BYTES) return null;
    return { name: "Browser screenshot", path };
  } catch { return null; }
}

export function removeBrowserCaptures(root: string, threadId: string): void {
  const dir = join(root, hash(threadId));
  noSymlinks(dir);
  rmSync(dir, { recursive: true, force: true });
}

/** Persist the runtime's image before its temporary source disappears. No runtime fork needed. */
export function retainBrowserCapture(root: string, threadId: string, itemId: string, response: ToolResponse): { response: ToolResponse; capture?: BrowserCapture } {
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
    const capture = { name: "Browser screenshot", path };
    return { capture, response: { ...response, contentItems: [...response.contentItems, {
      type: "inputText", text: `Screenshot saved as a chat attachment. To show it in your reply, include this exact Markdown:\n![Browser screenshot](<${path}>)\nAlso provide the exact preview URL and identify any mocked data.`,
    }] } };
  } catch (error) {
    return { response: { ...response, contentItems: [...response.contentItems, {
      type: "inputText", text: `The screenshot was captured, but its chat attachment could not be saved: ${error instanceof Error ? error.message : String(error)}. Do not claim an attachment was saved.`,
    }] } };
  }
}
