import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readBrowserCapture, readBrowserCaptureTurns, readBrowserCapturesForItem, retainBrowserCapture, removeBrowserCaptures } from "./browser-captures";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";
const response = () => ({ success: true, contentItems: [{ type: "inputImage" as const, imageUrl: `data:image/png;base64,${png}` }] });
test("screenshots survive reopen, have private files, and return an automatic attachment confirmation", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "unbiased-capture-test-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const saved = retainBrowserCapture(root, "thread-a", "call-1", response());
  assert.ok(saved.capture);
  assert.deepEqual(readFileSync(saved.capture.path), Buffer.from(png, "base64"));
  assert.equal(statSync(saved.capture.path).mode & 0o777, 0o600);
  assert.equal(statSync(join(saved.capture.path, "..")).mode & 0o777, 0o700);
  assert.deepEqual(readBrowserCapture(root, "thread-a", "call-1"), saved.capture);
  assert.match((saved.response.contentItems.at(-1) as {text:string}).text, /automatically attached/);
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

test("turn associations recover images when engine history omits tool calls", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "unbiased-capture-turn-")));
  t.after(() => rmSync(root, {recursive:true,force:true}));
  const first = retainBrowserCapture(root, 'a', 'call-1', response(), 'turn-1');
  const second = retainBrowserCapture(root, 'a', 'call-2', response(), 'turn-2');
  assert.deepEqual(readBrowserCaptureTurns(root, 'a')['turn-1'], [first.capture]);
  assert.deepEqual(readBrowserCaptureTurns(root, 'a')['turn-2'], [second.capture]);
  assert.deepEqual(Object.keys(readBrowserCaptureTurns(root, 'b')), []);
  removeBrowserCaptures(root, 'a');
  assert.deepEqual(Object.keys(readBrowserCaptureTurns(root, 'a')), []);
});

test("generated images retain their label and all results across reload and deletion", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "unbiased-generated-images-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const first = retainBrowserCapture(root, "chat", "call", response(), "turn", "Generated image").capture!;
  const second = retainBrowserCapture(root, "chat", "call:image:1", response(), "turn", "Generated image").capture!;
  assert.deepEqual(readBrowserCapturesForItem(root, "chat", "call"), [first, second]);
  assert.deepEqual(readBrowserCaptureTurns(root, "chat").turn, [first, second]);
  assert.equal(readBrowserCapture(root, "chat", "call")?.name, "Generated image");
  removeBrowserCaptures(root, "chat");
  assert.deepEqual(readBrowserCapturesForItem(root, "chat", "call"), []);
  const noTurn = retainBrowserCapture(root, "chat", "standalone", response(), null, "Generated image").capture!;
  assert.deepEqual(readBrowserCapture(root, "chat", "standalone"), noTurn);
});
