// Real Electron embedded tabs + app-owned Playwright. No engine, external traffic or user's profile.
const { app, BrowserWindow, WebContentsView } = require('electron');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
require('tsx/cjs');
const { SideBrowserController } = require('../src/main/side-browser.ts');
const { connectSidePage } = require('../src/main/side-browser-cdp.ts');
const fixture = fs.mkdtempSync(join(tmpdir(), 'unbiased-side-control-'));
app.setPath('userData', join(fixture, 'profile'));
const deadline = setTimeout(() => { console.error('Side-browser regression timed out'); app.exit(1); }, 60000); deadline.unref();
// Chromium may reject the first hidden capture before its compositor has a
// frame on macOS CI. Retry only that transient Viz failure, keeping the native
// view hidden and retaining all pixel/visibility assertions below.
async function captureHidden(contents) {
  for (let attempt = 0; ; attempt++) {
    try { return await contents.capturePage(undefined, { stayHidden: true }); }
    catch (error) {
      if (error.message !== 'UnknownVizError' || attempt >= 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
}

async function main() {
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'text/html');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'none'; require-trusted-types-for 'script'");
    response.end(`<title>Side browser test</title><h1>Account page</h1><label>Name<input id="name"></label><button onclick="document.querySelector('h1').textContent='Saved '+document.querySelector('input').value">Save</button><div>${'<p>Scroll content</p>'.repeat(80)}</div>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  await app.whenReady();
  const front = new BrowserWindow({ show: false, width: 1100, height: 750 });
  const background = new BrowserWindow({ show: false, width: 1100, height: 750 });
  let next = -1; let reveals = 0; const views = new Map();
  const controller = new SideBrowserController({
    create: root => {
      const id = next--;
      const view = new WebContentsView({ webPreferences: { sandbox: true, backgroundThrottling: false, partition: `test-${root}` } });
      background.contentView.addChildView(view); view.setBounds({ x: 0, y: 0, width: 900, height: 600 });
      views.set(id, view); return { id, contents: view.webContents };
    },
    controlled: () => {},
    update: (_root, revealId) => {
      if (revealId === undefined) return;
      reveals++;
      const view = views.get(revealId); front.contentView.addChildView(view); view.setBounds({ x: 0, y: 100, width: 900, height: 550 });
    },
  });
  try {
    const tab = await controller.open('chat-one', url);
    const thumbnail = await captureHidden(views.get(tab.id).webContents);
    assert.equal(thumbnail.isEmpty(), false, 'hidden native tab can supply a preview without being shown');
    if (process.env.UNBIASED_PREVIEW_QA_PAGE) fs.writeFileSync(process.env.UNBIASED_PREVIEW_QA_PAGE, thumbnail.toPNG());

    assert.equal(background.isVisible(), false); assert.equal(front.isVisible(), false); assert.equal(reveals, 0);
    // A second, stacked native view must not prevent automation of the first.
    const other = await controller.open('chat-two', url);
    await controller.run('chat-one', tab.id, async (page, cursor) => {
      assert.match(await page.locator('body').ariaSnapshot(), /Account page/);
      assert.equal(await page.locator('[data-unbiased-agent-cursor]').count(), 1, 'agent cursor appears during a browser action');
      const name = page.getByRole('textbox', { name: 'Name' });
      await cursor.pointAt(name);
      const box = await name.boundingBox();
      const point = await page.locator('[data-unbiased-agent-cursor]').evaluate(node => ({x:parseFloat(node.style.left)+57.25,y:parseFloat(node.style.top)+57.25,events:getComputedStyle(node).pointerEvents,aria:node.getAttribute('aria-hidden')}));
      assert.ok(Math.abs(point.x-(box.x+box.width/2))<1); assert.ok(Math.abs(point.y-(box.y+box.height/2))<1);
      assert.equal(point.events, 'none'); assert.equal(point.aria, 'true');
      await name.fill('Background');
      await cursor.pointAt(page.getByRole('button', { name: 'Save', exact: true }));
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      assert.equal(await page.locator('h1').innerText(), 'Saved Background');
      await page.mouse.move(100, 100); await page.mouse.wheel(0, 400);
      await page.waitForFunction(() => scrollY > 0);
      const image = await cursor.withoutMarker(async () => {
        assert.equal(await page.locator('[data-unbiased-agent-cursor]').count(), 0, 'captures exclude the agent marker');
        return page.screenshot();
      }); assert.ok(image.length > 1000);
      assert.equal(await page.locator('[data-unbiased-agent-cursor]').count(), 1, 'active marker returns after a capture');
      if (process.env.UNBIASED_CURSOR_QA_SCREENSHOT) fs.writeFileSync(process.env.UNBIASED_CURSOR_QA_SCREENSHOT, await page.screenshot());
      assert.equal(image.subarray(1, 4).toString(), 'PNG');
      assert.equal(page.context().pages().length, 1, 'only the selected tab is exposed');
      await assert.rejects(page.context().newCDPSession(page), /Browser-wide command is unavailable/);
      await assert.rejects(page.context().newPage(), /Browser-wide command is unavailable/);
      await page.bringToFront(); assert.equal(front.isVisible(), false);
    });
    await controller.run('chat-one', tab.id, async page => {
      await page.evaluate(() => { document.body.style.background = '#204060'; });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const firstFrame = await captureHidden(views.get(tab.id).webContents);
      const otherFrame = await captureHidden(views.get(other.id).webContents);
      assert.deepEqual([...firstFrame.toBitmap().subarray(0,3)], [0x60,0x40,0x20], 'a covered background tab supplies its own freshly updated pixels');
      assert.deepEqual([...otherFrame.toBitmap().subarray(0,3)], [255,255,255], 'another background tab supplies a distinct frame');
      assert.equal(background.isVisible(), false);
    });
    assert.equal(await views.get(other.id).webContents.executeJavaScript('document.querySelector("h1").textContent'), 'Account page');
    await controller.run('chat-one', tab.id, async page => {
      await page.goto(url + '?next=1');
      await page.locator('[data-unbiased-agent-cursor]').waitFor({ state: 'attached' });
      assert.equal(await page.locator('[data-unbiased-agent-cursor]').evaluate(node => getComputedStyle(node).opacity), '1', 'cursor survives navigation while working');
    });
    // Match the computer-use cursor's idle fade without losing its last position.
    await views.get(tab.id).webContents.executeJavaScript(`new Promise(resolve => { const check=()=>{const node=document.querySelector('[data-unbiased-agent-cursor]');if(node&&getComputedStyle(node).opacity==='0')resolve(true);else setTimeout(check,50)};check(); })`);

    // No session/cookie sharing between conversations.
    await views.get(tab.id).webContents.session.cookies.set({ url, name: 'session', value: 'signed-in' });
    assert.equal((await views.get(other.id).webContents.session.cookies.get({ url })).length, 0);
    const help = await controller.requestHelp('chat-one', tab.id, 'Sign in, then continue.');
    assert.equal(await views.get(tab.id).webContents.executeJavaScript('!!document.querySelector("[data-unbiased-agent-cursor]")'), false, 'user handoff removes the cursor');
    assert.equal(reveals, 1); assert.equal(views.get(tab.id).webContents.debugger.isAttached(), false);
    await assert.rejects(controller.run('chat-one', tab.id, async () => {}), /waiting for the user/);
    // Simulate the user's work in the same native tab; cookie and form state survive reparenting.
    await views.get(tab.id).webContents.executeJavaScript('document.querySelector("input").value="User finished"');
    controller.resume('chat-one', tab.id, help.requestId);
    await controller.run('chat-one', tab.id, async page => {
      assert.equal(await page.locator('[data-unbiased-agent-cursor]').count(), 1, 'continuation restores the agent cursor');
      assert.equal(await page.getByRole('textbox').inputValue(), 'User finished');
      assert.equal((await views.get(tab.id).webContents.session.cookies.get({ url })).find(cookie => cookie.name === 'session')?.value, 'signed-in');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      assert.equal(await page.locator('h1').innerText(), 'Saved User finished');
    });
    // Stop must cancel a click that is still waiting for its target to become enabled.
    controller.beginWorker('cancel-worker');
    await controller.run('chat-two', other.id, async page => {
      await page.evaluate(() => { const button = document.createElement('button'); button.id = 'delayed-submit'; button.disabled = true; button.textContent = 'Delayed submit'; button.onclick = () => { document.body.dataset.submitted = 'yes'; }; document.body.prepend(button); });
    }, false, 'cancel-worker');
    let entered;
    const started = new Promise(resolve => { entered = resolve; });
    const pendingClick = controller.run('chat-two', other.id, async page => { entered(); await page.getByRole('button', { name: 'Delayed submit', exact: true }).click(); }, false, 'cancel-worker');
    const cancelled = assert.rejects(pendingClick);
    await started;
    await new Promise(resolve => setTimeout(resolve, 150));
    controller.finishWorker('cancel-worker');
    await cancelled;
    await views.get(other.id).webContents.executeJavaScript('document.querySelector("#delayed-submit").disabled = false');
    assert.equal(await views.get(other.id).webContents.executeJavaScript('document.body.dataset.submitted'), undefined, 'a stopped pending click must never submit later');
    assert.equal(views.get(other.id).webContents.debugger.isAttached(), false);
    controller.beginWorker('cancel-worker');
    await controller.run('chat-two', other.id, async page => page.getByRole('button', { name: 'Delayed submit', exact: true }).click(), false, 'cancel-worker');
    assert.equal(await views.get(other.id).webContents.executeJavaScript('document.body.dataset.submitted'), 'yes', 'a fresh turn can control the same page');
    await controller.shutdown();
    assert.equal(await views.get(tab.id).webContents.executeJavaScript('!!document.querySelector("[data-unbiased-agent-cursor]")'), false, 'disconnect removes the cursor');
    assert.equal(views.get(tab.id).webContents.isDestroyed(), false, 'disconnect keeps user tab alive');
    const wc = views.get(other.id).webContents; wc.debugger.attach('1.3');
    await assert.rejects(connectSidePage(wc), /already has a debugger/); wc.debugger.detach();
    const reconnect = await connectSidePage(wc); await reconnect.close();
    assert.equal(wc.debugger.isAttached(), false);
    await require('./check-side-browser-cleanup.cjs')(controller, views, front, background, url);
    assert.equal(front.isVisible(), false); assert.equal(background.isVisible(), false);
    console.log('PASS: in-app browser cursor coordinates, click-through, navigation, idle fade, handoff cleanup and capture exclusion; background native tabs, isolated sessions, page-only Playwright, screenshot/click/fill/scroll, help pause, same-tab resume, stopped pending clicks, parent/side-chat deletion, pruning and debugger cleanup.');
  } finally {
    await controller.shutdown(); for (const view of views.values()) if (!view.webContents.isDestroyed()) view.webContents.close();
    front.destroy(); background.destroy(); await new Promise(resolve => server.close(resolve));
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}
main().then(() => app.exit(0), error => { console.error(error); app.exit(1); });
