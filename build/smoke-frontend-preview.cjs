// Real local page -> pinned browser runtime -> retained capture -> renderer attachment.
const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const { createServer } = require('node:http');
const { mkdtempSync, realpathSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
require('tsx/cjs');
const { BrowserRuntimeClient } = require('../build/browser-runtime/client.js');
const { retainBrowserCapture, readBrowserCapture } = require('../src/main/browser-captures.ts');
const fixture = realpathSync(mkdtempSync(join(tmpdir(), 'unbiased-preview-')));
app.setPath('userData', join(fixture, 'desktop'));
const deadline = setTimeout(() => { console.error('Frontend preview regression timed out'); app.exit(1); }, 90000); deadline.unref();
async function main() {
  await app.whenReady();
  const seen = [];
  const server = createServer((req, res) => {
    seen.push(req.url); res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><title>Local frontend preview</title><style>body{margin:0;padding:50px;background:#111111;color:white;font:24px system-ui}button{padding:12px}</style><h1>Local settings preview</h1><p>Test data for the preview pipeline.</p><button onclick="document.body.style.background=\'#ff563f\';this.textContent=\'Preview applied\'">Apply preview style</button>');
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const socket = createServer(); await new Promise(done => socket.listen(0, '127.0.0.1', done));
  const port = socket.address().port; await new Promise(done => socket.close(done));
  const client = new BrowserRuntimeClient({ entry: resolve('build/browser-runtime/main.js'), options: {
    browserRoot: resolve('build/browser-bundle'), home: fixture, tempDir: fixture, osVersion: '13.0', port,
  }, onEvent: () => {} });
  let win;
  try {
    const url = `http://127.0.0.1:${server.address().port}/settings/theme-preview`;
    const tool = async (name, args = {}) => {
      const result = await client.request('tool.execute', { tool: name, args, sessionId: 'preview-chat' });
      assert.equal(result.success, true, JSON.stringify(result)); return result;
    };
    await tool('browser_open', { url });
    const snapshot = await tool('browser_snapshot');
    const text = snapshot.contentItems.map(i => i.text ?? '').join('\n');
    assert.match(text, /Local settings preview/);
    const ref = /button "Apply preview style" \[ref=(\w+)\]/.exec(text)?.[1]; assert.ok(ref, text);
    await tool('browser_click', { ref });
    const changed = await tool('browser_snapshot');
    assert.match(changed.contentItems.map(i => i.text ?? '').join('\n'), /Preview applied/);
    const capture = await tool('browser_screenshot');
    const saved = retainBrowserCapture(join(fixture, 'captures'), 'preview-chat', 'screenshot-call', capture);
    assert.ok(saved.capture);
    const bytes = readFileSync(saved.capture.path);
    const image = nativeImage.createFromBuffer(bytes);
    assert.ok(!image.isEmpty());
    assert.deepEqual([...image.toBitmap().subarray(0, 3)], [0x3f, 0x56, 0xff], 'screenshot contains the actual changed page background');
    assert.ok(seen.includes('/settings/theme-preview'), 'the requested route was visited');
    await client.shutdown();
    assert.deepEqual(readBrowserCapture(join(fixture, 'captures'), 'preview-chat', 'screenshot-call'), saved.capture, 'attachment survives browser shutdown');
    ipcMain.handle('file:read-image', (_e, path) => {
      assert.equal(path, saved.capture.path);
      return { fullPath: path, dataUrl: nativeImage.createFromPath(path).toDataURL() };
    });
    const result = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React from 'react';import {createRoot} from 'react-dom/client';import {CommandOutputPanel,MdImage} from './src/renderer/src/App';
const entry=JSON.parse(localStorage.getItem('capture-entry')??${JSON.stringify(JSON.stringify({kind:'command',itemId:'screenshot-call',command:'browser_screenshot',source:'browser',status:'completed',screenshots:[saved.capture]}))});
localStorage.setItem('capture-entry',JSON.stringify(entry));
function Fixture(){const [preview,setPreview]=React.useState(null);return <><CommandOutputPanel entry={entry} onPreviewImage={image=>{window.qaOpened=image;setPreview(image.path)}}/>{preview&&<section aria-label="Image preview"><MdImage src={preview} alt="Opened screenshot" chat/></section>}</>}
createRoot(document.getElementById('root')).render(<Fixture/>);
` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'import.meta.glob': '__qaGlob' }, banner: { js: 'var __qaGlob=()=>({});' }, loader: { '.svg': 'dataurl', '.png': 'dataurl', '.webp': 'dataurl' }, plugins: [{ name: 'qa', setup(b) {
      b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
      b.onLoad({ filter: /\.md$/ }, args => ({ contents: readFileSync(args.path, 'utf8'), loader: 'text' }));
      b.onLoad({ filter: /\/src\/renderer\/src\/App\.tsx$/ }, args => ({ contents: readFileSync(args.path, 'utf8') + '\nexport {CommandOutputPanel,MdImage};', loader: 'tsx' }));
    } }] });
    const html = join(fixture, 'preview.html');
    writeFileSync(html, `<style>body{--fg:#fff;--dim:#bbb;--border:#444;--code-bg:#222;background:#111;font:14px system-ui}</style><div id="root"></div><script>${result.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`);
    win = new BrowserWindow({ show: false, width: 900, height: 750, webPreferences: { preload: resolve('out/preload/index.js'), backgroundThrottling: false } });
    const until = async expression => { for(let i=0;i<120;i++){if(await win.webContents.executeJavaScript(expression))return;await new Promise(done=>setTimeout(done,50));}throw new Error('Timed out: '+expression); };
    await win.loadFile(html);
    await until("document.querySelector('button img')?.naturalWidth>0");
    await win.webContents.executeJavaScript("document.querySelector('[aria-label=\"Open browser screenshot\"]').click()");
    await until("document.querySelector('[aria-label=\"Image preview\"] img')?.naturalWidth>0");
    assert.equal(await win.webContents.executeJavaScript('window.qaOpened.path'), saved.capture.path);
    await new Promise(done => { win.webContents.once('did-finish-load', done); win.webContents.reload(); });
    await until("document.querySelector('button img')?.naturalWidth>0");
    await win.webContents.executeJavaScript("document.querySelector('[aria-label=\"Open browser screenshot\"]').click()");
    await until("document.querySelector('[aria-label=\"Image preview\"] img')?.naturalWidth>0");
    if (process.env.UNBIASED_FRONTEND_PREVIEW_SCREENSHOT) writeFileSync(process.env.UNBIASED_FRONTEND_PREVIEW_SCREENSHOT, (await win.webContents.capturePage()).toPNG());
    console.log('PASS: exact local route, browser interaction, real screenshot pixels, private persistent attachment, production preload image loading, and opening/reopening the rendered capture after reload.');
  } finally {
    win?.destroy(); await client.shutdown(); await new Promise(done => server.close(done));
    rmSync(fixture, { recursive: true, force: true });
  }
}
main().then(() => app.exit(0), error => { console.error(error); app.exit(1); });
