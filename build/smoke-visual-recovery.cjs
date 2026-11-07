// Real visual component, sandbox and CSP; minimized incident fixtures, no model calls.
const { app, BrowserWindow, protocol } = require('electron');
const { buildSync } = require('esbuild');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { mkdtempSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
app.setPath('userData', join(mkdtempSync(join(tmpdir(), 'unbiased-visual-recovery-')), 'profile'));
require('tsx/cjs');
const { INTERACTIVE_VISUAL_SCHEME, INTERACTIVE_VISUAL_CSP, interactiveVisualDocument,
  interactiveVisualPreviewDocument, interactiveVisualPreviewCsp } = require('../src/shared/interactive-visual.ts');
const cases = {
  structure: '<div><style>.scene{color:red}</div><p>Swallowed scene</p>',
  runtime: '<div><h2>Readable flow</h2><span id="stepStatus">Step 1</span></div><script>document.getElementById("status").textContent="Step 2";</script>',
  empty: '<div></div>',
  healthy: '<div><span id="stepStatus">Step 1</span><button id="next">Next</button></div><script>document.getElementById("next").onclick=()=>document.getElementById("stepStatus").textContent="Step 2";</script>',
  hidden: '<div>Hidden pane scene</div>',
  hiddenEmpty: '<div id=hidden-empty-scene></div>',
  delayed: '<div id="scene"></div><script>setTimeout(()=>document.getElementById("scene").textContent="Delayed scene",50)</script>',
};
protocol.registerSchemesAsPrivileged([{ scheme: INTERACTIVE_VISUAL_SCHEME, privileges: { standard: true, secure: true } }]);
const bundle = buildSync({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import {InteractiveHtmlVisual} from './src/renderer/src/interactive-html-visual';
const cases=${JSON.stringify(cases)};
window.registrations=[];
window.unbiased={registerVisual:async source=>{
 const key=Object.keys(cases).find(key=>cases[key]===source);window.registrations.push(key);
 return 'unbiased-visual://view/'+key;
}};
createRoot(document.getElementById('root')).render(<>{Object.entries(cases).map(([key,source])=><section id={key} key={key} style={key.startsWith('hidden')?{display:'none'}:undefined}><InteractiveHtmlVisual source={source}/></section>)}</>);
` }, bundle: true, write: false, platform: 'browser', format: 'iife' }).outputFiles[0].text;
const deadline=setTimeout(()=>{console.error('Visual recovery timed out');app.exit(1)},20000);deadline.unref();
(async()=>{
 await app.whenReady();
 protocol.handle(INTERACTIVE_VISUAL_SCHEME,request=>{
  const url=new URL(request.url);
  if(url.hostname==='preview'){
   const nonce=randomBytes(16).toString('base64');
   return new Response(interactiveVisualPreviewDocument(nonce),{headers:{'Content-Type':'text/html','Content-Security-Policy':interactiveVisualPreviewCsp(nonce)}});
  }
  const name=url.pathname.slice(1);
  // Model background-renderer behavior: recovering a revealed pane must not
  // depend on resize notifications being delivered inside the sandbox.
  const source=cases[name] && cases[name] + (name.startsWith('hidden') ? '<script>globalThis.ResizeObserver=class{observe(){}disconnect(){}};</script>' : '');
  return source?new Response(interactiveVisualDocument(source),{headers:{'Content-Type':'text/html','Content-Security-Policy':INTERACTIVE_VISUAL_CSP}}):new Response('Not found',{status:404});
 });
 const win=new BrowserWindow({show:false,width:1000,height:1500,webPreferences:{sandbox:true,nodeIntegration:false,backgroundThrottling:false}});
 const check=code=>win.webContents.executeJavaScript(code);
 const until=async(code)=>{
  for(let i=0;i<100;i++){if(await check(code))return;await new Promise(r=>setTimeout(r,30));}
  throw Error('Timeout: '+code+'\n'+await check('document.body.innerText'));
 };
 try{
  await win.loadURL('data:text/html,'+encodeURIComponent('<body style="background:#111;color:#eee;--panel:#222;--dim:#aaa"><div id="root"></div></body>'));
  await check(bundle+'\nundefined;');
  await until(`document.querySelector('#structure [role=alert]')?.textContent.includes('unclosed <style>')`);
  assert.equal(await check(`window.registrations.includes('structure')`),false,'invalid structure is caught before execution');
  await until(`document.querySelector('#runtime [role=alert]')?.textContent.includes('some interactions may not work')`);
  assert.equal(await check(`document.querySelector('#runtime iframe[title="Interactive visual"]').style.visibility`),'visible','script error preserves the readable frame');
  const runtime=win.webContents.mainFrame.frames.find(frame=>frame.url==='unbiased-visual://view/runtime');
  assert.ok((await runtime.executeJavaScript('document.body.innerText')).includes('Readable flow'));
  await until(`document.querySelector('#empty [role=alert]')?.textContent.includes('visual is empty')`);
  await until(`document.querySelector('#healthy iframe[title="Interactive visual"]')?.style.visibility==='visible'`);
  const healthy=win.webContents.mainFrame.frames.find(frame=>frame.url==='unbiased-visual://view/healthy');
  await healthy.executeJavaScript(`document.getElementById('next').click()`);
  assert.equal(await healthy.executeJavaScript(`document.getElementById('stepStatus').textContent`),'Step 2');
  await until(`document.querySelector('#delayed iframe[title="Interactive visual"]')?.style.visibility==='visible'`);
  assert.equal(await check(`!!document.querySelector('#delayed [role=alert]')`),false,'asynchronous scenes can initialize normally');
  assert.equal(await check(`!!document.querySelector('#healthy [role=alert]')`),false);
  // Keep this pane hidden past the empty-render deadline. A fast local run
  // previously revealed it before the timer, masking the hosted-runner failure.
  await new Promise(resolve=>setTimeout(resolve,1200));
  assert.equal(await check(`!!document.querySelector('#hidden [role=alert]')`),false,'a hidden pane is not misclassified as an empty visual');
  assert.equal(await check(`!!document.querySelector('#hiddenEmpty [role=alert]')`),false,'an unmeasurable empty pane waits until reveal');
  await check(`document.getElementById('hidden').style.display='block'`);
  await until(`document.querySelector('#hidden iframe[title="Interactive visual"]')?.style.visibility==='visible'`);
  assert.equal(await check(`!!document.querySelector('#hidden [role=alert]')`),false,'a scene loaded in a hidden pane becomes ready when revealed');
  await check(`document.getElementById('hiddenEmpty').style.display='block'`);
  await until(`document.querySelector('#hiddenEmpty [role=alert]')?.textContent.includes('visual is empty')`);
  if(process.env.UNBIASED_VISUAL_RECOVERY_SCREENSHOT)writeFileSync(process.env.UNBIASED_VISUAL_RECOVERY_SCREENSHOT,(await win.webContents.capturePage()).toPNG());
  console.log('PASS: malformed HTML rejected, runtime failure preserves readable scene, empty output detected, healthy controls and asynchronous rendering work under the production sandbox/CSP.');
 }finally{win.destroy();clearTimeout(deadline);app.quit()}
})().catch(error=>{console.error(error);app.exit(1)});
