// Exercise the real renderer pane, preload, desktop IPC adapter and Node runtime together.
const assert = require("node:assert/strict");
const { app, BrowserWindow, ipcMain } = require("electron");
const { createServer } = require("node:http");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { buildSync } = require("esbuild");
require("tsx/cjs");
const { BrowserRuntimeClient } = require("../src/main/browser-runtime-client.ts");
const { registerBrowserMirrorIpc } = require("../src/main/browser-mirror-ipc.ts");

async function main() {
  const home = mkdtempSync(join(tmpdir(), "unbiased-mirror-smoke-"));
  app.setPath("userData", join(home, "electron"));
  await app.whenReady();
  let scrollPosition = { x: 0, y: 0 };
  const fixture = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/scroll") {
      scrollPosition = { x: Number(url.searchParams.get("x")), y: Number(url.searchParams.get("y")) };
      res.writeHead(204); res.end(); return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end('<!doctype html><title>Mirror fixture</title><style>body{min-width:3000px;min-height:3000px}</style><h1>Mirroring works</h1><label>Name<input aria-label="Name"></label><script>onscroll=()=>fetch(`/scroll?x=${scrollX}&y=${scrollY}`)</script>');
  });
  await new Promise(done => fixture.listen(0, "127.0.0.1", done));
  const win = new BrowserWindow({ show: false, width: 1000, height: 750, webPreferences: {
    preload: resolve("out/preload/index.js"), contextIsolation: true, sandbox: true,
  } });
  const runtime = new BrowserRuntimeClient({ entry: resolve("build/browser-runtime/main.js"),
    options: { browserRoot: resolve("build/browser-bundle"), home, tempDir: home, osVersion: "13.0" },
    onEvent: (event, payload) => { if (!win.isDestroyed()) win.webContents.send(event, payload); },
  });
  let rejectStart = true;
  registerBrowserMirrorIpc(ipcMain, { request: (method, params) => {
    if (method === "view.start" && rejectStart) throw new Error("Invalid or unsupported browser operation: view.start");
    return runtime.request(method, params);
  } }, thread => thread === "side-chat" ? "chat-a" : thread ?? "main");
  const renderer = buildSync({ stdin: { contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { AgentMirrorPane } from './src/renderer/src/AgentMirrorPane';
    createRoot(document.getElementById('root')).render(<AgentMirrorPane active={true} threadId="side-chat" />);
  `, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, jsx: "automatic", platform: "browser" }).outputFiles[0].text;
  const page = join(home, "mirror.html");
  writeFileSync(join(home, "mirror.js"), renderer);
  writeFileSync(page, '<!doctype html><style>html,body,#root{margin:0;height:100%;display:flex;flex:1;background:#111;color:#ddd;--dim:#aaa;--code-bg:#111}</style><div id="root"></div><script src="mirror.js"></script>');
  const evaluate = script => win.webContents.executeJavaScript(script);
  async function until(script) {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(script)) return;
      await new Promise(done => setTimeout(done, 100));
    }
    throw new Error(`Mirror UI condition failed: ${script}\n${await evaluate('document.body.innerText')}`);
  }
  try {
    const opened = await runtime.request("tool.execute", { tool: "browser_open", args: { url: `http://127.0.0.1:${fixture.address().port}/` }, sessionId: "chat-a" });
    assert.equal(opened.success, true, JSON.stringify(opened));
    await win.loadFile(page);
    await until(`document.body.innerText.includes('Invalid or unsupported browser operation: view.start') && !!document.querySelector('button')`);
    assert.equal(await evaluate(`document.body.innerText.includes('Connecting to the agent browser…')`), false);
    rejectStart = false;
    await evaluate("document.querySelector('button').click()");
    await until("!!document.querySelector('img') && document.querySelector('img').naturalWidth > 0");
    assert.ok(await evaluate(`document.body.innerText.includes('http://127.0.0.1:')`));
    // Send real DOM wheel events through the pane's React handler, then read
    // the fixture's scroll position independently from its local HTTP beacon.
    async function wheel(deltaX, deltaY, check) {
      await evaluate(`(() => {
        const img = document.querySelector('img'), box = img.getBoundingClientRect();
        img.parentElement.dispatchEvent(new WheelEvent('wheel', { bubbles:true,
          clientX:box.left+box.width/2, clientY:box.top+box.height/2,
          deltaX:${deltaX}, deltaY:${deltaY} }));
      })()`);
      for (let i=0;i<60;i++) {
        if (check(scrollPosition)) return;
        await new Promise(done=>setTimeout(done,100));
      }
      assert.ok(check(scrollPosition), `Wheel direction did not reach the page: ${JSON.stringify(scrollPosition)}`);
    }
    await wheel(0, 300, p => p.y > 0);
    await wheel(0, -300, p => p.y === 0);
    await wheel(300, 0, p => p.x > 0);
    await wheel(-300, 0, p => p.x === 0);
    // This deliberately starts before a pane is laid out and while zoomed out.
    assert.equal((await evaluate(`window.unbiased.agentMirrorStart({threadId:'side-chat',width:0,height:0,dpr:0.8})`)).ok, true);
    await until("!!document.querySelector('img') && document.querySelector('img').naturalWidth > 0");
    await evaluate(`window.unbiased.agentMirrorResize({width:700,height:500,dpr:2})`);
    await until("document.querySelector('img').naturalWidth >= 700");
    const screenshot = process.env.UNBIASED_MIRROR_SCREENSHOT || "/tmp/unbiased-browser-mirror-verified.png";
    writeFileSync(screenshot, (await win.webContents.capturePage()).toPNG());
    console.log(`PASS: actual Electron pane + preload + desktop IPC + runtime rendered JPEG frames; failed start displayed error; Retry, conversation mapping, vertical/horizontal wheel directions, unlaid-out/zoomed pane and resize worked. Screenshot: ${screenshot}`);
  } finally {
    await runtime.shutdown();
    win.destroy();
    await new Promise(done => fixture.close(done));
    rmSync(home, { recursive: true, force: true });
    app.quit();
  }
}
main().catch(error => { console.error(error); app.exit(1); });
