// Regression: optional nested-chat support must never gate local annotations.
// Bundles the real ChatPane with mocked IPC; no engine or external navigation.
const {app,BrowserWindow}=require('electron');
const {build}=require('esbuild');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const root=process.cwd();
const deadline=setTimeout(()=>{console.error('Transcript annotation regression timed out');app.exit(1)},30000);deadline.unref();
const bundleResult=build({stdin:{resolveDir:root,loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {ChatPane,MultiViewTile} from './src/renderer/src/App';
window.qaCopied=[];Object.defineProperty(navigator,"clipboard",{value:{writeText:async text=>window.qaCopied.push(text)}});window.qaCalls=[];window.qaListeners=new Map();window.qaEmit=(name,payload)=>{for(const cb of window.qaListeners.get(name)??[])cb(payload)};window.qaKeyEvents=[];document.addEventListener('keydown',e=>window.qaKeyEvents.push({key:e.key,code:e.code,keyCode:e.keyCode,trusted:e.isTrusted,target:e.target.outerHTML?.slice(0,150)}),true);
window.unbiased=new Proxy({}, {get:(_,key)=>{
 if(String(key).startsWith('on'))return cb=>{const listeners=window.qaListeners.get(key)??new Set();listeners.add(cb);window.qaListeners.set(key,listeners);return ()=>listeners.delete(cb)};
 return async(...args)=>{window.qaCalls.push([key,...args]);if(key==='slashCommands')return {commands:[{id:'review',command:'CodeReview',label:'Code Review',description:'Review standards and spec',source:args[0]==='main'?'Unbiased':'This project',skill:{name:'code-review',path:'/qa/'+args[0]+'/code-review/SKILL.md'}},{id:'style',command:'CodeStyle',label:'Code Style',description:'Check style',source:'Shared',skill:{name:'code-style',path:'/qa/style/SKILL.md'}}],error:null};if(key==='mountThread')return {lease:'qa-lease',entries,running:!!window.qaMosaicCompacting,compacting:!!window.qaMosaicCompacting};if(key==='contextUsage')return null;if(key==='mcpThreadGet')return {enabled:[]};if(key==='liveApprovals'||key==='liveUserInputs')return [];if(key==='fileExists')return {exists:false};if(key==='favicon')return {dataUrl:null};return {};};
}});
const entries=[{kind:'assistant',text:'Select this side chat excerpt.\\n\\nSee [example link](https://example.com/side-chat).'}];
const side={paneId:'side:qa',connected:true,canTypeToFocus:()=>false,reset:{entries,nonce:0},emptyState:null,accessMode:'untrusted',onAccessModeChange:()=>{},planMode:false,onTogglePlanMode:()=>{}};
const mosaic={...side,id:'qa-mosaic',columnSpan:1,fresh:false,project:null,projects:[],title:'Mosaic QA',onSelectEnvironment:async()=>{},onCreateProject:()=>{},onOpenChat:()=>{},onRemove:()=>{},onTurnLanded:()=>{}};
const main={...side,paneId:'main',onAskSideChat:text=>window.qaCalls.push(['askSide',text])};
const root=createRoot(document.getElementById('root'));
const render=(reset=main.reset,key='main')=>root.render(<><section id="side"><ChatPane {...side}/></section><section id="main"><ChatPane key={key} {...main} reset={reset}/></section><section id="mosaic"><MultiViewTile key={window.qaMosaicKey??0} {...mosaic}/></section></>);
window.qaRestoreMain=(seconds,nonce,key='main',compacting=false)=>render({...main.reset,nonce,compacting,resume:seconds===null?null:{running:true},runningTurnStart:0,runningTurnStartedAt:seconds===null?null:Date.now()-seconds*1000},key);
window.qaRunningCopy=()=>render({...main.reset,nonce:20,entries:[{kind:'user',text:'Earlier question'},{kind:'assistant',text:'Earlier completed answer'},{kind:'user',text:'Current question'},{kind:'assistant',text:'Current streaming answer'}],resume:{running:true,approvals:[],userInputs:[]},runningTurnStart:3,runningTurnStartedAt:Date.now()-1000},'copy-main');
window.qaReopenMosaic=compacting=>{window.qaMosaicCompacting=compacting;window.qaMosaicKey=(window.qaMosaicKey??0)+1;render()};
render();
`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'import.meta.glob':'__qaGlob'},banner:{js:'var __qaGlob=()=>({});'},loader:{'.svg':'dataurl','.png':'dataurl','.webp':'dataurl'},plugins:[{name:'qa',setup(build){
 build.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));
 build.onLoad({filter:/\.md$/},args=>({contents:fs.readFileSync(args.path,'utf8'),loader:'text'}));
 build.onLoad({filter:/\/src\/renderer\/src\/App\.tsx$/},args=>({contents:fs.readFileSync(args.path,'utf8')+'\nexport { ChatPane, MultiViewTile };',loader:'tsx'}));
}}]});
(async()=>{
 const bundle=(await bundleResult).outputFiles[0].text;
 await app.whenReady();const win=new BrowserWindow({show:false,width:1500,height:720,webPreferences:{backgroundThrottling:false}});
 const css=fs.readFileSync(root+'/src/renderer/src/transcript-action-dock.css','utf8')+fs.readFileSync(root+'/src/renderer/src/chat-link.css','utf8');
 const html=`<!doctype html><style>body{margin:0;background:#111;color:#eee;font:14px system-ui;--bg:#111;--fg:#eee;--fg-msg:#ddd;--panel:#222;--panel-2:#282828;--chip:#252525;--chip-raised:#333;--border:#333;--dim:#999;--accent:#FF7764;--font-ui:system-ui;--font-code:monospace}#root{display:flex;height:680px;gap:20px}#root>section{display:flex;flex-direction:column;width:480px;height:650px;position:relative}#root>#mosaic{display:grid;grid-template-rows:minmax(0,1fr)}${css}</style><div id="root"></div><script>${bundle.replaceAll('</script','<\\/script')}</script>`;
 fs.writeFileSync('/tmp/unbiased-side-annotation.html',html);await win.loadFile('/tmp/unbiased-side-annotation.html');
 // Electron otherwise replaces renderer exceptions with a generic IPC error.
 // Preserve the failing expression and original stack for CI diagnostics.
 const evaluate=win.webContents.executeJavaScript.bind(win.webContents);
 win.webContents.executeJavaScript=async(source,...args)=>{
   const result=await evaluate(`(async()=>{try{return {ok:true,value:await (0,eval)(${JSON.stringify(source)})}}catch(error){return {ok:false,error:error.stack??String(error)}}})()`,...args);
   if(!result.ok)throw new Error(result.error+'\nRenderer expression: '+source);
   return result.value;
 };
 // Map the CI window so trusted browser keyboard input reaches its widget.
 // showInactive does not take focus away from another application.
 if(process.env.CI)win.showInactive();
 win.webContents.debugger.attach('1.3');
 await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});

 const pause=()=>new Promise(r=>setTimeout(r,100));
 const until=async(check,message)=>{
   for(let attempt=0;attempt<30;attempt++){if(await check())return;await pause();}
   const diagnostics=await win.webContents.executeJavaScript("({sends:window.qaCalls.filter(c=>c[0]==='sendMessage'),sideText:document.querySelector('#side').innerText,keys:window.qaKeyEvents,activeElement:document.activeElement?.outerHTML?.slice(0,500),mainText:document.querySelector('#main').innerText,copyAnswers:[...document.querySelectorAll('#main button[aria-label=\"Copy reply\"]')].map(b=>b.parentElement.parentElement.textContent)})");
   assert.fail(message+JSON.stringify(diagnostics));
 };
 const exists=selector=>win.webContents.executeJavaScript(`!!document.querySelector(${JSON.stringify(selector)})`);
 const click=async selector=>{
   await until(()=>exists(selector),'control must mount before clicking: '+selector);
   await win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).click()`);
 };
 const select=async id=>{
   await until(()=>win.webContents.executeJavaScript(`[...document.querySelectorAll('#${id} p')].some(p=>p.textContent==='Select this side chat excerpt.')`),'transcript must mount before selecting in '+id);
   await until(async()=>{
   await win.webContents.executeJavaScript(`(()=>{const node=[...document.querySelectorAll('#${id} p')].find(p=>p.textContent==='Select this side chat excerpt.');const range=document.createRange();range.selectNodeContents(node);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);node.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));})()`);
   return exists('#'+id+' .transcript-action');
   },'selection toolbar must mount in '+id);
 };
 const annotationCount=id=>win.webContents.executeJavaScript(`document.querySelectorAll('#${id} button[aria-label="Remove annotation"]').length`);
 const typeComment=async(id,text)=>{
   await until(()=>exists('#'+id+' textarea[aria-label="Annotation comment"]'),'comment editor must mount in '+id);
   await win.webContents.executeJavaScript(`(()=>{const input=document.querySelector('#${id} textarea[placeholder="Add an optional comment…"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
   await pause();
 };
 await select('side');
 const sideLabels=await win.webContents.executeJavaScript("[...document.querySelectorAll('#side .transcript-action')].map(b=>b.textContent)");
 assert.deepEqual(sideLabels,['Add to chat']);
 await click('#side .transcript-action');
 await until(()=>exists('#side textarea[aria-label="Annotation comment"]'),'Add to chat must open the side comment editor');
 assert.equal(await win.webContents.executeJavaScript("!!document.querySelector('#side textarea[placeholder=\"Add an optional comment…\"]')"),true);
 assert.equal(await annotationCount('side'),1,'Add to chat must attach the excerpt before confirming its comment');
 assert.equal(await win.webContents.executeJavaScript("document.querySelector('#side button[aria-label=\"Send\"]').disabled"),false,'an excerpt alone is immediately sendable');
 if(process.env.UNBIASED_TRANSCRIPT_ACTIONS_SCREENSHOT) fs.writeFileSync(process.env.UNBIASED_TRANSCRIPT_ACTIONS_SCREENSHOT,(await win.webContents.capturePage()).toPNG());
 // Real layout: wrap naturally, cap at seven lines, then scroll and fade.
 const metrics=()=>win.webContents.executeJavaScript(`(()=>{const el=document.querySelector('#side textarea[aria-label="Annotation comment"]');return {height:el.clientHeight,scroll:el.scrollHeight,line:parseFloat(getComputedStyle(el).lineHeight),fade:el.parentElement.dataset.fade};})()`);
 const oneLine=await metrics();
 await typeComment('side','A longer annotation that wraps naturally as more words are added to the comment. '.repeat(2));
 const wrapped=await metrics();
 assert.ok(wrapped.height>oneLine.height,'comment must grow with wrapped text');
 await typeComment('side',Array.from({length:12},(_,i)=>'Comment line '+(i+1)).join('\n'));
 const capped=await metrics();
 assert.equal(capped.height,capped.line*7,'editor must stop growing at seven lines');
 assert.ok(capped.scroll>capped.height,'longer comments must scroll');
 assert.equal(capped.fade,'true','overflow must fade at the seventh line');
 await win.webContents.executeJavaScript(`(()=>{const el=document.querySelector('#side textarea[aria-label="Annotation comment"]');el.scrollTop=el.scrollHeight;el.dispatchEvent(new Event('scroll',{bubbles:true}));})()`);
 await pause();
 assert.equal((await metrics()).fade,'false','fade clears at the bottom so the last line is readable');
 if(process.env.UNBIASED_TRANSCRIPT_ACTIONS_SCREENSHOT) fs.writeFileSync(process.env.UNBIASED_TRANSCRIPT_ACTIONS_SCREENSHOT,(await win.webContents.capturePage()).toPNG());
 await typeComment('side','Explain this selection');
 assert.equal((await metrics()).height,oneLine.height,'editor shrinks when text is shortened');
 await click('#side button[title="Add annotation"]');
 await until(async()=>!(await exists('#side textarea[aria-label="Annotation comment"]')),'confirmation must close the comment editor');
 assert.equal(await win.webContents.executeJavaScript("document.querySelectorAll('#side button[aria-label=\"Remove annotation\"]').length"),1,'confirmed text attaches to the side composer');
 await select('main');
 const mainLabels=await win.webContents.executeJavaScript("[...document.querySelectorAll('#main .transcript-action')].map(b=>b.textContent)");assert.deepEqual(mainLabels,['Add to chat','Ask in side chat']);
 await win.webContents.executeJavaScript("[...document.querySelectorAll('#main .transcript-action')].find(b=>b.textContent==='Ask in side chat').click()");
 assert.equal(await win.webContents.executeJavaScript("window.qaCalls.filter(c=>c[0]==='askSide').at(-1)?.[1]"),'Select this side chat excerpt.');
 await win.webContents.executeJavaScript("document.querySelector('#side a[href]').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))");
 await new Promise(r=>setTimeout(r,100));
 const linkLabels=await win.webContents.executeJavaScript("[...document.querySelectorAll('#side .transcript-action')].map(b=>b.textContent)");
 assert.deepEqual(linkLabels,['Add to chat','Default browser']);
 await click('#side .transcript-action');
 await new Promise(r=>setTimeout(r,100));
 assert.equal(await win.webContents.executeJavaScript("document.querySelectorAll('#side button[aria-label=\"Remove annotation\"]').length"),2,'link attaches to the same side composer');
 assert.equal(await win.webContents.executeJavaScript("document.querySelectorAll('#main button[aria-label=\"Remove annotation\"]').length"),0,'side annotations must not appear in main');
 // Confirmed annotations, including comments, reach the actual IPC boundary.
 await click('#side button[aria-label="Send"]');
 await pause();
 const sentSide=await win.webContents.executeJavaScript("window.qaCalls.find(c=>c[0]==='sendMessage'&&c[1]==='side:qa')");
 assert.ok(sentSide,'side annotation message must be sent');
 assert.match(sentSide[2],/> Select this side chat excerpt\./);
 assert.match(sentSide[2],/Comment: Explain this selection/);
 assert.match(sentSide[2],/https:\/\/example\.com\/side-chat/);
 assert.equal(await annotationCount('side'),0);
 // Pending removal and Escape cancel only the in-progress attachment.
 await select('main');
 await click('#main .transcript-action');
 await pause();assert.equal(await annotationCount('main'),1);
 await click('#main button[aria-label="Remove annotation"]');
 await pause();assert.equal(await annotationCount('main'),0);
 assert.equal(await win.webContents.executeJavaScript("!!document.querySelector('#main textarea[placeholder=\"Add an optional comment…\"]')"),false);
 await select('main');
 await click('#main .transcript-action');
 await until(()=>win.webContents.executeJavaScript("!!document.querySelector('#main textarea[placeholder=\"Add an optional comment…\"]')"),'comment editor must mount before Escape');
 await win.webContents.executeJavaScript("document.querySelector('#main textarea[placeholder=\"Add an optional comment…\"]').focus()");
 // Use browser keyboard input rather than an untrusted DOM KeyboardEvent.
 await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await until(async()=>await annotationCount('main')===0,'Escape must remove the pending annotation');
 // Sending without the checkmark still includes the latest optional comment.
 await select('main');
 await click('#main .transcript-action');
 await typeComment('main','Comment still being edited\nWith a second line');
 await click('#main button[aria-label="Send"]');
 await pause();
 const sentMain=await win.webContents.executeJavaScript("window.qaCalls.find(c=>c[0]==='sendMessage'&&c[1]==='main')");
 assert.ok(sentMain,'pending annotation must be sendable before the checkmark');
 assert.match(sentMain[2],/Comment: Comment still being edited\nWith a second line/);
 assert.equal(sentMain[2].split('> Select this side chat excerpt.').length-1,1,'confirmation/send must not duplicate the excerpt');
 assert.equal(await annotationCount('main'),0);
 assert.equal(await win.webContents.executeJavaScript("!!document.querySelector('#main textarea[placeholder=\"Add an optional comment…\"]')"),false,'sending closes the pending comment editor');
 // Exercise the actual Mosaic tile, including thread mounting and clipping.
 await select('mosaic');
 assert.deepEqual(await win.webContents.executeJavaScript("[...document.querySelectorAll('#mosaic .transcript-action')].map(b=>b.textContent)"),['Add to chat'],'Mosaic selection offers only Add to chat');
 const visible=await win.webContents.executeJavaScript(`(()=>{const button=document.querySelector('#mosaic .transcript-action');const r=button.getBoundingClientRect();return button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()`);
 assert.equal(visible,true,'Mosaic Add to chat must be visible and clickable inside the tile');
 await click('#mosaic .transcript-action');
 await pause();
 assert.equal(await annotationCount('mosaic'),1,'Mosaic attaches the excerpt immediately to its own composer');
 assert.equal(await annotationCount('main'),0);
 assert.equal(await annotationCount('side'),0);
 await typeComment('mosaic','Explain this Mosaic excerpt');
 await click('#mosaic button[aria-label="Send"]');
 await pause();
 const sentMosaic=await win.webContents.executeJavaScript("window.qaCalls.find(c=>c[0]==='sendMessage'&&c[1]==='multi:qa-mosaic')");
 assert.ok(sentMosaic,'Mosaic annotation must reach its own chat');
 assert.match(sentMosaic[2],/> Select this side chat excerpt\./);
 assert.match(sentMosaic[2],/Comment: Explain this Mosaic excerpt/);
 // Reopening an existing turn and switching busy->busy must restore its clock.
 const readClock=async()=>{
   const text=await win.webContents.executeJavaScript("document.querySelector('#main').innerText");
   const match=text.match(/(?:thinking|waiting)… (?:(\d+)m )?(\d+)s/);
   return match?Number(match[1]??0)*60+Number(match[2]):null;
 };
 await win.webContents.executeJavaScript("window.qaRestoreMain(65,1)");
 await until(async()=>{const n=await readClock();return n>=65&&n<68},'reopening a running chat must restore elapsed time');
 await win.webContents.executeJavaScript("window.qaRestoreMain(125,2)");
 await until(async()=>{const n=await readClock();return n>=125&&n<128},'switching between running chats must use the destination clock');
 await win.webContents.executeJavaScript("window.qaRestoreMain(null,3)");
 await until(async()=>await readClock()===null,'idle chat must not show the previous turn clock');
 await win.webContents.executeJavaScript("window.qaRestoreMain(75,4,'reopened')");
 await until(async()=>{const n=await readClock();return n>=75&&n<78},'remounting the pane must preserve the original turn start');
 await win.webContents.executeJavaScript("window.qaEmit('onApprovalRequest',{paneId:'main',requestId:'qa-approval',itemId:'qa-command',command:'echo hello',kind:'command'})");
 await pause();const frozen=await readClock();
 await new Promise(resolve=>setTimeout(resolve,1200));
 assert.equal(await readClock(),frozen,'clock must stay frozen during approval');
 await win.webContents.executeJavaScript("window.qaEmit('onApprovalCanceled',{paneId:'main',requestId:'qa-approval'})");
 await until(async()=>await readClock()>frozen,'clock must resume after approval without losing accumulated time');
 // Compaction is restored in either view, and live phases never become
 // completed-history markers until completion actually arrives.
 const paneText=id=>win.webContents.executeJavaScript(`document.querySelector('#${id}').innerText`);
 const hasCompacting=async id=>(await paneText(id)).includes('Compacting conversation…');
 const compactedCount=async id=>((await paneText(id)).match(/context compacted — earlier turns summarized/g)??[]).length;
 await win.webContents.executeJavaScript("window.qaReopenMosaic(true)");
 await until(()=>hasCompacting('mosaic'),'Mosaic mount must restore in-flight compaction');
 assert.equal(await compactedCount('mosaic'),0);
 await win.webContents.executeJavaScript("window.qaRestoreMain(65,10,'compaction-main',true)");
 await until(()=>hasCompacting('main'),'normal view must restore compaction after leaving Mosaic');
 assert.equal(/(?:thinking|waiting)…/.test(await paneText('main')),false,'restored compaction must not display the regular waiting status');
 assert.equal(await hasCompacting('side'),false,'compaction must stay within its conversation');
 const compactionEvent=async phase=>{
   await win.webContents.executeJavaScript(`for(const paneId of ['main','multi:qa-mosaic'])window.qaEmit('onCompaction',{paneId,phase:${JSON.stringify(phase)}})`);
 };
 await compactionEvent('failed');
 await until(async()=>!(await hasCompacting('main'))&&!(await hasCompacting('mosaic')),'failed compaction must clear both status indicators');
 assert.equal(await compactedCount('main'),0,'failed compaction must not add a completion marker');
 await compactionEvent('started');
 await until(async()=>await hasCompacting('main')&&await hasCompacting('mosaic'),'live compaction starts must update both views');
 assert.equal(await compactedCount('main'),0,'starting compaction must not add a completion marker');
 await compactionEvent('completed');
 await until(async()=>!(await hasCompacting('main'))&&!(await hasCompacting('mosaic')),'completion must clear both status indicators');
 assert.equal(await compactedCount('main'),1);
 assert.equal(await compactedCount('mosaic'),1);
 await compactionEvent('completed');
 await pause();
 assert.equal(await compactedCount('main'),1,'duplicate completion must not duplicate history');
 // Finished answers stay copyable while a later turn is still streaming.
 // Assistant actions wrap their copy button in a span; user copies are separate.
 await win.webContents.executeJavaScript('window.qaRunningCopy()');
 const copyCount=()=>win.webContents.executeJavaScript(`document.querySelectorAll('#main span > button[aria-label="Copy reply"]').length`);
 await until(async()=>await copyCount()===1,'the earlier answer must retain its copy action during a running turn');
 await click('#main span > button[aria-label="Copy reply"]');
 assert.equal(await win.webContents.executeJavaScript('window.qaCopied.at(-1)'),'Earlier completed answer','copy must target the finished answer, not the active response');
 await win.webContents.executeJavaScript("window.qaEmit('onDelta',{paneId:'main',delta:' — still working'})");
 await pause();
 assert.equal(await copyCount(),1,'streaming response must not gain a settled-answer copy action');
 await win.webContents.executeJavaScript("window.qaEmit('onTurnCompleted',{paneId:'main',status:'completed',narrated:true})");
 await until(async()=>await copyCount()===2,'the new answer must gain its copy action when the turn finishes');
 // Slash commands use the real rich-text composer and trusted keyboard input.
 const composer=id=>`#${id} [role="textbox"][contenteditable="true"]`;
 const focusComposer=async id=>{await until(()=>exists(composer(id)),'composer mounts');await win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(composer(id))}).focus()`)};
 const key=async(key,code,windowsVirtualKeyCode,modifiers=0)=>{await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode,modifiers});await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode,modifiers})};
 const insert=text=>win.webContents.debugger.sendCommand('Input.insertText',{text});
 await focusComposer('main');await insert('/cOd');
 await until(()=>win.webContents.executeJavaScript("document.querySelectorAll('#main [role=option]').length===2"),'case-insensitive prefix shows matching enabled commands');
 assert.match(await win.webContents.executeJavaScript("document.querySelector('#main [role=listbox]').innerText"),/Code Review/);
 if(process.env.UNBIASED_SLASH_SCREENSHOT)require('node:fs').writeFileSync(process.env.UNBIASED_SLASH_SCREENSHOT,(await win.webContents.capturePage()).toPNG());
 await key('ArrowDown','ArrowDown',40);
 assert.match(await win.webContents.executeJavaScript("document.querySelector('#main [role=option][aria-selected=true]').innerText"),/Code Style/);
 await key('ArrowUp','ArrowUp',38);await key('Tab','Tab',9);
 await until(()=>win.webContents.executeJavaScript("document.querySelector('#main [role=textbox]').textContent.startsWith('/CodeReview')&&!document.querySelector('#main [role=listbox]')"),'Tab inserts canonical command without sending');
 await pause();await insert('origin/main');await key('Enter','Enter',13);
 await until(()=>win.webContents.executeJavaScript("window.qaCalls.some(c=>c[0]==='sendMessage'&&c[1]==='main'&&c[2].includes('/CodeReview'))"),'selected command is sent');
 const reviewSend=await win.webContents.executeJavaScript("window.qaCalls.filter(c=>c[0]==='sendMessage'&&c[1]==='main').at(-1)");
 assert.equal(reviewSend[2],'/CodeReview origin/main');
 assert.equal(reviewSend[4].skillPath,'/qa/main/code-review/SKILL.md');
 assert.equal(reviewSend[4].commandText,'/CodeReview origin/main');
 await focusComposer('main');await insert('/Code');
 await until(()=>exists('#main [role=listbox]'),'picker opens during a running turn');
 const interrupts=await win.webContents.executeJavaScript("window.qaCalls.filter(c=>c[0]==='interrupt').length");
 await key('Escape','Escape',27);
 await until(async()=>!await exists('#main [role=listbox]'),'Escape dismisses command menu');
 assert.equal(await win.webContents.executeJavaScript("window.qaCalls.filter(c=>c[0]==='interrupt').length"),interrupts,'dismissing menu must not stop the run');
 await insert(' R');
 await until(()=>exists('#main [role=option]'),'typing after Escape reopens matches');
 await key('Enter','Enter',13);await pause();await key('Enter','Enter',13);
 await win.webContents.executeJavaScript("window.qaEmit('onTurnCompleted',{paneId:'main',status:'completed',narrated:true})");
 await until(()=>win.webContents.executeJavaScript("window.qaCalls.filter(c=>c[0]==='sendMessage'&&c[1]==='main'&&c[2].includes('/CodeReview')).length===2"),'queued skill request keeps its command selection');
 assert.equal(await win.webContents.executeJavaScript("window.qaCalls.filter(c=>c[0]==='sendMessage'&&c[1]==='main').at(-1)[4].skillPath"),'/qa/main/code-review/SKILL.md');
 await win.webContents.executeJavaScript("window.qaEmit('onTurnCompleted',{paneId:'side:qa',status:'completed',narrated:true})");
 await focusComposer('side');await insert('/code');
 await until(()=>exists('#side [role=option]'),'side-chat command picker mounts');
 assert.match(await win.webContents.executeJavaScript("document.querySelector('#side [role=listbox]').innerText"),/This project/);
 await insert(' Review');
 await until(()=>win.webContents.executeJavaScript("document.querySelectorAll('#side [role=option]').length===1"),'spaced display name filters to Code Review');
 await insert(' origin/main');
 await until(async()=>!await exists('#side [role=listbox]'),'arguments close the spaced command picker');
 await key('Enter','Enter',13);
 await until(()=>win.webContents.executeJavaScript("window.qaCalls.some(c=>c[0]==='sendMessage'&&c[4]?.commandText==='/code Review origin/main')"),'spaced alias sends without losing arguments');
 const spacedSend=await win.webContents.executeJavaScript("window.qaCalls.find(c=>c[0]==='sendMessage'&&c[4]?.commandText==='/code Review origin/main')");
 assert.ok(spacedSend[2].includes('/code Review origin/main'));
 assert.equal(spacedSend[4].skillPath,'/qa/side:qa/code-review/SKILL.md');
 await focusComposer('mosaic');await insert('/Code');
 await until(()=>exists('#mosaic [role=option]'),'Mosaic command picker mounts');
 assert.ok(await win.webContents.executeJavaScript("window.qaCalls.some(c=>c[0]==='slashCommands'&&c[1]==='multi:qa-mosaic')"),'Mosaic requests its own skill scope');
 console.log('PASS: transcript actions, annotations, timers, compaction, completed copy actions, and slash-command matching, keyboard selection, arguments, queueing, Escape, side-chat and Mosaic scope.');win.destroy();app.quit();
})().catch(e=>{console.error(e);app.exit(1)});
