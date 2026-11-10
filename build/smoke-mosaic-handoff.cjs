const { homeApiFixture } = require("./home-api-fixture.cjs");
// Real App navigation and live ChatPane state; mock IPC, no agent or network.
const { app, BrowserWindow } = require('electron');
const { build } = require('esbuild');
const fs = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const assert = require('node:assert/strict');
const fixture=fs.mkdtempSync(join(tmpdir(),'unbiased-mosaic-handoff-'));app.setPath('userData',join(fixture,'profile'));
const deadline=setTimeout(()=>{console.error('Mosaic handoff timed out');app.exit(1)},30000);deadline.unref();
(async()=>{
 const css=[];
 const bundled=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';import {App} from './src/renderer/src/App';
localStorage.setItem('accessMode','full');localStorage.setItem('unbiased.authed','1');localStorage.setItem('multiViewChats',JSON.stringify(['chat-one','chat-two']));
window.qaModes={defaultMode:'full',threads:{'chat-one':'full','chat-two':'full'}};window.qaNow=Date.now();Date.now=()=>window.qaNow;window.qaRunning={};window.qaStream={};window.qaApproval={};window.qaCalls=[];window.qaListeners=new Map();
window.qaEmit=(name,payload)=>{for(const cb of window.qaListeners.get(name)??[])cb(payload)};
const base=[{kind:'user',text:'Earlier prompt'},{kind:'assistant',text:'Earlier completed answer.'}];
const snapshot=id=>{const approval=window.qaApproval[id];const entries=window.qaRunning[id]?[...base,{kind:'user',text:'Current request for '+id},...(approval?[{kind:'command',itemId:'qa-command',command:approval.command,status:'awaitingApproval',approval}]:[])]:base;return {id,entries,total:entries.length,offset:0,sessionId:'session-'+id,running:!!window.qaRunning[id],streamText:window.qaStream[id]??'',approvals:approval?[approval]:[],userInputs:[],runningTurnStart:window.qaRunning[id]?3:null,runningTurnStartedAt:window.qaRunning[id]?window.qaNow-45000:null}};
window.unbiased=new Proxy({}, {get:(_,key)=>{
 if(String(key).startsWith('on'))return cb=>{const set=window.qaListeners.get(key)??new Set();set.add(cb);window.qaListeners.set(key,set);return()=>set.delete(cb)};
 return async(...args)=>{window.qaCalls.push([key,...args]);${homeApiFixture}
 if(key==='getAccessModes')return window.qaModes;
 if(key==='setAccessMode'){if(args[1])window.qaModes.threads[args[1]]=args[0];else window.qaModes.defaultMode=args[0];return {mode:args[0]}}
 if(key==='recentSideChats')return [];if(key==='getEngineStatus')return {state:'connected'};
 if(key==='sideBrowserTabs')return {root:args[0],tabs:[]};if(key==='contextUsage')return {usage:null};
 if(key==='liveApprovals')return {requestIds:['qa-approval']};if(key==='liveUserInputs')return {requestIds:[]};if(key==='subagentsList')return {agents:[]};
 if(key==='mountThread')return {...snapshot(args[0]),lease:'lease-'+args[0]};
 if(key==='openThread'){
   if(window.qaHoldOpen)return new Promise(resolve=>{window.qaReleaseOpen=()=>{window.qaReleaseOpen=null;resolve({...snapshot(args[0]),runningTurnStartedAt:null})}});
   return {...snapshot(args[0]),runningTurnStartedAt:null};
 }
 return {ok:true,hasKey:true,projects:[],recents:[],releases:[],tasks:[],memories:[],servers:[],commands:[],entries:[],enabled:[],pals:[],pets:[]};};
}});createRoot(document.getElementById('root')).render(<App/>);
`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'import.meta.glob':'__qaGlob'},banner:{js:'var __qaGlob=()=>({});'},loader:{'.svg':'dataurl','.png':'dataurl','.webp':'dataurl'},plugins:[{name:'qa',setup(b){
 b.onLoad({filter:/\.css$/},args=>{css.push(fs.readFileSync(args.path,'utf8'));return {contents:'',loader:'js'}});
 b.onLoad({filter:/\.md$/},args=>({contents:fs.readFileSync(args.path,'utf8'),loader:'text'}));
}}]});
 const baseStyles=[...fs.readFileSync('src/renderer/index.html','utf8').matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
 const html=join(fixture,'index.html');fs.writeFileSync(html,`<!doctype html><style>body{margin:0}${baseStyles}${css.join('\n')}</style><div id="root"></div><script>${bundled.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`);
 await app.whenReady();const win=new BrowserWindow({show:false,width:1350,height:900,webPreferences:{backgroundThrottling:false}});
 const errors=[];win.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message)});
 const ev=async code=>{const r=await win.webContents.executeJavaScript(`(async()=>{try{return {ok:true,value:await(0,eval)(${JSON.stringify(code)})}}catch(e){return {ok:false,error:e.stack??String(e)}}})()`);if(!r.ok)throw Error(r.error);return r.value};
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async(code)=>{for(let i=0;i<100;i++){if(await ev(code))return;await pause(30)}throw Error('Timeout: '+code+'\n'+errors.join('\n')+'\n'+await ev('document.body.innerText.slice(-1600)'))};
 const mainText=()=>ev(`document.querySelector('[data-chat-pane-id="main"]').innerText`);
 const mosaic=async()=>{await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Mosaic').click()`);await until(`document.querySelector('[data-mosaic-chat-id="chat-one"] [data-virtuoso-scroller]')&&document.querySelector('[data-mosaic-chat-id="chat-two"] [data-virtuoso-scroller]')`)};
 try{
 await win.loadFile(html);await until(`window.qaListeners.get('onPetNoticeOpenThread')?.size>0`);
 await ev(`window.qaEmit('onPetNoticeOpenThread',{threadId:'chat-one'})`);await until(`document.querySelector('[data-chat-pane-id="main"]').innerText.includes('Earlier completed answer.')`);
 await ev(`window.qaRunning['chat-one']=true`);await mosaic();
 const mountsBeforeRecovery=await ev(`window.qaCalls.filter(c=>c[0]==='mountThread').length`);
 await ev(`window.qaEmit('onSshReconcile',{threadIds:['another-host-thread']})`);await pause(60);
 assert.equal(await ev(`window.qaCalls.filter(c=>c[0]==='mountThread').length`),mountsBeforeRecovery,'unrelated remote recovery does not remount Mosaic tiles');
 await ev(`window.qaEmit('onSshReconcile',{threadIds:['chat-one']})`);
 await until(`window.qaCalls.filter(c=>c[0]==='mountThread').length===${mountsBeforeRecovery+1}`);
 assert.equal(await ev(`window.qaCalls.filter(c=>c[0]==='mountThread').at(-1)[1]`),'chat-one','only the recovered host conversation reloads history');
 const pill=id=>`document.querySelector('[data-mosaic-chat-id="${id}"] [title="How should Pareto actions be approved?"]')`;
 const chooseMode=async(id,label)=>{
   await ev(pill(id)+'.click()');
   await ev(`Array.from(document.querySelectorAll('[data-mosaic-chat-id="${id}"] button')).find(b=>b.textContent.trim().startsWith(${JSON.stringify(label)})).click()`);
 };
 await until(pill('chat-one')+"?.textContent.includes('Full access')");
 await chooseMode('chat-one','Approve for me');
 await until(pill('chat-one')+".textContent.includes('Approve for me')");
 assert.ok(await ev(pill('chat-two')+".textContent.includes('Full access')"),'changing one tile leaves its neighbor untouched');
 assert.ok(await ev(`window.qaCalls.some(c=>c[0]==='setAccessMode'&&c[1]==='auto'&&c[2]==='chat-one')`),'IPC targets the chosen conversation');
 await chooseMode('chat-two','Ask for approval');
 assert.ok(await ev(pill('chat-one')+".textContent.includes('Approve for me')"));
 await chooseMode('chat-two','Full access');
 await until(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Confirm')`);
 assert.ok(await ev(pill('chat-two')+".textContent.includes('Ask for approval')"),'Full access needs confirmation');
 await ev(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Cancel').click()`);
 assert.equal(await ev(`window.qaModes.threads['chat-two']`),'ask');
 await chooseMode('chat-two','Full access');
 await until(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Confirm')`);
 await ev(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Confirm').click()`);
 await until(pill('chat-two')+".textContent.includes('Full access')");
 assert.ok(await ev(pill('chat-one')+".textContent.includes('Approve for me')"),'confirmation changes its captured tile rather than the active main chat');
 await chooseMode('chat-two','Ask for approval');
 // The main pane is still mounted but hidden. A turn begun in Mosaic must
 // carry its stream and clock when returning to that SAME selected thread.
 await pause(100);await ev(`window.qaNow+=28000`);await pause(150);
 await until(`document.querySelector('[data-mosaic-chat-id="chat-one"]').innerText.includes('1m 13s')`);
 await ev(`window.qaStream['chat-one']='Partial reply from Mosaic.';for(const paneId of ['main','multi:chat-one'])window.qaEmit('onDelta',{paneId,delta:'Partial reply from Mosaic.'});window.qaHoldOpen=true;document.querySelector('[title="Open New chat outside Mosaic"]').click()`);
 await until(`typeof window.qaReleaseOpen==='function'`);
 assert.equal(await ev(`!!document.querySelector('[data-mosaic-chat-id="chat-one"]')`),true,'source stays mounted during handoff');
 await ev(`window.qaNow+=1000;window.qaStream['chat-one']+=' Tail received while opening.';for(const paneId of ['main','multi:chat-one'])window.qaEmit('onDelta',{paneId,delta:' Tail received while opening.'});window.qaReleaseOpen();window.qaHoldOpen=false`);
 await until(`!document.querySelector('[data-mosaic-chat-id]')`);
 assert.ok(await ev(`document.querySelector('[data-chat-pane-id="main"] [title="How should Pareto actions be approved?"]').textContent.includes('Approve for me')`),'individual view retains the conversation permission');
 await until(`document.querySelector('[data-chat-pane-id="main"]').innerText.includes('1m 14s')`);
 assert.ok((await mainText()).includes('Partial reply from Mosaic. Tail received while opening.'));
 // The elapsed display updates on an interval. Wait for its observable
 // result instead of assuming the CI renderer paints within 150 ms.
 await ev(`window.qaNow+=2000;window.qaEmit('onDelta',{paneId:'main',delta:' More text after navigation.'})`);
 await until(`document.querySelector('[data-chat-pane-id="main"]').innerText.includes('1m 16s')`);
 assert.ok((await mainText()).includes('More text after navigation.'));
 // A different Mosaic conversation can still be thinking with no text yet.
 await ev(`window.qaRunning['chat-two']=true`);await mosaic();
 await until(`document.querySelector('[data-mosaic-chat-id="chat-two"]').innerText.includes('45s')`);
 await ev(`document.querySelector('[data-mosaic-chat-id="chat-two"] button[title^="Open "]').click()`);
 await until(`!document.querySelector('[data-mosaic-chat-id]')`);
 await until(`document.querySelector('[data-chat-pane-id="main"]').innerText.includes('thinking… 45s')`);
 await ev(`window.qaNow+=3000;window.qaStream['chat-two']='First text after thinking.';window.qaEmit('onDelta',{paneId:'main',delta:window.qaStream['chat-two']})`);await pause(150);
 await until(`document.querySelector('[data-chat-pane-id="main"]').innerText.includes('48s')`);assert.ok((await mainText()).includes('First text after thinking.'));
 await ev(`window.qaRunning['chat-two']=false;window.qaEmit('onTurnCompleted',{paneId:'main',status:'completed'})`);await pause(150);
 assert.equal((await mainText()).includes('thinking…'),false);
 assert.ok((await mainText()).includes('Worked for 48s'),'completed duration uses the original turn start');
 // Approval waits pause the active clock; reopening must not replace that
 // duration with wall time since the turn started.
 await ev(`window.qaRunning['chat-two']=true;window.qaStream['chat-two']='';window.qaApproval['chat-two']={requestId:'qa-approval',kind:'command',itemId:'qa-command',command:'echo example',cwd:'/fixture',reason:'Approve the example command'}`);await mosaic();
 await until(`document.querySelector('[data-mosaic-chat-id="chat-two"]').innerText.includes('Allow once')`);await pause(150);
 await ev(`window.qaNow+=90000`);await pause(150);
 assert.ok((await ev(`document.querySelector('[data-mosaic-chat-id="chat-two"]').innerText`)).includes('45s'));
 await ev(`document.querySelector('[data-mosaic-chat-id="chat-two"] button[title^="Open "]').click()`);
 await until(`!document.querySelector('[data-mosaic-chat-id]')`);
 await until(`document.querySelector('[data-chat-pane-id="main"]').innerText.includes('Allow once')`);
 assert.ok((await mainText()).includes('45s'),'paused duration survives instead of resetting or counting the wait');
 // A mirror receives a normal turn-start without invoking its own sendNow.
 await ev(`window.qaEmit('onTurnCompleted',{paneId:'main',status:'completed'});window.qaApproval['chat-two']=null`);await pause(100);
 await ev(`window.qaEmit('onTurnStarted',{paneId:'main',turnId:'mirrored-normal'})`);await pause(100);
 await ev(`window.qaNow+=3000`);await pause(150);
 await until(`document.querySelector('[data-chat-pane-id="main"]').innerText.includes('thinking… 3s')`);
 assert.deepEqual(errors,[]);
 fs.writeFileSync(join(fixture,'handoff.png'),(await win.webContents.capturePage()).toPNG());
 console.log('PASS: independent tile permissions, scoped Full Access confirmation and permission handoff; same-thread Mosaic handoff refreshes live state; source stays mounted during load; in-flight text and subsequent deltas survive; thinking-only and paused-approval clocks carry over; mirrored starts initialize timing. Artifacts: '+fixture);
 }finally{win.destroy();clearTimeout(deadline);app.quit()}
})().catch(error=>{console.error(error);app.exit(1)});
