// Real App routing with native-browser IPC stubbed; no engine or web traffic.
const { app, BrowserWindow } = require('electron');
const { build } = require('esbuild');
const fs = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const assert = require('node:assert/strict');
const fixture = fs.mkdtempSync(join(tmpdir(), 'unbiased-browser-tabs-'));
app.setPath('userData', join(fixture, 'profile'));
const deadline = setTimeout(() => { console.error('Side-browser UI regression timed out'); app.exit(1); }, 40000); deadline.unref();
async function main() {
  const previewImage = process.env.UNBIASED_PREVIEW_QA_PAGE ? 'data:image/png;base64,' + fs.readFileSync(process.env.UNBIASED_PREVIEW_QA_PAGE).toString('base64') : 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN5sAAAAASUVORK5CYII=';
  const result = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React from 'react';import {createRoot} from 'react-dom/client';import {App} from './src/renderer/src/App';
localStorage.setItem('unbiased.authed','1');Object.defineProperty(document,'visibilityState',{get:()=>window.qaVisibility??'visible'});window.qaCalls=[];window.qaListeners=new Map();
window.qaEmit=(name,payload)=>{for(const cb of window.qaListeners.get(name)??[])cb(payload)};
window.unbiased=new Proxy({}, {get:(_,key)=>{
 if(String(key).startsWith('on'))return cb=>{const listeners=window.qaListeners.get(key)??new Set();listeners.add(cb);window.qaListeners.set(key,listeners);return ()=>listeners.delete(cb)};
 return async(...args)=>{window.qaCalls.push([key,...args]);if(key==='previewSideBrowser')return ${JSON.stringify(previewImage)};if(key==='recentSideChats')return [];if(key==='getEngineStatus')return {state:'connected'};if(key==='sideBrowserTabs')return window.qaSideTabs??{root:'main',tabs:[]};if(key==='resumeSideBrowser'){window.qaSideTabs.tabs[0].help=null;window.qaEmit('onSideBrowserTabs',window.qaSideTabs);return {ok:true,message:'Browser step completed. Continue in tab -1.'}};if(key==='sendMessage')return {threadId:'chat-one',created:false};if(key==='openThread'){window.qaSideTabs={root:args[0],tabs:args[0]==='chat-one'?(window.qaOwnedTabs??[]):[]};return {entries:[{kind:'user',text:'Background test'},{kind:'assistant',text:'Ready for browser work.'}],total:2,running:args[0]==='chat-one',approvals:[]}};return {ok:true,hasKey:true,projects:[],recents:[],releases:[],tasks:[],memories:[],servers:[],commands:[],entries:[],enabled:[],pals:[],pets:[]}};
}});createRoot(document.getElementById('root')).render(<App/>);
` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'import.meta.glob': '__qaGlob' }, banner: { js: 'var __qaGlob=()=>({});' }, loader: { '.svg': 'dataurl', '.png': 'dataurl', '.webp': 'dataurl' }, plugins: [{ name: 'qa', setup(b) {
    b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
    b.onLoad({ filter: /\.md$/ }, args => ({ contents: fs.readFileSync(args.path, 'utf8'), loader: 'text' }));
  } }] });
  const html = join(fixture, 'index.html');
  const baseStyles = [...fs.readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8').matchAll(/<style>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n');
  fs.writeFileSync(html, `<style>${baseStyles}</style><div id="root"></div><script>${result.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>`);
  await app.whenReady();
  const win = new BrowserWindow({ show: false, width: 1300, height: 850, webPreferences: { backgroundThrottling: false } });
  const errors = []; win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
  const evaluate = async expression => {
    const r = await win.webContents.executeJavaScript(`(async()=>{try{return {ok:true,value:await (0,eval)(${JSON.stringify(expression)})}}catch(e){return {ok:false,error:e.stack??String(e)}}})()`);
    if (!r.ok) throw new Error(r.error + '\nExpression: ' + expression); return r.value;
  };
  const until = async expression => {
    for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 30)); }
    throw new Error('Timed out: ' + expression + '\n' + errors.join('\n')+'\n'+JSON.stringify(await evaluate("({calls:window.qaCalls.slice(-30),tabs:window.qaSideTabs,text:document.body.innerText.slice(-1600)})")));
  };
  const active = id => `document.querySelector('[data-browser-host="${id}"]')?.offsetWidth>0`;
  const tab = { id: -1, root: 'main', url: 'https://example.test/', title: 'Background work', agentOwned: true, controlled: true, working: true, lastUsedAt: 1, help: null };
  const emitTabs = update => evaluate(`window.qaSideTabs=${JSON.stringify(update)};window.qaEmit('onSideBrowserTabs',window.qaSideTabs)`);
  try {
    await win.loadFile(html);
    await until("window.qaListeners?.get('onBrowserOpenLink')?.size>0&&document.querySelector('[aria-label=Sidebar]')!==null");
    await until("window.qaListeners?.get('onSideBrowserTabs')?.size>0");
    await emitTabs({root:'main',tabs:[tab]});
    await until("window.qaCalls.some(c=>c[0]==='openBrowser'&&c[1].id===-1)");
    assert.equal(await evaluate(active(-1)), false, 'background creation does not reveal panel');
    assert.equal(await evaluate("window.qaCalls.some(c=>c[0]==='setBrowserVisible'&&c[1].id===-1&&c[1].visible)"), false);
    const preview = "document.querySelector('[data-browser-preview=\"-1\"]')";
    await until(preview + "?.querySelector('img')?.src.startsWith('data:image/')");
    if (process.env.UNBIASED_PREVIEW_QA_SCREENSHOT) {
      win.showInactive();
      await until(preview + "?.querySelector('img')?.complete&&" + preview + "?.querySelector('img')?.naturalWidth>0");
      await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
      fs.writeFileSync(process.env.UNBIASED_PREVIEW_QA_SCREENSHOT, (await win.webContents.capturePage()).toPNG());
      win.hide();
    }
    await evaluate("window.qaVisibility='hidden';document.dispatchEvent(new Event('visibilitychange'))");
    const capturesWhileHidden = await evaluate("window.qaCalls.filter(c=>c[0]==='previewSideBrowser').length");
    await new Promise(resolve => setTimeout(resolve, 750));
    assert.equal(await evaluate("window.qaCalls.filter(c=>c[0]==='previewSideBrowser').length"), capturesWhileHidden, 'preview capture pauses while the app is hidden');
    await evaluate("window.qaVisibility='visible';document.dispatchEvent(new Event('visibilitychange'))");
    await until("window.qaCalls.filter(c=>c[0]==='previewSideBrowser').length>"+capturesWhileHidden);
    const originalOpens = await evaluate("window.qaCalls.filter(c=>c[0]==='openBrowser').length");
    await evaluate(preview + '.click()'); await until(active(-1));
    await until('!' + preview);
    const capturesWhileVisible = await evaluate("window.qaCalls.filter(c=>c[0]==='previewSideBrowser').length");
    await new Promise(resolve => setTimeout(resolve, 750));
    assert.equal(await evaluate("window.qaCalls.filter(c=>c[0]==='previewSideBrowser').length"), capturesWhileVisible, 'preview capture stops while the actual page is visible');
    await evaluate("document.querySelector('[title=\"Close side panel\"]').click()");
    await until(preview + '!==null');
    await until('!(' + active(-1) + ')');
    assert.equal(await evaluate("window.qaCalls.filter(c=>c[0]==='openBrowser').length"), originalOpens, 'preview focuses and hides without reopening or reloading the native tab');
    const box = await evaluate(preview + '.getBoundingClientRect().toJSON()');
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', {enabled:true});
    const pointer = (type, x, y, extra={}) => win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {type,x,y,...extra});
    const point = { x: box.x + 80, y: box.y + 60 };
    await pointer('mouseMoved',point.x,point.y);
    await pointer('mousePressed',point.x,point.y,{button:'left',buttons:1,clickCount:1});
    await pointer('mouseMoved',point.x-100,point.y+90,{button:'left',buttons:1});
    await pointer('mouseReleased',point.x-100,point.y+90,{button:'left',buttons:0,clickCount:1});
    await until(preview + '?.getBoundingClientRect().y>' + (box.y+70));
    assert.equal(await evaluate(active(-1)), false, 'dragging does not open the tab');
    const moved = await evaluate(preview + '.getBoundingClientRect().toJSON()');
    win.setSize(850,600);
    await until("(()=>{const b="+preview+";if(!b)return false;const p=b.parentElement.getBoundingClientRect(),r=b.getBoundingClientRect();return r.right<=p.right-10&&r.bottom<=p.bottom-10})()");
    win.setSize(1300,850);
    await evaluate(preview + '.click()'); await until(active(-1));
    await evaluate("document.querySelector('[title=\"Close side panel\"]').click()");
    await until(preview + '!==null');
    assert.ok((await evaluate(preview + '.getBoundingClientRect().toJSON()')).y>box.y+30, 'position survives opening and closing the page');
    tab.working = false;
    await emitTabs({root:'main',tabs:[tab]});
    await until('!' + preview);
    tab.root = 'chat-one';
    await evaluate(`window.qaOwnedTabs=${JSON.stringify([tab])}`);
    tab.help = {requestId:'request-one',message:'Please sign in to this page.'};
    await evaluate(`window.qaOwnedTabs=${JSON.stringify([tab])}`);
    await emitTabs({root:'chat-one',tabs:[tab],revealId:-1});
    await until(active(-1));
    await until("document.querySelector('[data-browser-help=\"-1\"]')?.textContent.includes('Please sign in')");
    assert.equal(await evaluate("document.querySelectorAll('[aria-label=\"Agent has access to this in-app browser tab\"]').length"), 0, 'user handoff hides the access cursor');
    // A foreign background update must neither show nor add a different chat's tab.
    await evaluate("window.qaEmit('onSideBrowserTabs',{root:'other-chat',tabs:[{id:-2,url:'https://private.test',controlled:true}]})");
    assert.equal(await evaluate("!!document.querySelector('[data-browser-host=\"-2\"]')"), false);
    await evaluate("document.querySelector('[data-pane-id=main][role=textbox]').focus()");
    await win.webContents.insertText('Keep this unsent draft');
    await until("document.querySelector('[data-pane-id=main][role=textbox]').textContent.includes('Keep this unsent draft')");
    await evaluate("document.querySelector('[data-browser-help=\"-1\"] button').click()");
    await until("document.body.innerText.includes('Browser step completed. Continue in tab -1.')");
    assert.equal(await evaluate("window.qaCalls.filter(c=>c[0]==='sendMessage').length"), 0, 'Continue queues while the prior turn finishes');
    await evaluate("window.qaEmit('onTurnCompleted',{paneId:'main',status:'completed',narrated:true})");
    await until("window.qaCalls.some(c=>c[0]==='sendMessage'&&c[2]==='Browser step completed. Continue in tab -1.')");
    assert.equal(await evaluate("window.qaCalls.filter(c=>c[0]==='resumeSideBrowser').length"), 1);
    await until("!document.querySelector('[data-browser-help=\"-1\"]')");
    assert.equal(await evaluate("document.querySelectorAll('[aria-label=\"Agent has access to this in-app browser tab\"]').length"), 1, 'continuation restores the access cursor');
    assert.equal(await evaluate(active(-1)), true, 'continuation leaves the same tab visible');
    assert.equal(await evaluate("window.qaCalls.filter(c=>c[0]==='openBrowser'&&c[1]?.url).length"), 0, 'handoff does not reload the page');
    assert.equal(await evaluate("document.querySelector('[data-pane-id=main][role=textbox]').textContent"), 'Keep this unsent draft');
    await evaluate("window.qaEmit('onScheduledOpenRun',{threadId:'chat-two'})");
    await until("window.qaCalls.some(c=>c[0]==='openThread'&&c[1]==='chat-two')&&!document.querySelector('[data-browser-host=\"-1\"]')");
    assert.equal(await evaluate("window.qaCalls.some(c=>c[0]==='closeBrowser'&&c[1]===-1)"), false, 'switching chats keeps controlled tabs alive');
    assert.equal(await evaluate("window.qaCalls.filter(c=>c[0]==='setBrowserVisible'&&c[1].id===-1).at(-1)[1].visible"), false, 'old native page is hidden on chat switch');
    tab.help = {requestId:'request-two',message:'Please confirm the next step.'};
    await evaluate(`window.qaOwnedTabs=${JSON.stringify([tab])}`);
    await emitTabs({root:'chat-one',tabs:[tab],revealId:-1});
    await until(active(-1));
    await until("document.querySelector('[data-browser-help=\"-1\"]')?.textContent.includes('confirm the next step')");
    if (process.env.UNBIASED_UI_QA_SCREENSHOT) fs.writeFileSync(process.env.UNBIASED_UI_QA_SCREENSHOT, (await win.webContents.capturePage()).toPNG());
    assert.deepEqual(errors.filter(e => !e.includes('Electron Security Warning')), []);
    console.log('PASS: live picture-in-picture preview, pointer drag, resize bounds, existing-tab focus and capture suspension; background tab adoption stays quiet, help reveals the same tab, foreign tabs stay private, and Continue agent sends a visible continuation.');
  } finally { win.destroy(); fs.rmSync(fixture, { recursive: true, force: true }); }
}
main().then(() => app.exit(0), error => { console.error(error); app.exit(1); });
