// Real composer popup and queue; mock IPC, no account traffic or paid requests.
const {app,BrowserWindow}=require('electron');
const {build}=require('esbuild');
const fs=require('node:fs');const {join}=require('node:path');const {tmpdir}=require('node:os');const assert=require('node:assert/strict');
const fixture=fs.mkdtempSync(join(tmpdir(),'unbiased-server-tools-'));app.setPath('userData',join(fixture,'profile'));
const deadline=setTimeout(()=>{console.error('Server-tool menu timed out');app.exit(1)},30000);deadline.unref();
(async()=>{
 const css=[];
 const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';import {ChatPane} from './src/renderer/src/App';import {themeVars,DEFAULT_THEME} from './src/renderer/src/theme';
window.qaCaps={web_search:false,image_generation:false};window.qaCalls=[];window.qaListeners=new Map();window.qaFail=false;
window.qaEmit=(name,p)=>{for(const cb of window.qaListeners.get(name)??[])cb(p)};
window.unbiased=new Proxy({}, {get:(_,key)=>{
 if(String(key).startsWith('on'))return cb=>{const set=window.qaListeners.get(key)??new Set();set.add(cb);window.qaListeners.set(key,set);return()=>set.delete(cb)};
 return async(...args)=>{window.qaCalls.push([key,...args]);
 if(key==='serverToolCapabilities'){if(window.qaFail)throw Error('Unavailable');return window.qaCaps}
 if(key==='sendMessage')return {threadId:'chat-one',turnId:'qa-turn',created:false};
 if(key==='contextUsage')return {usage:null};if(key==='mcpThreadGet')return {enabled:[]};if(key==='liveApprovals'||key==='liveUserInputs')return [];if(key==='fileExists')return {exists:false};if(key==='favicon')return {dataUrl:null};return {};};
 }});
createRoot(document.getElementById('root')).render(<div style={{...themeVars(DEFAULT_THEME),fontFamily:'var(--font-ui)',height:720,display:'flex',flexDirection:'column'}}><ChatPane paneId="main" threadId="chat-one" connected canTypeToFocus={()=>false} reset={{entries:[],nonce:0}} emptyState={null} accessMode="untrusted" onAccessModeChange={()=>{}} planMode={false} onTogglePlanMode={()=>{}}/></div>);
`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'import.meta.glob':'__qaGlob'},banner:{js:'var __qaGlob=()=>({});'},loader:{'.svg':'dataurl','.png':'dataurl','.webp':'dataurl'},plugins:[{name:'qa',setup(b){
 b.onLoad({filter:/\.css$/},a=>{css.push(fs.readFileSync(a.path,'utf8'));return {contents:'',loader:'js'}});
 b.onLoad({filter:/\.md$/},a=>({contents:fs.readFileSync(a.path,'utf8'),loader:'text'}));
 b.onLoad({filter:/\/App\.tsx$/},a=>({contents:fs.readFileSync(a.path,'utf8')+'\nexport {ChatPane};',loader:'tsx'}));
 }}]});
 const base=fs.readFileSync('src/renderer/index.html','utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
 const html=join(fixture,'index.html');fs.writeFileSync(html,`<style>body{margin:0;background:#111}${base}${css.join('\n')}</style><div id="root"></div><script>${result.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`);
 await app.whenReady();const win=new BrowserWindow({show:false,width:1050,height:760,webPreferences:{backgroundThrottling:false}});
 const errors=[];win.webContents.on('console-message',d=>{if(d.level==='error')errors.push(d.message)});
 const ev=code=>win.webContents.executeJavaScript(code);
 const until=async(code)=>{for(let i=0;i<100;i++){if(await ev(code))return;await new Promise(r=>setTimeout(r,30));}throw Error('Timeout: '+code+'\n'+errors.join('\n')+'\n'+await ev('document.body.innerText'))};
 const menuButton=label=>`[...document.querySelectorAll('[data-popover] button')].find(b=>b.textContent.includes(${JSON.stringify(label)}))`;
 const open=async()=>{await ev(`document.querySelector('button[aria-label="Add"]').click()`);await until(`!!document.querySelector('[data-popover]')&&Number(getComputedStyle(document.querySelector('[data-popover]')).opacity)>0.99`)};
 const close=()=>ev(`document.querySelector('button[aria-label="Add"]').click()`);
 try{
 await win.loadFile(html);win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
 await until(`!!document.querySelector('[contenteditable=true]')`);await open();
 assert.equal(await ev(`!!(${menuButton('Web Search')})`),false);assert.equal(await ev(`!!(${menuButton('Create image')})`),false);
 assert.ok(await ev(`!!(${menuButton('Visualize')})`));
 await close();await ev(`window.qaCaps={web_search:true,image_generation:false}`);await open();
 await until(`!!(${menuButton('Web Search')})`);assert.equal(await ev(`!!(${menuButton('Create image')})`),false);
 const menuText=(await ev(`document.querySelector('[data-popover]').innerText`)).toLowerCase();assert.ok(menuText.indexOf('pareto')>=0&&menuText.indexOf('pareto')<menuText.indexOf('web search')&&menuText.indexOf('web search')<menuText.indexOf('skills'));
 await ev(`${menuButton('Web Search')}.click()`);await until(`!document.querySelector('[data-popover]')`);
 const typeAndSend=async text=>{
   await ev(`document.querySelector('[contenteditable=true]').focus()`);
   await win.webContents.debugger.sendCommand('Input.insertText',{text});
   await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
   await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 };
 await typeAndSend('Find current information');
 await until(`window.qaCalls.some(c=>c[0]==='sendMessage'&&c[4]?.serverTool==='web_search')`);
 await ev(`window.qaCaps={web_search:true,image_generation:true}`);await open();await until(`!!(${menuButton('Create image')})`);
 if(process.env.UNBIASED_SERVER_TOOLS_SCREENSHOT)fs.writeFileSync(process.env.UNBIASED_SERVER_TOOLS_SCREENSHOT,(await win.webContents.capturePage()).toPNG());
 await ev(`${menuButton('Create image')}.click()`);await typeAndSend('Draw a mountain');
 await until(`document.body.innerText.includes('Draw a mountain')`);
 assert.equal(await ev(`window.qaCalls.filter(c=>c[0]==='sendMessage').length`),1,'image request queues behind the running search');
 await ev(`window.qaEmit('onTurnCompleted',{paneId:'main',status:'completed',narrated:true})`);
 await until(`window.qaCalls.some(c=>c[0]==='sendMessage'&&c[4]?.serverTool==='image_generation')`);
 await open();await ev(`window.qaFail=true`);await close();await open();
 await until(`!(${menuButton('Web Search')})&&!(${menuButton('Create image')})`);
 assert.equal(await ev(`!!document.querySelector('button[title="Selected for this message. Click to remove."]')`),false,'unknown or revoked eligibility clears the selected chip');
 assert.deepEqual(errors,[]);
 console.log('PASS: eligible-only Pareto menu, independent capabilities, selected and queued tool modes, and fail-closed refresh. No real API calls.');
 }finally{win.destroy();clearTimeout(deadline);app.quit()}
})().catch(error=>{console.error(error);app.exit(1)});
