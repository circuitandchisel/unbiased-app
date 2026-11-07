const { homeApiFixture } = require("./home-api-fixture.cjs");
// Real App navigation, drafts and recovery UI; IPC is stubbed, no model calls.
const { app, BrowserWindow } = require('electron');
const { build, transformSync } = require('esbuild');
const fs = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const assert = require('node:assert/strict');
const vm = require('node:vm');

// Exercise the production IPC handler too: a renderer-only fixture cannot
// catch the main process interrupting the side pane during the same handoff.
async function checkMainNavigation() {
  const source = fs.readFileSync('src/main/index.ts', 'utf8');
  const start = source.indexOf('ipcMain.handle("threads:open",');
  const end = source.indexOf('ipcMain.handle("threads:detach",', start);
  assert.ok(start >= 0 && end > start, 'production navigation handler boundaries exist');
  const script = transformSync(source.slice(start,end), { loader: 'ts', target: 'es2022' }).code;
  for (const running of [false, true]) {
    const side = { threadId: 'side-thread', turnId: 'side-turn' };
    const calls = [];
    const state = {
      mainOpenSequence: 0, mainCwd: null, mainTranscriptSession: null,
      panes: { main: { threadId: 'chat-one', turnId: null }, 'side:live': side },
      runningTurns: new Map(running ? [['chat-one','main-turn']] : []), compactingThreads: new Set(), threadCwds: new Map(),
      heldApprovals: new Map(), pendingUserInputs: new Map(), heldErrors: new Map(), bgStream: new Map(), subAgents: new Map(), transcriptSessions: new Map(),
      engine: { request: async (method, params) => { calls.push(method); return { thread: { id: params.threadId, cwd: '/fixture' } }; } },
      resumeParamsFor: async threadId => ({ threadId }),
      settleLocalApprovals: id => calls.push('settle:'+id),
      resetSidePanes: () => { calls.push('reset'); delete state.panes['side:live']; },
      applyRolloutNicknames: () => {}, rolloutNicknames: () => [], rootThreadOf: id => id,
      threadToEntries: () => ({ entries: [], runningTurnStart: null }),
      openTranscriptSession: async () => ({ sessionId: 'session', entries: [], offset: 0, total: 0 }), redactSecrets: value => value,
    };
    let open;
    state.ipcMain = { handle: (name, callback) => { assert.equal(name,'threads:open'); open = callback; } };
    vm.runInNewContext(script, state);
    await open(null, 'chat-one');
    assert.equal(state.panes['side:live'], side, 'same parent preserves live engine pane');
    assert.ok(!calls.some(call => call === 'reset' || call.startsWith('settle:')), 'same parent leaves approvals and side turn intact');
    assert.equal(calls[0], running ? 'thread/read' : 'thread/resume');
    await open(null, 'chat-two');
    assert.equal(state.panes['side:live'], undefined, 'different parent closes side panes');
    assert.ok(calls.includes('reset') && calls.includes('settle:chat-one'));
  }
  const recoveryStart = source.indexOf('ipcMain.handle("side:reopen",');
  const recoveryEnd = source.indexOf('ipcMain.handle("side:reset",', recoveryStart);
  assert.ok(recoveryStart >= 0 && recoveryEnd > recoveryStart);
  const recoveryScript = transformSync(source.slice(recoveryStart,recoveryEnd), { loader: 'ts', target: 'es2022' }).code;
  for (const navigation of ['none','resume','history']) {
    const record = { threadId:'side-thread', parentThreadId:'chat-one', cwd:'/fixture', baselineTurns:2, closedAt:1 };
    let reopened = 0, recover;
    const state = {
      mainOpenSequence:0, panes:{main:{threadId:'chat-one'}}, sideChatReopens:new Set(), threadCwds:new Map(), sideChatInterrupts:new Map(), transcriptSessions:new Map([['session',{}]]),
      sideChatRecents:{get:()=>record,recent:()=>[{paneId:'side:live'}],reopen:()=>{reopened++;return record}},
      engine:{request:async()=>{if(navigation==='resume')state.mainOpenSequence++;return {thread:{turns:[1,2,3]}}}},
      resumeParamsFor:async()=>({}), threadToEntries:thread=>{assert.equal(thread.turns.length,1);return {entries:[]}},
      openTranscriptSession:async()=>{if(navigation==='history')state.mainOpenSequence++;return {sessionId:'session',entries:[]}}, saveSideChatRecents:()=>{}, console,
      ipcMain:{handle:(name,callback)=>{assert.equal(name,'side:reopen');recover=callback}},
    };
    vm.runInNewContext(recoveryScript,state);
    const result=await recover(null,'side:live');
    if(navigation==='none'){
      assert.equal(result.threadId,'side-thread');assert.equal(reopened,1);assert.equal(state.panes['side:live'].threadId,'side-thread');
    }else{
      assert.ok(result.error);assert.equal(reopened,0);assert.equal(state.panes['side:live'],undefined);
      if(navigation==='history')assert.equal(state.transcriptSessions.has('session'),false,'stale transcript session is discarded');
    }
    assert.equal(state.sideChatReopens.size,0,'recovery lock is released');
  }
}
const fixture = fs.mkdtempSync(join(tmpdir(), 'unbiased-side-chat-retention-'));
app.setPath('userData', join(fixture, 'profile'));
const deadline = setTimeout(() => { console.error('Side-chat retention timed out'); app.exit(1); }, 40000); deadline.unref();
(async () => {
  await checkMainNavigation();
  const css = [];
  const bundled = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React from 'react';import {createRoot} from 'react-dom/client';import {App} from './src/renderer/src/App';
localStorage.setItem('unbiased.authed','1');localStorage.setItem('multiViewChats',JSON.stringify(['chat-one','chat-two']));
window.qaCalls=[];window.qaListeners=new Map();window.qaRecents=[];window.qaBrowserTabs=[];
window.qaEmit=(name,payload)=>{for(const cb of window.qaListeners.get(name)??[])cb(payload)};
window.qaRecovery={threadId:'recovered-thread',entries:[{kind:'user',text:'Side question'},{kind:'assistant',text:'Recovered side answer.'}],sessionId:'side-session',offset:0};
const snapshot=id=>({id,entries:[{kind:'user',text:'Prompt '+id},{kind:'assistant',text:'Completed answer '+id}],total:2,offset:0,sessionId:'session-'+id,running:false,approvals:[],userInputs:[]});
window.unbiased=new Proxy({}, {get:(_,key)=>{
 if(String(key).startsWith('on'))return cb=>{const set=window.qaListeners.get(key)??new Set();set.add(cb);window.qaListeners.set(key,set);return()=>set.delete(cb)};
 return async(...args)=>{window.qaCalls.push([key,...args]);${homeApiFixture}
 if(key==='getEngineStatus')return {state:'connected'};
 if(key==='recentSideChats')return window.qaRecents;
 if(key==='sideBrowserTabs')return {root:args[0],tabs:window.qaBrowserTabs};
 if(key==='contextUsage')return {usage:null};if(key==='subagentsList')return {agents:[]};
 if(key==='mountThread')return {...snapshot(args[0]),lease:'lease-'+args[0]};
 if(key==='openThread')return snapshot(args[0]);
 if(key==='reopenSideChat')return new Promise(resolve=>{window.qaReleaseRecovery=()=>{window.qaReleaseRecovery=null;resolve(window.qaRecovery)}});
 return {ok:true,hasKey:true,projects:[],recents:[],releases:[],tasks:[],memories:[],servers:[],commands:[],entries:[],enabled:[],pals:[],pets:[]};};
}});createRoot(document.getElementById('root')).render(<App/>);
` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'import.meta.glob': '__qaGlob' }, banner: { js: 'var __qaGlob=()=>({});' }, loader: { '.svg': 'dataurl', '.png': 'dataurl', '.webp': 'dataurl' }, plugins: [{ name: 'qa', setup(b) {
    b.onLoad({ filter: /\.css$/ }, args => { css.push(fs.readFileSync(args.path, 'utf8')); return { contents: '', loader: 'js' }; });
    b.onLoad({ filter: /\.md$/ }, args => ({ contents: fs.readFileSync(args.path, 'utf8'), loader: 'text' }));
  } }] });
  const styles = [...fs.readFileSync('src/renderer/index.html', 'utf8').matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
  const html = join(fixture, 'index.html');
  fs.writeFileSync(html, `<meta charset="UTF-8"><style>body{margin:0}${styles}${css.join('\n')}</style><div id="root"></div><script>${bundled.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>`);
  await app.whenReady();
  const win = new BrowserWindow({ show: false, width: 1400, height: 900, webPreferences: { backgroundThrottling: false } });
  const errors = []; win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
  const ev = async code => { const r = await win.webContents.executeJavaScript(`(async()=>{try{return {ok:true,value:await(0,eval)(${JSON.stringify(code)})}}catch(e){return {ok:false,error:e.stack??String(e)}}})()`); if (!r.ok) throw Error(r.error); return r.value; };
  const until = async code => { for (let i=0;i<150;i++) { if(await ev(code)) return; await new Promise(r=>setTimeout(r,30)); } throw Error('Timeout: '+code+'\n'+await ev('document.body.innerText.slice(-2200)')); };
  const panel = `document.querySelector('[aria-label="Side panel"]')`;
  const open = async id => { await ev(`window.qaEmit('onPetNoticeOpenThread',{threadId:${JSON.stringify(id)}})`); await until(`document.querySelector('[data-chat-pane-id="main"]').innerText.includes(${JSON.stringify('Completed answer '+id)})&&!document.querySelector('[data-mosaic-chat-id]')`); };
  const mosaic = async () => { await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Mosaic').click()`); await until(`document.querySelector('[data-mosaic-chat-id="chat-one"]')`); };
  const browser = async () => { await ev(`document.querySelector('[title="New in-app browser tab"]').click()`); await until(`document.querySelector('[aria-label="Tools"]')?.innerText.includes('Side chat')`); };
  try {
    await win.loadFile(html); await until(`window.qaListeners.get('onPetNoticeOpenThread')?.size>0`);
    await open('chat-one');
    await ev(`document.querySelector('[title="Open side panel"]').click()`);
    await until(`document.querySelector('[aria-label="Tools"]')?.innerText.includes('Side chat')`);
    await ev(`[...document.querySelectorAll('[aria-label="Tools"] button')].find(b=>b.textContent.trim()==='Side chat').click()`);
    await until(`document.querySelector('[data-pane-id^="side:"][role="textbox"]')`);
    const paneId = await ev(`document.querySelector('[data-pane-id^="side:"][role="textbox"]').dataset.paneId`);
    const composer = `document.querySelector('[data-pane-id="${paneId}"][role="textbox"]')`;
    await ev(`window.qaComposer=${composer};window.qaComposer.focus()`); await win.webContents.insertText('Keep this side draft');
    // Preserve a live side turn, the same DOM/composer and a non-default width.
    await ev(`window.qaEmit('onTurnStarted',{paneId:'${paneId}',turnId:'live-side'});window.qaEmit('onDelta',{paneId:'${paneId}',delta:'Live side reply.'})`);
    await until(`document.querySelector('[data-chat-pane-id="${paneId}"]').innerText.includes('Live side reply.')`);
    const fractionBefore=await ev(`document.querySelector('[aria-label="Resize side panel"]').getAttribute('aria-valuenow')`);
    await ev(`document.querySelector('[aria-label="Resize side panel"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))`);
    await until(`document.querySelector('[aria-label="Resize side panel"]').getAttribute('aria-valuenow')!==${JSON.stringify(fractionBefore)}`);
    await until(`${panel}.getAnimations().every(animation=>animation.playState==='finished')`);
    const width = await ev(`${panel}.getBoundingClientRect().width`);
    const resets = await ev(`window.qaCalls.filter(c=>c[0]==='resetSideChat').length`);
    await mosaic(); assert.equal(await ev(`${panel}.dataset.open`), 'false');
    await ev(`window.qaEmit('onDelta',{paneId:'${paneId}',delta:' More while in Mosaic.'})`);
    await ev(`document.querySelector('[data-mosaic-chat-id="chat-one"] button[title^="Open "]').click()`);
    await until(`${panel}.dataset.open==='true'&&!document.querySelector('[data-mosaic-chat-id]')`);
    assert.equal(await ev(`${composer}===window.qaComposer`), true, 'same mounted side composer survives Mosaic');
    assert.equal(await ev(`${composer}.textContent`), 'Keep this side draft');
    assert.ok(await ev(`document.querySelector('[data-chat-pane-id="${paneId}"]').innerText.includes('More while in Mosaic.')`));
    assert.equal(await ev(`window.qaCalls.filter(c=>c[0]==='resetSideChat').length`), resets, 'same conversation does not close its engine side pane');
    assert.equal(await ev(`window.qaCalls.filter(c=>c[0]==='reopenSideChat').length`), 0, 'returning needs no recovery RPC');
    await until(`${panel}.getAnimations().every(animation=>animation.playState==='finished')`);
    assert.ok(Math.abs(await ev(`${panel}.getBoundingClientRect().width`)-width)<1, 'panel width is retained');
    // A deliberately closed panel stays closed through another round trip.
    await ev(`document.querySelector('[title="Close side panel"]').click()`); await mosaic(); await open('chat-one');
    assert.equal(await ev(`${panel}.dataset.open`), 'false');
    await ev(`document.querySelector('[title="Open side panel"]').click()`);
    await until(`${panel}.dataset.open==='true'`);
    // Browser Recents shows progress while the cold recovery RPC is pending.
    await ev(`window.qaRecents=[{paneId:'side:recovered',threadId:'recovered-thread',parentThreadId:'chat-one',cwd:'/fixture',baselineTurns:0,title:'Saved side chat',closedAt:Date.now()}];window.qaEmit('onSideChatRecents',{chats:window.qaRecents})`);
    await browser();
    await ev(`document.querySelector('[title="Reopen side chat"]').click()`);
    await until(`document.querySelector('[title="Reopen side chat"]').disabled&&document.body.innerText.includes('Reopening side chat…')&&typeof window.qaReleaseRecovery==='function'`);
    await ev(`document.querySelector('[title="Reopen side chat"]').click()`);
    assert.equal(await ev(`window.qaCalls.filter(c=>c[0]==='reopenSideChat').length`),1);
    await ev(`window.qaReleaseRecovery()`);
    await until(`document.querySelector('[data-chat-pane-id="side:recovered"]')?.innerText.includes('Recovered side answer.')`);
    assert.equal(await ev(`${panel}.dataset.open`),'true');
    // A real conversation switch still closes the old side panes.
    await open('chat-two');
    await until(`!document.querySelector('[data-chat-pane-id="${paneId}"]')&&!document.querySelector('[data-chat-pane-id="side:recovered"]')`);
    assert.ok(await ev(`window.qaCalls.some(c=>c[0]==='resetSideChat'&&c[1]==='${paneId}')`));
    // Navigating away during a delayed recovery cannot attach it to the new chat.
    await ev(`window.qaRecents=[{...window.qaRecents[0],parentThreadId:'chat-two'}];window.qaEmit('onSideChatRecents',{chats:window.qaRecents});document.querySelector('[title="Open side panel"]').click()`);
    await until(`document.querySelector('[title="Reopen side chat"]')`);
    await ev(`document.querySelector('[title="Reopen side chat"]').click()`); await until(`typeof window.qaReleaseRecovery==='function'`);
    await open('chat-one'); await ev(`window.qaReleaseRecovery()`);
    await ev(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    assert.equal(await ev(`!!document.querySelector('[data-chat-pane-id="side:recovered"]')`),false);
    assert.ok(await ev(`window.qaCalls.some(c=>c[0]==='resetSideChat'&&c[1]==='side:recovered')`),'stale completed recovery remains recoverable');
    // A recent side chat from another parent still opens its original chat.
    await ev(`document.querySelector('[title="Open side panel"]').click()`);
    await until(`document.querySelector('[title="Reopen side chat"]')`);
    await ev(`document.querySelector('[title="Reopen side chat"]').click()`);
    await until(`typeof window.qaReleaseRecovery==='function'&&document.querySelector('[data-chat-pane-id="main"]').innerText.includes('Completed answer chat-two')`);
    await ev(`window.qaReleaseRecovery()`);
    await until(`document.querySelector('[data-chat-pane-id="side:recovered"]')?.innerText.includes('Recovered side answer.')&&${panel}.dataset.open==='true'`);
    // Approved scoped browser activity reopens a retained but closed mirror.
    await ev(`window.qaEmit('onAgentMirrorActivity',{tool:'browser_open',threadId:'chat-two'})`);
    await until(`${panel}.dataset.open==='true'&&window.qaCalls.some(c=>c[0]==='agentMirrorStart'&&c[1].threadId==='chat-two')`);
    await ev(`document.querySelector('[title="Close side panel"]').click()`);
    await until(`${panel}.dataset.open==='false'`);
    await ev(`window.qaEmit('onAgentMirrorActivity',{tool:'browser_open',threadId:'other-chat'});window.qaEmit('onAgentMirrorActivity',{tool:'launch'})`);
    await ev(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    assert.equal(await ev(`${panel}.dataset.open`),'false','foreign and unscoped launch events stay quiet');
    const mirrorStarts=await ev(`window.qaCalls.filter(c=>c[0]==='agentMirrorStart').length`);
    await ev(`window.qaEmit('onAgentMirrorActivity',{tool:'browser_read',threadId:'chat-two'})`);
    await until(`${panel}.dataset.open==='true'&&window.qaCalls.filter(c=>c[0]==='agentMirrorStart').length>${mirrorStarts}`);
    // Already-visible work in another tab keeps its focus and custom width.
    await browser();
    await until(`${panel}.getAnimations().every(animation=>animation.playState==='finished')`);
    const widthBeforeResize=await ev(`${panel}.getBoundingClientRect().width`);
    await ev(`document.querySelector('[aria-label="Resize side panel"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))`);
    await until(`Math.abs(${panel}.getBoundingClientRect().width-${widthBeforeResize})>1`);
    await ev(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    await until(`${panel}.getAnimations().every(animation=>animation.playState==='finished')`);
    const browserWidth=await ev(`${panel}.getBoundingClientRect().width`);
    const beforeActivity=await ev(`window.qaCalls.filter(c=>c[0]==='agentMirrorStart').length`);
    await ev(`window.qaEmit('onAgentMirrorActivity',{tool:'browser_snapshot',threadId:'chat-two'})`);
    await ev(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    assert.equal(await ev(`window.qaCalls.filter(c=>c[0]==='agentMirrorStart').length`),beforeActivity,'do not steal an already visible browser tab');
    await until(`${panel}.getAnimations().every(animation=>animation.playState==='finished')`);
    assert.ok(Math.abs(await ev(`${panel}.getBoundingClientRect().width`)-browserWidth)<1);
    // First-turn activity can precede adoption of the newly created thread.
    await ev(`window.qaEmit('onAppCommand','new-chat')`);
    await until(`window.qaCalls.some(c=>c[0]==='detachThread')&&!document.querySelector('[data-chat-pane-id="main"]').innerText.includes('Completed answer chat-two')&&${panel}.dataset.open==='false'`);
    await ev(`window.qaEmit('onAgentMirrorActivity',{tool:'browser_open',threadId:'fresh-browser-chat'})`);
    await ev(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    assert.equal(await ev(`${panel}.dataset.open`),'false','wait for the new thread ID rather than opening a foreign panel');
    await open('fresh-browser-chat');
    await until(`${panel}.dataset.open==='true'&&window.qaCalls.some(c=>c[0]==='agentMirrorStart'&&c[1].threadId==='fresh-browser-chat')`);
    assert.deepEqual(errors.filter(e=>!e.includes('Electron Security Warning')),[]);
    console.log('PASS: Mosaic retains live side chat, stream, draft, DOM, panel width and closed preference without recovery RPC; Recents progress, duplicate suppression, restore and navigation isolation; scoped Agent Browser reopening, background isolation, first-turn adoption and visible-tab/width retention.');
  } finally { win.destroy(); fs.rmSync(fixture,{recursive:true,force:true}); }
})().then(()=>app.exit(0),error=>{console.error(error);app.exit(1)});
