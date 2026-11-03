// Real in-app page -> persisted PNG -> live ChatPane -> disk cache -> reopened chat.
const {app,BrowserWindow,WebContentsView,ipcMain,nativeImage}=require('electron');
const {build}=require('esbuild');
const {createServer}=require('node:http');
const fs=require('node:fs');
const {join,resolve}=require('node:path');
const {tmpdir}=require('node:os');
const assert=require('node:assert/strict');
require('tsx/cjs');
const {SideBrowserController}=require('../src/main/side-browser.ts');
const {retainBrowserCapture,readBrowserCaptureTurns}=require('../src/main/browser-captures.ts');
const fixture=fs.realpathSync(fs.mkdtempSync(join(tmpdir(),'unbiased-capture-')));
app.setPath('userData',join(fixture,'profile'));
const deadline=setTimeout(()=>{console.error('Screenshot attachment regression timed out');app.exit(1)},60000);deadline.unref();
async function main(){
 await app.whenReady();
 const server=createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end('<style>body{margin:0;padding:32px;background:#111;color:white;font:22px system-ui}button{padding:12px}</style><h1>Saved screenshot fixture</h1><button onclick="document.body.style.background=\'#204060\';this.textContent=\'Updated\'">Update page</button>')});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const host=new BrowserWindow({show:false,width:1000,height:700});
 const views=[];
 const controller=new SideBrowserController({create:()=>{const view=new WebContentsView({webPreferences:{sandbox:true,backgroundThrottling:false,partition:'capture-fixture'}});host.contentView.addChildView(view);view.setBounds({x:0,y:0,width:900,height:600});views.push(view);return {id:-1,contents:view.webContents}},controlled:()=>{},update:()=>{}});
 let win;
 try{
  const tab=await controller.open('capture-chat',`http://127.0.0.1:${server.address().port}/preview`);
  await controller.run('capture-chat',tab.id,async page=>page.getByRole('button',{name:'Update page'}).click());
  const png=await controller.run('capture-chat',tab.id,(page,cursor)=>cursor.withoutMarker(()=>page.screenshot({type:'png'})));
  const saved=retainBrowserCapture(join(fixture,'captures'),'capture-chat','capture-call',{success:true,contentItems:[{type:'inputImage',imageUrl:'data:image/png;base64,'+png.toString('base64')}]},'capture-turn');
  assert.ok(saved.capture);
  assert.deepEqual([...nativeImage.createFromPath(saved.capture.path).toBitmap().subarray(0,3)],[0x60,0x40,0x20],'capture contains the actual changed page');
  await controller.shutdown();
  assert.deepEqual(readBrowserCaptureTurns(join(fixture,'captures'),'capture-chat')['capture-turn'],[saved.capture]);
  const cachePath=join(fixture,'transcript.json');
  ipcMain.handle('chat:commands',()=>({commands:[],error:null}));
  ipcMain.handle('mcp:thread-get',()=>({enabled:[]}));
  ipcMain.handle('usage:context',()=>({usage:null}));
  ipcMain.handle('chat:live-approvals',()=>({requestIds:[]}));
  ipcMain.handle('chat:live-user-inputs',()=>({requestIds:[]}));
  ipcMain.handle('file:exists',()=>({exists:false}));
  ipcMain.handle('transcript:save',(_event,p)=>{fs.writeFileSync(cachePath,JSON.stringify(p.entries));return {ok:true}});
  ipcMain.handle('file:read-image',(_event,path)=>{assert.equal(path,saved.capture.path);return {fullPath:path,dataUrl:nativeImage.createFromPath(path).toDataURL()}});
  const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';import {ChatPane,MdImage} from './src/renderer/src/App';
function Fixture(){const [opened,setOpened]=React.useState(null);return <><section id="chat"><ChatPane paneId="main" connected canTypeToFocus={()=>false} threadId="capture-chat" persistTranscript reset={{entries:window.qaEntries,nonce:0,...(window.qaLive?{resume:{running:true,approvals:[],userInputs:[]},runningTurnStart:1,runningTurnStartedAt:Date.now()}: {})}} emptyState={null} accessMode="full" onAccessModeChange={()=>{}} planMode={false} onTogglePlanMode={()=>{}} onPreviewImage={image=>{window.qaOpened=image;setOpened(image.path)}}/></section>{opened&&<section aria-label="Screenshot preview"><MdImage src={opened} alt="Opened screenshot" chat/></section>}</>}
createRoot(document.getElementById('root')).render(<Fixture/>);
`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'import.meta.glob':'__qaGlob'},banner:{js:'var __qaGlob=()=>({});'},loader:{'.svg':'dataurl','.png':'dataurl','.webp':'dataurl'},plugins:[{name:'qa',setup(b){b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));b.onLoad({filter:/\.md$/},args=>({contents:fs.readFileSync(args.path,'utf8'),loader:'text'}));b.onLoad({filter:/\/src\/renderer\/src\/App\.tsx$/},args=>({contents:fs.readFileSync(args.path,'utf8')+'\nexport {ChatPane,MdImage};',loader:'tsx'}))}}]});
  const html=join(fixture,'chat.html');
  const writePage=(entries,live)=>fs.writeFileSync(html,`<meta charset="UTF-8"><style>:root{--fg:#fff;--fg-msg:#eee;--dim:#aaa;--border:#444;--panel:#222;--panel-2:#333;--bg:#111;--accent:#ff7764;--code-bg:#222}body{margin:0;background:#111;color:#fff;font:15px system-ui}#root{display:flex;height:750px}#chat{display:flex;flex-direction:column;width:750px;min-height:0}</style><div id="root"></div><script>window.qaEntries=${JSON.stringify(entries)};window.qaLive=${live};${result.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`);
  writePage([{kind:'user',text:'Attach a screenshot of the updated page.'}],true);
  win=new BrowserWindow({show:false,width:1200,height:800,webPreferences:{preload:resolve('out/preload/index.js'),backgroundThrottling:false}});
  const errors=[];win.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message)});
  const evaluate=code=>win.webContents.executeJavaScript(code);
  const until=async code=>{for(let i=0;i<150;i++){if(await evaluate(code))return;await new Promise(done=>setTimeout(done,40))}throw new Error('Timed out: '+code+'\n'+errors.join('\n'))};
  await win.loadFile(html);win.showInactive();await until("document.querySelector('[role=textbox]')!==null");
  const item={id:'capture-call',command:'screenshot in-app browser tab -1',source:'side-browser',status:'completed',screenshots:[saved.capture]};
  win.webContents.send('chat:command',{paneId:'main',phase:'completed',item});
  await until("document.querySelector('[aria-label=\"Open browser screenshot\"] img')?.naturalWidth>0");
  await until("getComputedStyle(document.querySelector('[aria-label=\"Open browser screenshot\"]')).visibility==='visible'");
  win.webContents.send('chat:delta',{paneId:'main',delta:'Here is the screenshot of the updated page.'});
  win.webContents.send('chat:turn-completed',{paneId:'main',status:'completed',narrated:false});
  await until("document.body.innerText.includes('Here is the screenshot')&&document.querySelector('[aria-label=\"Open browser screenshot\"] img')?.naturalWidth>0");
  assert.equal(await evaluate("document.querySelectorAll('[aria-label=\"Open browser screenshot\"]').length"),1,'one visible attachment outside collapsed work, even without Markdown');
  await evaluate("document.querySelector('[aria-label=\"Open browser screenshot\"]').click()");
  await until("document.querySelector('[aria-label=\"Screenshot preview\"] img')?.naturalWidth>0");
  assert.equal(await evaluate('window.qaOpened.path'),saved.capture.path);
  for(let i=0;i<100;i++){if(fs.existsSync(cachePath)&&JSON.parse(fs.readFileSync(cachePath,'utf8')).some(e=>e.kind==='assistant'&&e.screenshots?.length))break;await new Promise(done=>setTimeout(done,40))}
  const cached=JSON.parse(fs.readFileSync(cachePath,'utf8'));
  assert.ok(cached.some(e=>e.kind==='assistant'&&e.screenshots?.[0]?.path===saved.capture.path),'attachment is persisted with the reply');
  writePage(cached,false);await win.loadFile(html);
  await until("document.querySelector('[aria-label=\"Open browser screenshot\"] img')?.naturalWidth>0");
  await until("getComputedStyle(document.querySelector('[aria-label=\"Open browser screenshot\"]')).visibility==='visible'");
  assert.equal(await evaluate("document.querySelectorAll('[aria-label=\"Open browser screenshot\"]').length"),1);
  await evaluate("document.querySelector('[aria-label=\"Open browser screenshot\"]').scrollIntoView({block:'center'})");
  await until("(()=>{const b=document.querySelector('[aria-label=\"Open browser screenshot\"]'),r=b?.getBoundingClientRect(),p=document.querySelector('#chat').getBoundingClientRect();return r&&r.width>0&&r.height>0&&r.top<p.bottom&&r.bottom>p.top})()");

  if(process.env.UNBIASED_CAPTURE_QA_SCREENSHOT){win.showInactive();await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");fs.writeFileSync(process.env.UNBIASED_CAPTURE_QA_SCREENSHOT,(await win.webContents.capturePage()).toPNG())}
  await evaluate("document.querySelector('[aria-label=\"Open browser screenshot\"]').click()");
  await until("document.querySelector('[aria-label=\"Screenshot preview\"] img')?.naturalWidth>0");
  assert.deepEqual(errors.filter(error=>!error.includes('Electron Security Warning')),[]);
  console.log('PASS: real in-app screenshot pixels, durable PNG and turn association, live automatic attachment without model Markdown, production preload image preview, disk-cached reply and reopened chat.');
 }finally{win?.destroy();await controller.shutdown();for(const view of views)if(!view.webContents.isDestroyed())view.webContents.close();host.destroy();await new Promise(done=>server.close(done));fs.rmSync(fixture,{recursive:true,force:true})}
}
main().then(()=>app.exit(0),error=>{console.error(error);app.exit(1)});
