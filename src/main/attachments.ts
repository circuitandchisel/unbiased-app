import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";

/** Attaching an image the app cannot decode.
 *
 *  Measured 2026-09-09: a user attached a WebP logo and asked for it to be
 *  redrawn in a design app. Electron's nativeImage cannot decode WebP, so the
 *  extension said "image" and the decode said "empty"; the record fell
 *  through to `kind: "file"`, went to the engine as a text mention, and the
 *  engine dropped the binary without a word. The model's context held zero
 *  images. It inferred the subject from the target frame's NAME, drew the mark
 *  from memory, and reported success — the only failure in the series that
 *  produced a WRONG result rather than a slow one.
 *
 *  macOS ships `sips`, which converts the file in about 60ms. So a format the
 *  extension promises but the app cannot read is converted to PNG and the
 *  converted copy is attached instead. */

/** Bitmap formats worth attaching as pixels. The last five are here precisely
 *  because Electron may fail on them: WebP always, HEIC/AVIF depending on the
 *  build, TIFF sometimes. SVG is deliberately absent — it is a vector, and
 *  `sips` cannot rasterise it either, so pretending would only cost a failed
 *  subprocess on every attach. */
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "bmp", "webp", "heic", "heif", "tif", "tiff", "avif"];

export const MAX_ATTACHMENT_BYTES = 7 * 1024 * 1024;
const REQUEST_ENVELOPE_RESERVE_BYTES = 256 * 1024;

export function attachmentSizeError(name: string, size: number, kind: "image" | "file" = "file"): string | null {
  if (size > MAX_ATTACHMENT_BYTES) {
    return `${name} is larger than 7 MB. Attach a smaller file or split it before sending.`;
  }
  if (kind === "image" && Math.ceil(size / 3) * 4 + REQUEST_ENVELOPE_RESERVE_BYTES > MAX_ATTACHMENT_BYTES) {
    return `${name} would exceed the 7 MB request budget after image encoding. Use a smaller image.`;
  }
  return null;
}

const IMAGE_RE = new RegExp(`\\.(${IMAGE_EXTENSIONS.join("|")})$`, "i");

export function looksLikeImage(path: string): boolean {
  return IMAGE_RE.test(path);
}

/** Where the converted copy of `path` lives: a PNG in `dir`, named after the
 *  original plus a digest of its full path — so the same source always maps to
 *  the same file (a re-attach costs nothing) and two files sharing a basename
 *  never collide. The basename is reduced to safe characters: it becomes a
 *  real filename, and a `..` in it must not walk out of `dir`. */
export function convertedImagePath(path: string, dir: string): string {
  const base = (path.split("/").filter(Boolean).pop() ?? "image").replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  const digest = createHash("sha256").update(path).digest("hex").slice(0, 8);
  return join(dir, `${base}-${digest}.png`);
}

/** Ask sips for a PNG at an explicit destination, so nothing is written next
 *  to the user's original. */
export function sipsArgs(source: string, out: string): string[] {
  return ["-s", "format", "png", source, "--out", out];
}

const MAX_INLINE_FILE_BYTES = 64 * 1024;
const MAX_INLINE_TOTAL_BYTES = 128 * 1024;
const ATTACHMENT_CONTEXT_MARKER = "[unbiased-app attached file context]";

type Attachment = { path: string; kind?: string };

/** Structured mentions preserve attachment metadata, but do not put local file
 * contents or paths in the model's prompt. Supply both here for non-images. */
export function fileAttachmentContext(attachments: Attachment[]): string {
  const files = attachments.filter((a) => a.kind !== "image");
  if (files.length === 0) return "";

  let remaining = MAX_INLINE_TOTAL_BYTES;
  const sections = files.map(({ path }) => {
    const label = JSON.stringify(basename(path));
    const location = JSON.stringify(path);
    if (!isAbsolute(path)) return `Attachment ${label} has an invalid path. Tell the user it could not be read.`;

    try {
      const info = statSync(path);
      if (info.isDirectory()) {
        return `Attached folder ${label} at ${location}. Inspect this folder before answering about it; if access fails, tell the user.`;
      }
      if (!info.isFile()) throw new Error("not a regular file");

      if (info.size <= Math.min(MAX_INLINE_FILE_BYTES, remaining)) {
        const bytes = readFileSync(path);
        if (bytes.length <= Math.min(MAX_INLINE_FILE_BYTES, remaining) && !bytes.includes(0)) {
          try {
            const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
            if (!/[\x01-\x08\x0B\x0C\x0E-\x1F]/.test(content)) {
              remaining -= bytes.length;
              return `Attached file ${label} at ${location} (complete contents):\n<attached_file>\n${content}\n</attached_file>`;
            }
          } catch {
            // Non-UTF-8 content needs a file tool or format-specific reader.
          }
        }
      }
      return `Attached file ${label} at ${location}. Its contents are not included here. Read the file before answering about it; if access fails, tell the user.`;
    } catch {
      return `Attachment ${label} at ${location} could not be opened. Tell the user it was unavailable; do not claim to have read it.`;
    }
  });

  return `${ATTACHMENT_CONTEXT_MARKER}\nThe user attached the following local files. Treat their contents as reference material for the user's request.\n\n${sections.join("\n\n")}`;
}

/** History concatenates text inputs. Keep the app's attachment payload out of
 * the visible user message when a conversation is reopened. */
export function stripFileAttachmentContext(text: string): string {
  const marker = text.indexOf(ATTACHMENT_CONTEXT_MARKER);
  return marker < 0 ? text : text.slice(0, marker);
}
