import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readBrowserCapture, retainBrowserCapture, removeBrowserCaptures } from "./browser-captures";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";
const response = () => ({ success: true, contentItems: [{ type: "inputImage" as const, imageUrl: `data:image/png;base64,${png}` }] });
test("screenshots survive reopen, have private files, and return displayable Markdown", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "unbiased-capture-test-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const saved = retainBrowserCapture(root, "thread-a", "call-1", response());
  assert.ok(saved.capture);
  assert.deepEqual(readFileSync(saved.capture.path), Buffer.from(png, "base64"));
  assert.equal(statSync(saved.capture.path).mode & 0o777, 0o600);
  assert.equal(statSync(join(saved.capture.path, "..")).mode & 0o777, 0o700);
  assert.deepEqual(readBrowserCapture(root, "thread-a", "call-1"), saved.capture);
  assert.match(saved.response.contentItems.at(-1)!.type === "inputText" ? (saved.response.contentItems.at(-1)! as {text:string}).text : "", /!\[Browser screenshot\]\(<.+\.png>\)/);
  assert.deepEqual(saved.response.contentItems[0], response().contentItems[0], "the model still gets the original image");
  assert.equal(readBrowserCapture(root, "thread-b", "call-1"), null);
  assert.equal(readBrowserCapture(root, "thread-a", "call-2"), null);
  const other = retainBrowserCapture(root, "thread-b", "call-1", response());
  removeBrowserCaptures(root, "thread-a");
  assert.equal(existsSync(saved.capture.path), false);
  assert.ok(existsSync(other.capture!.path), "deleting one chat preserves another chat's captures");
});
test("failed, invalid and unwritable captures do not lose the tool result or claim an attachment", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "unbiased-capture-error-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const denied = { ...response(), success: false };
  assert.deepEqual(retainBrowserCapture(root, "a", "b", denied), { response: denied });
  for (const data of ["data:text/html;base64,YQ==", "data:image/png;base64,not-valid!", "data:image/png;base64," + "A".repeat(20_000_004)]) {
    const input = { success: true, contentItems: [{ type: "inputImage" as const, imageUrl: data }] };
    const saved = retainBrowserCapture(root, "a", "b", input);
    assert.equal(saved.capture, undefined);
    assert.equal(saved.response.contentItems[0], input.contentItems[0]);
    assert.match((saved.response.contentItems.at(-1) as {text:string}).text, /could not be saved/);
  }
  const link = join(root, "link"); symlinkSync(root, link);
  assert.equal(retainBrowserCapture(link, "a", "b", response()).capture, undefined);
  assert.equal(readBrowserCapture(link, "a", "b"), null);
  assert.equal(readBrowserCapture(root, "../a", "../../b"), null);
});
