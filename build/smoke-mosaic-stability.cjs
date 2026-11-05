const { app, BrowserWindow } = require('electron');
const { build } = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = process.cwd();
const out = process.env.MOSAIC_QA_OUT || '/tmp/unbiased-mosaic-stability';
fs.mkdirSync(out, {recursive:true});
app.setPath('userData', path.join(out, 'profile'));
const css=[];
const deadline = setTimeout(() => { console.error('Mosaic stability test timed out'); app.exit(1); }, 30000); deadline.unref();
const bundle = build({stdin:{resolveDir:root,loader:'tsx',contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {MultiView} from './src/renderer/src/App';
import {themeVars,DEFAULT_THEME} from './src/renderer/src/theme';
window.qaListeners=new Map();window.qaEmit=(name,p)=>{for(const cb of window.qaListeners.get(name)??[])cb(p)};
const history=Array.from({length:30},(_,i)=>({kind:i%2?'assistant':'user',text:i%2?'Reply '+i+'\\n\\n'+('A paragraph with enough words to wrap in a narrow Mosaic column. '.repeat(i%5+2)):'Question '+i}));
window.unbiased=new Proxy({}, {get:(_,key)=>{
 if(String(key).startsWith('on'))return cb=>{const set=window.qaListeners.get(key)??new Set();set.add(cb);window.qaListeners.set(key,set);return()=>set.delete(cb)};
 return async(...args)=>{if(key==='mountThread')return {lease:'lease-'+args[0],entries:history,running:false};if(key==='contextUsage')return {usage:null};if(key==='mcpThreadGet')return {enabled:[]};if(key==='liveApprovals'||key==='liveUserInputs')return [];if(key==='fileExists')return {exists:false};if(key==='favicon')return {dataUrl:null};if(key==='slashCommands')return {commands:[],error:null};return {}};
}});
function Harness(){const[count,setCount]=useState(4);const[width,setWidth]=useState(1200);window.qaCount=setCount;window.qaWidth=setWidth;
 const ids=Array.from({length:count},(_,i)=>'chat-'+i);const noop=()=>{};
 return <div id="viewport" style={{...themeVars(DEFAULT_THEME),fontFamily:'var(--font-ui)',background:'var(--bg)',color:'var(--fg)',height:'100vh',width,display:'flex',minHeight:0}}>
 <MultiView ids={ids} freshIds={new Set()} freshProjects={{}} freshWork={{}} drafts={new Map()} projects={[]} threads={ids.map(id=>({id,title:id}))} width={width} connected accessMode="untrusted" onAccessModeChange={noop} planMode={false} onTogglePlanMode={noop} onAdd={noop} onCreate={async()=>{}} onOpenChat={noop} onRemove={noop} onCreateProject={noop} onFreshTurnLanded={noop} onSelectFreshEnvironment={async()=>{}} onTurnLanded={noop} onOpenFile={noop} onPreviewImage={noop} onOpenLink={noop} onOpenMcp={noop} onOpenConnectors={noop} onOpenSkills={noop}/></div>
}
createRoot(document.getElementById('root')).render(<Harness/>);
`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'import.meta.glob':'__qaGlob'},banner:{js:'var __qaGlob=()=>({});'},loader:{'.svg':'dataurl','.png':'dataurl','.webp':'dataurl'},plugins:[{name:'fixture',setup(b){
 b.onLoad({filter:/\.css$/},args=>{css.push(fs.readFileSync(args.path,'utf8'));return {contents:'',loader:'js'}});
 b.onLoad({filter:/\.md$/},args=>({contents:fs.readFileSync(args.path,'utf8'),loader:'text'}));
 b.onLoad({filter:/\/src\/renderer\/src\/App\.tsx$/},args=>({contents:fs.readFileSync(args.path,'utf8')+'\nexport {MultiView};',loader:'tsx'}));
}}]});
(async()=>{
 await app.whenReady();const built=await bundle;
 const base=fs.readFileSync('src/renderer/index.html','utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
 const file=path.join(out,'index.html');fs.writeFileSync(file,`<!doctype html><style>body{margin:0}${base}\n${css.join('\n')}</style><div id="root"></div><script>${built.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`);
 const win=new BrowserWindow({show:false,width:1250,height:700,webPreferences:{backgroundThrottling:false}});
 const errors=[];win.webContents.on('console-message',(...args)=>{const details=args[0];if(details?.level==='error')errors.push(details.message)});
 const ev=s=>win.webContents.executeJavaScript(s);
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async(s)=>{for(let i=0;i<100;i++){if(await ev(s))return;await pause(30)}throw Error('Timeout: '+s)};
 const sample = (durationMs = 500) => ev(`new Promise(resolve=>{
   const rows=[];const start=performance.now();
   function frame(){
     const grid=document.querySelector('[data-mosaic-chat-id]').parentElement;
     rows.push({outerTop:grid.scrollTop,tiles:[...grid.children].map(el=>{
       const scroller=el.querySelector('[data-virtuoso-scroller]');
       const items=el.querySelectorAll('[data-item-index]');
       return {id:el.dataset.mosaicChatId,y:el.getBoundingClientRect().y,scrollTop:scroller?.scrollTop,
         lastBottom:items[items.length-1]?.getBoundingClientRect().bottom};
     })});
     if(performance.now()-start<${durationMs})requestAnimationFrame(frame);else resolve(rows);
   }requestAnimationFrame(frame);
 })`);
 const spread = values => Math.max(...values)-Math.min(...values);
 const stable = (samples,label,skipId) => {
   assert.ok(samples.length>=5, `${label}: insufficient painted frames`);
   const movement=[];
   for(let i=0;i<samples[0].tiles.length;i++){
     const id=samples[0].tiles[i].id;if(id===skipId)continue;
     const scrollMotion=spread(samples.map(row=>row.tiles[i].scrollTop));
     const contentMotion=spread(samples.map(row=>row.tiles[i].lastBottom));
     const tileMotion=spread(samples.map(row=>row.tiles[i].y));
     movement.push({id,scrollMotion,contentMotion,tileMotion});
     assert.ok(scrollMotion<=1&&contentMotion<=1&&tileMotion<=1, `${label}: ${JSON.stringify(movement)}`);
   }
   return {label,frames:samples.length,movement};
 };
 const results=[];
 try{
   await win.loadFile(file);
   await until(`document.querySelectorAll('[contenteditable=true]').length===4&&document.querySelectorAll('[data-virtuoso-scroller]').length===4`);
   await pause(400);
   results.push(stable(await sample(),'four panes idle'));
   const startScreenshot=await win.webContents.capturePage();fs.writeFileSync(path.join(out,'mosaic.png'),startScreenshot.toPNG());
   const panes = async(count,width) => {
     await ev(`window.qaCount(${count});window.qaWidth(${width})`);
     await until(`document.querySelectorAll('[data-virtuoso-scroller]').length===${count}`);await pause(400);
     results.push(stable(await sample(),`${count} panes at ${width}px`));
   };
   await panes(6,1200);await panes(6,900);await panes(3,1200);await panes(2,800);await panes(1,800);await panes(4,1200);
   await ev(`window.qaEmit('onTurnStarted',{paneId:'multi:chat-0',turnId:'qa-turn'})`);await pause(200);
   const peers=sample(650);
   for(let i=0;i<20;i++){
     await ev(`window.qaEmit('onDelta',{paneId:'multi:chat-0',delta:${JSON.stringify(' More streamed words to wrap onto another line. '.repeat(3))}})`);await pause(25);
   }
   results.push(stable(await peers,'other chats while one streams','chat-0'));
   await pause(300);results.push(stable(await sample(),'all chats after streaming settles'));
   const anchor = await ev(`(()=>{
     const tile=document.querySelector('[data-mosaic-chat-id="chat-0"]');const s=tile.querySelector('[data-virtuoso-scroller]');
     s.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:-200}));s.scrollTop-=160;
     return true;
   })()`);
   assert.equal(anchor,true);await pause(300);
   const reader = await ev(`(()=>{const tile=document.querySelector('[data-mosaic-chat-id="chat-0"]');const s=tile.querySelector('[data-virtuoso-scroller]');
     const item=[...tile.querySelectorAll('[data-item-index]')].find(el=>el.getBoundingClientRect().bottom>s.getBoundingClientRect().top+20);
     return {index:item.dataset.itemIndex,top:item.getBoundingClientRect().top,scrollTop:s.scrollTop};})()`);
   for(let i=0;i<10;i++){await ev(`window.qaEmit('onDelta',{paneId:'multi:chat-0',delta:' More output while the user reads older messages.'})`);await pause(20)}
   await pause(200);
   const afterReader=await ev(`(()=>{const tile=document.querySelector('[data-mosaic-chat-id="chat-0"]');const s=tile.querySelector('[data-virtuoso-scroller]');
     const item=tile.querySelector('[data-item-index="${reader.index}"]');return {top:item?.getBoundingClientRect().top,scrollTop:s.scrollTop};})()`);
   assert.ok(Math.abs(afterReader.top-reader.top)<=1,`paused reader moved: ${JSON.stringify({reader,afterReader})}`);
   results.push({label:'paused reader stays anchored during streaming',reader,afterReader});
   const jump=await ev(`(()=>{const tile=document.querySelector('[data-mosaic-chat-id="chat-0"]');const button=tile.querySelector('button[aria-label="Scroll to latest"]');button?.click();return !!button;})()`);
   assert.equal(jump,true);await pause(300);
   results.push(stable(await sample(),'jump to latest settles'));
   const atBottom=await ev(`(()=>{const s=document.querySelector('[data-mosaic-chat-id="chat-0"] [data-virtuoso-scroller]');return s.scrollHeight-s.clientHeight-s.scrollTop<=2})()`);
   assert.equal(atBottom,true);
   assert.deepEqual(errors,[]);
   fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
   console.log(JSON.stringify({checks:results.length,artifacts:out,results},null,2));
 }finally{win.destroy();clearTimeout(deadline);app.quit()}
})().catch(e=>{console.error(e);app.exit(1)});
