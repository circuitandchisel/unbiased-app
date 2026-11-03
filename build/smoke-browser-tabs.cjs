// Real App routing with native-browser IPC stubbed; no engine or web traffic.
const { app, BrowserWindow } = require('electron');
const { build } = require('esbuild');
const fs = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const assert = require('node:assert/strict');
const fixture = fs.mkdtempSync(join(tmpdir(), 'unbiased-browser-tabs-'));
app.setPath('userData', join(fixture, 'profile'));
const deadline = setTimeout(() => { console.error('Browser tab regression timed out'); app.exit(1); }, 40000); deadline.unref();
async function main() {
  const result = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React from 'react';import {createRoot} from 'react-dom/client';import {App} from './src/renderer/src/App';
localStorage.setItem('unbiased.authed','1');window.qaCalls=[];window.qaListeners=new Map();
window.qaEmit=(name,payload)=>{for(const cb of window.qaListeners.get(name)??[])cb(payload)};
window.unbiased=new Proxy({}, {get:(_,key)=>{
 if(String(key).startsWith('on'))return cb=>{const listeners=window.qaListeners.get(key)??new Set();listeners.add(cb);window.qaListeners.set(key,listeners);return ()=>listeners.delete(cb)};
 return async(...args)=>{window.qaCalls.push([key,...args]);if(key==='recentSideChats')return [];if(key==='getEngineStatus')return {state:'starting'};return {ok:true,hasKey:true,projects:[],recents:[],releases:[],tasks:[],memories:[],servers:[],commands:[],entries:[],enabled:[],pals:[],pets:[]}};
}});createRoot(document.getElementById('root')).render(<App/>);
` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'import.meta.glob': '__qaGlob' }, banner: { js: 'var __qaGlob=()=>({});' }, loader: { '.svg': 'dataurl', '.png': 'dataurl', '.webp': 'dataurl' }, plugins: [{ name: 'qa', setup(b) {
    b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
    b.onLoad({ filter: /\.md$/ }, args => ({ contents: fs.readFileSync(args.path, 'utf8'), loader: 'text' }));
  } }] });
  const html = join(fixture, 'index.html');
  fs.writeFileSync(html, `<div id="root"></div><script>${result.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>`);
  await app.whenReady();
  const win = new BrowserWindow({ show: false, width: 1300, height: 850, webPreferences: { backgroundThrottling: false } });
  const errors = []; win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
  const evaluate = async expression => {
    const r = await win.webContents.executeJavaScript(`(async()=>{try{return {ok:true,value:await (0,eval)(${JSON.stringify(expression)})}}catch(e){return {ok:false,error:e.stack??String(e)}}})()`);
    if (!r.ok) throw new Error(r.error + '\nExpression: ' + expression); return r.value;
  };
  const until = async expression => {
    for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 30)); }
    throw new Error('Timed out: ' + expression + '\n' + errors.join('\n'));
  };
  const pr = 'https://github.com/circuitandchisel/unbiased-app/pull/164';
  const other = pr.replace('164', '165');
  const emitLink = url => evaluate(`window.qaEmit('onBrowserOpenLink',{url:${JSON.stringify(url)}})`);
  const state = (id, url) => evaluate(`window.qaEmit('onBrowserState',{id:${id},url:${JSON.stringify(url)},title:${JSON.stringify(url)},canGoBack:false,canGoForward:false,loading:false})`);
  const opens = () => evaluate("window.qaCalls.filter(c=>c[0]==='openBrowser'&&c[1]?.url)");
  const active = id => `document.querySelector('[data-browser-host="${id}"]')?.offsetWidth>0`;
  try {
    await win.loadFile(html);
    await until("window.qaListeners?.get('onBrowserOpenLink')?.size>0&&document.querySelector('[aria-label=Sidebar]')!==null");
    await evaluate(`window.qaEmit('onBrowserOpenLink',{url:${JSON.stringify(pr)}});window.qaEmit('onBrowserOpenLink',{url:${JSON.stringify(pr)}})`);
    await until("document.querySelectorAll('[aria-label=\"Close in-app browser\"]').length===1");
    const first = (await opens())[0][1].id;
    assert.equal((await opens()).length, 1, 'rapid repeat clicks create one native navigation');
    await state(first, pr); await emitLink(other);
    await until("document.querySelectorAll('[aria-label=\"Close in-app browser\"]').length===2");
    const second = (await opens())[1][1].id; await state(second, other); await until(active(second));
    await emitLink(pr); await until(active(first));
    assert.equal((await opens()).length, 2, 'selecting an existing destination does not reload or create a tab');
    await evaluate("document.querySelector('[title=\"Close side panel\"]').click()");
    await until("document.querySelector('[aria-label=\"Side panel\"]').getAttribute('aria-hidden')==='true'");
    await emitLink(other); await until(active(second));
    assert.equal((await opens()).length, 2, 'an existing tab is revealed when the side panel was hidden');
    await state(first, 'https://example.com/away');
    await emitLink(pr); await until("document.querySelectorAll('[aria-label=\"Close in-app browser\"]').length===3");
    const third = (await opens())[2][1].id; await state(third, pr); await until(active(third));
    await evaluate(`[...document.querySelectorAll('.u-side-tab')].find(tab=>tab.querySelector('[aria-current="page"]')).querySelector('[aria-label="Close in-app browser"]').click();window.qaEmit('onBrowserOpenLink',{url:${JSON.stringify(pr)}})`);
    await until("window.qaCalls.filter(c=>c[0]==='openBrowser'&&c[1]?.url).length===4");
    assert.equal((await opens()).length, 4, 'closing and reopening in the same tick cannot select the closed tab');
    const fourth = (await opens())[3][1].id; await state(fourth, pr);
    for (const url of ['https://example.com/four', 'https://example.com/five']) {
      await emitLink(url);
      const id = (await opens()).at(-1)[1].id; await state(id, url);
    }
    await until("document.querySelectorAll('[aria-label=\"Close in-app browser\"]').length===5");
    await emitLink(pr); await until(active(fourth));
    assert.equal((await opens()).length, 6, 'an existing tab is reused even at the tab limit');
    assert.equal(await evaluate("window.qaCalls.filter(c=>c[0]==='openExternal').length"), 0);
    await emitLink('https://example.com/overflow');
    await until("window.qaCalls.filter(c=>c[0]==='openExternal').length===1");
    assert.equal((await opens()).length, 6, 'only new destinations at the cap use the external browser');
    assert.deepEqual(errors.filter(e => !e.includes('Electron Security Warning')), []);
    console.log('PASS: real App focuses existing side-browser tabs without reload, handles rapid repeat clicks and hidden panels, and opens fresh tabs after navigation or close.');
  } finally { win.destroy(); fs.rmSync(fixture, { recursive: true, force: true }); }
}
main().then(() => app.exit(0), error => { console.error(error); app.exit(1); });
