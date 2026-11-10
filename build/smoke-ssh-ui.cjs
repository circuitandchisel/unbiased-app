const { app, BrowserWindow } = require("electron");
const { build } = require("esbuild");
const fs = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const assert = require("node:assert/strict");
(async () => {
  const fixture = fs.mkdtempSync(join(tmpdir(), "ssh-ui-")), css = [];
  // Avoid a template-literal fixture so source strings are easy to audit.
  const source = [
    "import React from 'react'; import { createRoot } from 'react-dom/client'; import { SshSettings } from './src/renderer/src/SshSettings';",
    "let rows=[], listener=()=>{}, checks=0;window.calls=[];",
    "window.unbiased={sshList:async()=>rows,onSshStatus:cb=>{listener=cb;return()=>{}},",
    "sshSave:async c=>{rows=[{...c,id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',state:'disconnected'}];return rows[0]},",
    "sshConnect:async()=>{rows=rows.map(c=>({...c,state:'connected',home:'/home/ubuntu',sandboxReady:false,engineState:'install-required',standaloneEngine:{state:'missing'},engineSetup:{title:'Install app engine',message:'Run this command yourself on the remote host, then choose Check again.',command:'curl -fsSL https://raw.githubusercontent.com/circuitandchisel/unbiased-app-engine/main/install.sh | bash -s -- --version 0.1.0'}}));listener(rows);return rows[0]},",
    "sshCheckEngine:async()=>{checks++;rows=rows.map(c=>({...c,standaloneEngine:{state:'installed',version:'0.1.0'},engineState:checks===1?'restart-required':'ready',engineSetup:checks===1?{title:'Stop the previous session first',message:'Finish its work, then stop it manually. The app will not stop it for you.',command:'kill -TERM -- 12345'}:undefined}));listener(rows);return rows[0].standaloneEngine;},",
    "sshDisconnect:async()=>{rows=rows.map(c=>({...c,state:'disconnected'}));listener(rows)},sshRemove:async()=>{rows=[];listener(rows)},sshIdentity:async()=>null,",
    "sshFolders:async p=>{window.calls.push(['folders',p]);return {dir:p.path,entries:[{name:'Projects',dir:true}]};},",
    "sshProject:async p=>{window.calls.push(['project',p]);return{id:'project-remote',name:p.name,path:'/__unbiased_ssh__/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'+p.path}}};",
    "Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copiedCommand=text}}});",
    "createRoot(document.getElementById('root')).render(<SshSettings onProject={p=>{window.created=p}}/>);",
  ].join("\n");
  const result = await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", plugins: [{ name: "css", setup(b) { b.onLoad({ filter: /\.css$/ }, args => { css.push(fs.readFileSync(args.path, "utf8")); return { contents: "", loader: "js" }; }); } }] });
  const html = join(fixture, "index.html");
  fs.writeFileSync(html, '<style>body{margin:0;background:#111;color:#eee;font-family:system-ui;padding:60px;--bg:#111;--fg:#eee;--dim:#aaa;--panel:#1e1e1e;--panel-2:#292929;--border:#383838;--accent:#ff624b;--font-ui:system-ui}' + css.join("\n") + '</style><div id="root"></div><script>' + result.outputFiles[0].text.replaceAll("</script", "<\\/script") + "</script>");
  await app.whenReady();
  const win = new BrowserWindow({ show: false, width: 1180, height: 850, webPreferences: { backgroundThrottling: false } });
  const ev = s => win.webContents.executeJavaScript(s);
  const until = async test => { for (let n = 0; n < 160; n++) { if (await ev(test)) return; await new Promise(r => setTimeout(r, 25)); } throw Error("Timeout: " + test); };
  const clickText = text => ev("([...document.querySelectorAll('button')].find(b=>b.textContent.trim()===" + JSON.stringify(text) + ")).click()");
  try {
    await win.loadFile(html);
    await until("document.body.innerText.includes('Add connection')");
    await clickText("Add connection");
    await until("document.querySelector('[role=dialog]')");
    await ev("(()=>{const inputs=[...document.querySelectorAll('.ssh-dialog input')],setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(inputs[0],'Dev Box');inputs[0].dispatchEvent(new Event('input',{bubbles:true}));setter.call(inputs[1],'dev-server');inputs[1].dispatchEvent(new Event('input',{bubbles:true}));inputs[1].focus()})()");
    await new Promise(r => setTimeout(r, 50));
    assert.equal(await ev("document.activeElement.placeholder"), "dev-server or user@host");
    await clickText("Save connection");
    await until("!document.querySelector('[role=dialog]')");
    await clickText("Connect");
    await until("document.body.innerText.includes('Connected')");
    assert.ok(await ev("document.body.innerText.includes('Install app engine')"));
    assert.ok(await ev("!document.querySelector('[aria-label=\"Add project on Dev Box\"]')"),'remote projects require an installed engine');
    await ev("document.querySelector('[aria-label=\"Copy engine setup command for Dev Box\"]').click()");
    await until("window.copiedCommand?.endsWith('bash -s -- --version 0.1.0')");
    await clickText("Check again");
    await until("document.body.innerText.includes('Stop the previous session first')");
    assert.ok(await ev("document.body.innerText.includes('The app will not stop it for you.')"));
    await ev("document.querySelector('[aria-label=\"Copy engine setup command for Dev Box\"]').click()");
    await until("window.copiedCommand==='kill -TERM -- 12345'");
    assert.ok(await ev("!document.body.innerText.includes('Traceback')"));
    await clickText("Check again");
    await until("document.querySelector('[aria-label=\"Add project on Dev Box\"]')&&!document.querySelector('.ssh-runtime')");
    assert.ok(await ev("!document.body.innerText.includes('Check again')"),'successful connections hide setup instructions');
    await ev("document.querySelector('[aria-label=\"Add project on Dev Box\"]').click()");
    await until("document.body.innerText.includes('Create remote project')");
    await ev("(()=>{const e=document.querySelector('[aria-label=\"Remote folder path\"]'),s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(e,'/home/ubuntu/Projects/Work/unbiased-analysis');e.dispatchEvent(new Event('input',{bubbles:true}))})()");
    await clickText("Go");
    await until("document.querySelector('.ssh-dialog input').value==='unbiased-analysis'");
    await ev("(()=>{const e=document.querySelector('.ssh-dialog input'),s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(e,'Unbiased Analysis');e.dispatchEvent(new Event('input',{bubbles:true}))})()");
    await new Promise(r => setTimeout(r, 40));
    await new Promise(r => setTimeout(r, 350));
    const screenshot = join(fixture, "remote-project-picker.png");
    fs.writeFileSync(screenshot, (await win.webContents.capturePage()).toPNG());
    await clickText("Create project");
    await until("window.created?.name==='Unbiased Analysis'");
    assert.equal(await ev("window.created.path.includes('/home/ubuntu')"), true);
    await clickText("Disconnect");
    await until("document.body.innerText.includes('Disconnected')");
    console.log("PASS: themed SSH settings, stable typing focus, save/connect, remote picker, project selection and disconnect");
    console.log("Screenshot:", screenshot);
  } finally { win.destroy(); app.quit(); }
})().catch(e => { console.error(e); app.exit(1); });
