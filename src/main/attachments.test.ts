import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { looksLikeImage, convertedImagePath, sipsArgs, fileAttachmentContext, stripFileAttachmentContext, IMAGE_EXTENSIONS, attachmentSizeError, MAX_ATTACHMENT_BYTES } from "./attachments";

test("attachments over 7 MiB are rejected", () => {
  assert.equal(attachmentSizeError("report.pdf", MAX_ATTACHMENT_BYTES), null);
  assert.match(attachmentSizeError("report.pdf", MAX_ATTACHMENT_BYTES + 1) ?? "", /report\.pdf.*7 MB/);
  assert.equal(attachmentSizeError("photo.png", 4 * 1024 * 1024, "image"), null);
  assert.match(attachmentSizeError("photo.png", 6 * 1024 * 1024, "image") ?? "", /image encoding/);
});

// Measured 2026-09-09: a user attached a WebP logo and asked for it to be
// redrawn. Electron's nativeImage cannot decode WebP, so the extension said
// "image" and the decode said "empty"; the file fell through to a text
// mention, the engine dropped the binary silently, and the model — with no
// image in context at all — inferred the subject from the target frame's NAME
// and drew it from memory. macOS can convert the file in 60ms.

test("the formats worth attaching as pixels include the ones Electron cannot decode itself", () => {
  for (const p of ["/a/b.png", "/a/b.JPG", "/a/b.jpeg", "/a/b.gif", "/a/b.bmp",
                   "/a/Claude_AI_symbol.svg.webp", "/a/shot.HEIC", "/a/scan.tiff", "/a/x.avif"]) {
    assert.equal(looksLikeImage(p), true, p);
  }
  for (const p of ["/a/notes.txt", "/a/logo.svg", "/a/photo.webp.txt", "/a/README", "/a/dir.png/inside.md"]) {
    assert.equal(looksLikeImage(p), false, `${p} must not be treated as a bitmap`);
  }
  assert.ok(IMAGE_EXTENSIONS.includes("webp") && IMAGE_EXTENSIONS.includes("heic"));
});

test("the converted copy is a PNG named after the original, and the same source always maps to the same file", () => {
  const a = convertedImagePath("/Users/n/Downloads/Claude_AI_symbol.svg.webp", "/tmp/conv");
  assert.match(a, /^\/tmp\/conv\/Claude_AI_symbol\.svg\.webp-[0-9a-f]{8}\.png$/);
  assert.equal(a, convertedImagePath("/Users/n/Downloads/Claude_AI_symbol.svg.webp", "/tmp/conv"), "stable, so a re-attach reuses it");
  // Two files with the same basename in different folders must not collide —
  // the whole path is what identifies the source.
  assert.notEqual(a, convertedImagePath("/Users/n/Desktop/Claude_AI_symbol.svg.webp", "/tmp/conv"));
  // A basename that would escape the directory or break a shell is neutered.
  assert.match(convertedImagePath("/a/../../etc/pa ss:wd.webp", "/tmp/conv"), /^\/tmp\/conv\/pa_ss_wd\.webp-[0-9a-f]{8}\.png$/);
});

test("the conversion is sips asked for a PNG, with the output path given explicitly", () => {
  assert.deepEqual(sipsArgs("/in/a.webp", "/out/a.png"), ["-s", "format", "png", "/in/a.webp", "--out", "/out/a.png"]);
});

test("small dropped text files are present in the model's context, including outside the project", () => {
  const dir = mkdtempSync(join(tmpdir(), "unbiased-attachments-"));
  try {
    const file = join(dir, "snowboard-setup.md");
    writeFileSync(file, "# Snowboard setup\nUse a 15 degree front binding.\n");
    const context = fileAttachmentContext([{ path: file, kind: "file" }]);
    assert.ok(context.includes(file));
    assert.match(context, /complete contents/);
    assert.match(context, /Use a 15 degree front binding/);
    assert.equal(stripFileAttachmentContext(`Evaluate this file${context}`), "Evaluate this file");
    assert.equal(stripFileAttachmentContext("An ordinary message"), "An ordinary message");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("large, binary, and folder attachments give the model a path and an explicit read requirement", () => {
  const dir = mkdtempSync(join(tmpdir(), "unbiased-attachments-"));
  try {
    const large = join(dir, "large.md");
    const binary = join(dir, "report.pdf");
    const folder = join(dir, "notes");
    writeFileSync(large, "x".repeat(65 * 1024));
    writeFileSync(binary, Buffer.from([0, 1, 2]));
    mkdirSync(folder);
    const context = fileAttachmentContext([
      { path: large, kind: "file" },
      { path: binary, kind: "file" },
      { path: folder, kind: "folder" },
    ]);
    assert.ok(context.includes(large) && context.includes(binary) && context.includes(folder));
    assert.equal((context.match(/Read the file before answering/g) ?? []).length, 2);
    assert.match(context, /Inspect this folder before answering/);
    assert.ok(!context.includes("x".repeat(100)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unavailable files are reported and image input is left to the image path", () => {
  const missing = "/no-such-unbiased-attachment.md";
  assert.match(fileAttachmentContext([{ path: missing, kind: "file" }]), /could not be opened/);
  assert.equal(fileAttachmentContext([{ path: "/tmp/image.png", kind: "image" }]), "");
});

test("many text attachments stay within the total inline budget", () => {
  const dir = mkdtempSync(join(tmpdir(), "unbiased-attachments-"));
  try {
    const paths = ["a.md", "b.md", "c.md"].map((name) => join(dir, name));
    paths.forEach((path, i) => writeFileSync(path, String(i).repeat(60 * 1024)));
    const context = fileAttachmentContext(paths.map((path) => ({ path, kind: "file" })));
    assert.equal((context.match(/complete contents/g) ?? []).length, 2);
    assert.match(context, /Attached file "c.md".*not included here/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
