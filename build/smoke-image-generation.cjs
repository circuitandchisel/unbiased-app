const { homeApiFixture } = require("./home-api-fixture.cjs");
// Real ChatPane + img-fx/Three: no server calls, local PNG fixture only.
const { app, BrowserWindow, nativeImage } = require('electron');
const { build } = require('esbuild');
const fs = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const assert = require('node:assert/strict');
const fixture=fs.mkdtempSync(join(tmpdir(),'unbiased-image-generation-'));
app.setPath('userData',join(fixture,'profile'));
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
const deadline=setTimeout(()=>{console.error('Image-generation smoke timed out');app.exit(1)},60000);deadline.unref();
(async()=>{
 const css=[];
 const pixels=Buffer.alloc(320*320*4);
 for(let y=0;y<320;y++)for(let x=0;x<320;x++){const i=(y*320+x)*4,sun=(x-240)**2+(y-75)**2<32**2,hill=y>190+30*Math.sin(x/65);pixels[i]=sun?75:hill?80:215;pixels[i+1]=sun?200:hill?155:180;pixels[i+2]=sun?255:hill?65:110;pixels[i+3]=255}
 const png=nativeImage.createFromBitmap(pixels,{width:320,height:320}).toDataURL();
 const bundled=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{App,ChatPane}from'./src/renderer/src/App';import{themeVars,DEFAULT_THEME}from'./src/renderer/src/theme';
window.qaRevealTimeouts=0;const originalTimeout=window.setTimeout;window.setTimeout=(callback,ms,...args)=>originalTimeout(()=>{if(ms===8000)window.qaRevealTimeouts++;callback(...args)},ms);Object.defineProperty(document,'visibilityState',{get:()=>window.qaVisibility??'visible'});window.qaListeners=new Map();window.qaCalls=[];window.qaEmit=(key,payload)=>{for(const cb of window.qaListeners.get(key)??[])cb(payload)};
window.unbiased=new Proxy({}, {get:(_,key)=>{if(String(key).startsWith('on'))return cb=>{const set=window.qaListeners.get(key)??new Set();set.add(cb);window.qaListeners.set(key,set);return()=>set.delete(cb)};return async(...args)=>{window.qaCalls.push([key,...args]);${homeApiFixture}if(key==='getEngineStatus')return{state:'connected'};if(key==='recentSideChats')return[];if(key==='subagentsList')return{agents:[]};if(key==='sideBrowserTabs')return{root:args[0],tabs:[]};if(key==='openThread'||key==='mountThread')return{id:args[0],lease:'preview-lease',entries:[{kind:'user',text:'Image request'},{kind:'assistant',text:'Ready for preview.',screenshots:[{name:'Generated image',path:'/fixture/fullscreen.png'}]}],total:2,offset:0,sessionId:'preview-session',running:false,approvals:[],userInputs:[]};if(key==='readImage')return window.qaBadImage?{}:{dataUrl:${JSON.stringify(png)}};if(key==='contextUsage')return{usage:null};return{ok:true,hasKey:true,entries:[],enabled:[],servers:[],commands:[],requestIds:[],projects:[],recents:[],releases:[],tasks:[],memories:[],pals:[],pets:[]}}}});
function Fixture(){const [reset,setReset]=useState({entries:[{kind:'user',text:'Create an illustration of a sunny pasture.'}],nonce:0});window.qaHistory=entries=>setReset(r=>({entries,nonce:r.nonce+1}));return <div style={{...themeVars(DEFAULT_THEME),color:'var(--fg)',fontFamily:'var(--font-ui)',height:'100vh',display:'flex',flexDirection:'column'}}><ChatPane paneId='main' threadId='image-chat' connected canTypeToFocus={()=>false} reset={reset} emptyState={null} accessMode='full' onAccessModeChange={()=>{}} planMode={false} onTogglePlanMode={()=>{}} onPreviewImage={image=>{window.qaOpened=image}}/></div>};const root=createRoot(document.getElementById('root'));window.qaApp=()=>{localStorage.setItem('unbiased.authed','1');localStorage.setItem('multiViewChats',JSON.stringify(['preview-chat']));root.render(<App/>)};root.render(<Fixture/>);
`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'import.meta.glob':'__qaGlob'},banner:{js:'var __qaGlob=()=>({});'},loader:{'.svg':'dataurl','.png':'dataurl','.webp':'dataurl'},plugins:[{name:'qa',setup(b){b.onLoad({filter:/\.css$/},args=>{css.push(fs.readFileSync(args.path,'utf8'));return{contents:'',loader:'js'}});b.onLoad({filter:/\.md$/},args=>({contents:fs.readFileSync(args.path,'utf8'),loader:'text'}));b.onLoad({filter:/\/src\/renderer\/src\/App\.tsx$/},args=>({contents:fs.readFileSync(args.path,'utf8')+'\nexport {ChatPane};',loader:'tsx'}))}}]});
 const base=[...fs.readFileSync('src/renderer/index.html','utf8').matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
 const html=join(fixture,'index.html');fs.writeFileSync(html,`<meta charset='UTF-8'><style>body{margin:0;background:#111}${base}${css.join('\n')}</style><div id='root'></div><script>${bundled.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`);
 await app.whenReady();const win=new BrowserWindow({show:false,width:1000,height:1000,webPreferences:{backgroundThrottling:false}});
 const errors=[];win.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message)});
 const ev=async code=>{const r=await win.webContents.executeJavaScript(`(async()=>{try{return{ok:true,value:await(0,eval)(${JSON.stringify(code)})}}catch(e){return{ok:false,error:e.stack??String(e)}}})()`);if(!r.ok)throw Error(r.error);return r.value};
 const until=async code=>{for(let i=0;i<300;i++){if(await ev(code))return;await new Promise(r=>setTimeout(r,30))}throw Error('Timeout: '+code+'\n'+errors.join('\n')+'\n'+await ev('document.body.innerText')+'\nFocus: '+await ev('document.activeElement.outerHTML.slice(0,500)'))};
 const send=async(phase,item)=>ev(`window.qaEmit('onCommand',{paneId:'main',phase:${JSON.stringify(phase)},item:${JSON.stringify(item)}})`);
 const start=async id=>{await ev(`window.qaEmit('onTurnStarted',{paneId:'main',turnId:'turn-${id}'})`);await send('started',{id,command:'Create image · A whimsical illustration of a cow standing in a sunny pasture.',source:'image-generation',status:'inProgress'})};
 const ready=`document.querySelector('[data-image-generation-preview="ready"]')`;
 try{
  await win.loadFile(html);win.showInactive();
  await win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await until(`window.qaListeners.get('onCommand')?.size>0`);
  await start('image-one');
  await until(`document.querySelector('[data-image-generation-preview="running"] canvas')`);
  assert.equal(await ev(`document.querySelector('[aria-label="Hide steps"]')!==null`),true,'running section expands without a click');
  assert.equal(await ev(`document.querySelector('[title="A whimsical illustration of a cow standing in a sunny pasture."]')?.textContent`),'A whimsical illustration of a cow standing in a sunny pasture.','the image step starts with its prompt, without repeating Create image');
  assert.equal(await ev(`document.querySelectorAll('[aria-label="Open generated image"]').length`),0,'never reveal a fake image while pending');
  const before=await ev(`document.querySelector('[data-image-generation-preview]').getBoundingClientRect().toJSON()`);
  await ev(`document.querySelector('[data-image-generation-preview]').scrollIntoView({block:'center'})`);
  await until(`(()=>{const r=document.querySelector('[data-image-generation-preview]').getBoundingClientRect();return r.width>300&&r.top>=0&&r.bottom<window.innerHeight})()`);
  if(process.env.UNBIASED_IMAGE_QA_DIR){win.showInactive();await new Promise(r=>setTimeout(r,500));fs.mkdirSync(process.env.UNBIASED_IMAGE_QA_DIR,{recursive:true});fs.writeFileSync(join(process.env.UNBIASED_IMAGE_QA_DIR,'generating.png'),(await win.webContents.capturePage()).toPNG())}
  await ev(`window.qaVisibility='hidden';document.dispatchEvent(new Event('visibilitychange'))`);
  await until(`document.querySelectorAll('[data-image-generation-preview] canvas').length===0`);
  await ev(`window.qaVisibility='visible';document.dispatchEvent(new Event('visibilitychange'))`);
  await until(`document.querySelector('[data-image-generation-preview="running"] canvas')`);
  await send('completed',{id:'image-one',source:'image-generation',status:'completed',screenshots:[{name:'Generated image',path:'/fixture/cow.png'}]});
  await until(`${ready}?.querySelector('img')?.naturalWidth>0`);
  assert.ok(Math.abs(await ev(`${ready}.getBoundingClientRect().height`)-before.height)<1,'completion keeps preview height stable');
  // Turn folding may remount the attachment. Its reveal survives outside Work.
  await ev(`window.qaEmit('onDelta',{paneId:'main',delta:'Here is your illustration.'});window.qaEmit('onTurnCompleted',{paneId:'main',status:'completed',narrated:false})`);
  await until(`document.querySelector('[aria-label="Generated images"] img')?.naturalWidth>0`);
  await until(`document.querySelector('[aria-label="Generated images"] [data-image-generation-reveal]:not([data-image-generation-reveal="pending"])')&&document.querySelectorAll('[data-image-generation-preview] canvas').length===0`);
  assert.equal(await ev('window.qaRevealTimeouts'),0,'the actual shader reveal completes without the safety timeout');
  assert.equal(await ev(`document.querySelectorAll('[aria-label="Open generated image"]').length`),1,'one durable generated image after folding');
  await ev(`document.querySelector('[aria-label="Open generated image"]').click()`);assert.equal(await ev(`window.qaOpened.path`),'/fixture/cow.png');
  if(process.env.UNBIASED_IMAGE_QA_DIR)fs.writeFileSync(join(process.env.UNBIASED_IMAGE_QA_DIR,'revealed.png'),(await win.webContents.capturePage()).toPNG());
  // History must show the image immediately, without replaying GPU animation.
  await ev(`window.qaHistory([{kind:'user',text:'Previous image request'},{kind:'assistant',text:'Saved result.',screenshots:[{name:'Generated image',path:'/fixture/cow.png'}]}])`);
  await until(`${ready}?.querySelector('img')?.naturalWidth>0`);
  assert.equal(await ev(`document.querySelectorAll('[data-image-generation-preview] canvas').length`),0);
  // Losing a WebGL context falls back to the real image, never a blank card.
  await start('image-context-loss');await until(`document.querySelector('[data-image-generation-preview="running"] canvas')`);
  await ev(`document.querySelector('[data-image-generation-preview="running"] canvas').dispatchEvent(new Event('webglcontextlost'))`);
  await send('completed',{id:'image-context-loss',source:'image-generation',status:'completed',screenshots:[{name:'Generated image',path:'/fixture/fallback.png'}]});
  await until(`document.querySelectorAll('[aria-label="Open generated image"] img').length===2&&document.querySelectorAll('[data-image-generation-preview] canvas').length===0`);
  // Reduced motion keeps a static pending card and a readable result.
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await start('image-two');await until(`document.querySelector('[data-image-generation-preview="running"]')`);
  assert.equal(await ev(`document.querySelector('[data-image-generation-preview="running"] canvas')!==null`),false);
  await send('completed',{id:'image-two',source:'image-generation',status:'completed',screenshots:[{name:'Generated image',path:'/fixture/reduced.png'}]});
  await until(`document.querySelectorAll('[aria-label="Open generated image"] img').length===3`);
  assert.equal(await ev(`document.querySelectorAll('[data-image-generation-preview] canvas').length`),0);
  // A cancelled/failed request must not leave a perpetual loader.
  await start('image-three');await until(`document.querySelector('[data-image-generation-preview="running"]')`);
  await send('completed',{id:'image-three',source:'image-generation',status:'failed'});
  await until(`!document.querySelector('[data-image-generation-preview="running"]')`);
  // Production App routing: use Visualize's full-screen top layer, never a file tab.
  await ev(`window.qaApp()`);await until(`window.qaListeners.get('onPetNoticeOpenThread')?.size>0`);
  await ev(`window.qaEmit('onPetNoticeOpenThread',{threadId:'preview-chat'})`);
  await until(`document.querySelector('[aria-label="Open generated image"] img')?.naturalWidth>0`);
  const panel=`document.querySelector('[aria-label="Side panel"]')`;
  const expanded=`document.querySelector('.app-image-lightbox:popover-open')`;
  const imageButton=`document.querySelector('[aria-label="Open generated image"]')`;
  await until(`getComputedStyle(${imageButton}).visibility==='visible'`);
  const scroll=await ev(`document.querySelector('[data-chat-pane-id="main"] [data-virtuoso-scroller]').scrollTop`);
  await ev(`${imageButton}.focus({preventScroll:true});${imageButton}.click()`);
  await until(`${expanded}?.querySelector('img')?.naturalWidth>0&&${expanded}.querySelector('img').getBoundingClientRect().width>300`);
  assert.equal(await ev(`${panel}.dataset.open`),'false','opening an image never opens the side panel');
  assert.ok(await ev(`${expanded}.getBoundingClientRect().width>window.innerWidth*.9`));
  const imageWidth=await ev(`${expanded}.querySelector('img').getBoundingClientRect().width`);
  await ev(`${expanded}.querySelector('[aria-label="Zoom in"]').click()`);
  await until(`${expanded}.querySelector('[aria-label="Zoom level"]').textContent==='115%'`);
  assert.ok(await ev(`${expanded}.querySelector('img').getBoundingClientRect().width`)>imageWidth*1.13,'zoom changes the actual image size');
  if(process.env.UNBIASED_IMAGE_QA_DIR)fs.writeFileSync(join(process.env.UNBIASED_IMAGE_QA_DIR,'fullscreen.png'),(await win.webContents.capturePage()).toPNG());
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`);
  await until(`!document.querySelector('.app-image-lightbox')`);
  await until(`document.activeElement===${imageButton}`);
  await ev(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
  assert.ok(Math.abs(await ev(`document.querySelector('[data-chat-pane-id="main"] [data-virtuoso-scroller]').scrollTop`)-scroll)<1);
  await ev(`document.querySelector('[title="Open side panel"]').click()`);await until(`${panel}?.dataset.open==='true'`);
  await ev(`${imageButton}.click()`);await until(`${expanded}?.querySelector('img')?.naturalWidth>0`);
  await ev(`${expanded}.querySelector('[aria-label="Close expanded visual"]').click()`);await until(`!document.querySelector('.app-image-lightbox')`);
  assert.equal(await ev(`${panel}.dataset.open`),'true','closing the viewer preserves an already open side panel');
  await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Mosaic').click()`);
  await until(`document.querySelector('[data-mosaic-chat-id="preview-chat"] [aria-label="Open generated image"] img')?.naturalWidth>0`);
  await ev(`document.querySelector('[data-mosaic-chat-id="preview-chat"] [aria-label="Open generated image"]').click()`);
  await until(`${expanded}?.querySelector('img')?.naturalWidth>0`);
  await ev(`${expanded}.querySelector('[aria-label="Close expanded visual"]').click()`);await until(`!document.querySelector('.app-image-lightbox')`);
  assert.equal(await ev(`${panel}.dataset.open`),'false','Mosaic image previews also leave the side panel alone');
  assert.deepEqual(errors.filter(e=>!e.includes('Electron Security Warning')),[]);
  console.log('PASS: auto-expanded image generation, actual WebGL pending/reveal, stable card height, turn folding, one durable/openable image, static history, hidden-pane GPU suspension, WebGL context loss, reduced motion and failed-request cleanup; production full-screen image zoom, Escape/focus/scroll restoration, side-panel retention and Mosaic routing.');
 }finally{win.destroy();fs.rmSync(fixture,{recursive:true,force:true})}
})().then(()=>app.exit(0),error=>{console.error(error);app.exit(1)});
