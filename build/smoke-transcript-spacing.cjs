// Exercise the real virtualized chat: legacy gaps, contained margins and stable geometry.
const { app, BrowserWindow } = require('electron');
const { build } = require('esbuild');
const fs = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const assert = require('node:assert/strict');
const fixture = fs.mkdtempSync(join(tmpdir(), 'unbiased-transcript-spacing-'));
app.setPath('userData', join(fixture, 'profile'));
const deadline = setTimeout(() => { console.error('Transcript spacing timed out'); app.exit(1); }, 30000);
deadline.unref();
const entries = [
  { kind: 'user', text: 'Check the run status now.' },
  { kind: 'work', duration: 71, entries: [
    { kind: 'assistant', text: 'Nested first chunk: register the canary before intake picks this up.' },
    { kind: 'command', itemId: 'one', command: 'echo first', source: 'shell', status: 'completed', exitCode: 0 },
    { kind: 'assistant', text: 'Nested second chunk: register the approved task with the requested limits.' },
    { kind: 'command', itemId: 'two', command: 'echo second', source: 'shell', status: 'failed', exitCode: 1 },
  ] },
  { kind: 'assistant', text: 'Final answer: registration was started but not verified.' },
  { kind: 'assistant', text: 'Outer first chunk: a separate text block.\n\nInner paragraph: keep normal paragraph spacing within this same message.' },
  { kind: 'command', itemId: 'three', command: 'echo third', source: 'shell', status: 'completed', exitCode: 0 },
  { kind: 'assistant', text: 'Outer second chunk: another text block.' },
  { kind: 'assistant', text: '# Heading edge\n\nPreserve the heading margin without hardcoding a paragraph-only gap.' },
];
(async () => {
  const css = [];
  const built = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {ChatPane} from './src/renderer/src/App';import {themeVars,DEFAULT_THEME} from './src/renderer/src/theme';
window.unbiased=new Proxy({}, {get:(_,key)=>String(key).startsWith('on')?()=>()=>{}:async()=>{
 if(key==='mcpThreadGet')return {enabled:[]};if(key==='liveApprovals'||key==='liveUserInputs')return [];
 if(key==='contextUsage')return {usage:null};if(key==='fileExists')return {exists:false};if(key==='favicon')return {dataUrl:null};return {};}});
function Fixture(){const[reset,setReset]=useState({entries:${JSON.stringify(entries)},nonce:0});
 window.qaReset=()=>setReset(s=>({...s,nonce:s.nonce+1}));
 return <div style={{...themeVars(DEFAULT_THEME),color:'var(--fg)',fontFamily:'var(--font-ui)',height:1400,display:'flex',flexDirection:'column'}}>
 <ChatPane paneId="main" threadId="spacing" connected canTypeToFocus={()=>false} reset={reset} emptyState={null} accessMode="untrusted" onAccessModeChange={()=>{}} planMode={false} onTogglePlanMode={()=>{}}/></div>}
createRoot(document.getElementById('root')).render(<Fixture/>);
` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'import.meta.glob': '__qaGlob' }, banner: { js: 'var __qaGlob=()=>({});' }, loader: { '.svg': 'dataurl', '.png': 'dataurl', '.webp': 'dataurl' }, plugins: [{ name: 'fixture', setup(b) {
    b.onLoad({ filter: /\.css$/ }, args => { css.push(fs.readFileSync(args.path, 'utf8')); return { contents: '', loader: 'js' }; });
    b.onLoad({ filter: /\.md$/ }, args => ({ contents: fs.readFileSync(args.path, 'utf8'), loader: 'text' }));
    b.onLoad({ filter: /\/src\/renderer\/src\/App\.tsx$/ }, args => ({ contents: fs.readFileSync(args.path, 'utf8') + '\nexport {ChatPane};', loader: 'tsx' }));
  } }] });
  const base = fs.readFileSync('src/renderer/index.html', 'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
  const html = join(fixture, 'index.html');
  fs.writeFileSync(html, `<!doctype html><style>body{margin:0;background:#111}${base}${css.join('\n')}</style><div id="root"></div><script>${built.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>`);
  await app.whenReady();
  const win = new BrowserWindow({ show: false, width: 1000, height: 1450, webPreferences: { backgroundThrottling: false } });
  const errors = [];
  win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
  const ev = code => win.webContents.executeJavaScript(code);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async code => { for (let i = 0; i < 100; i++) { if (await ev(code)) return; await pause(30); } throw Error('Timeout: ' + code); };
  const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 0.5, `${label}: expected ${expected}px, got ${actual}px`);
  const metrics = () => ev(`(()=>{
    const p=prefix=>[...document.querySelectorAll('p')].find(el=>el.textContent.startsWith(prefix));
    const box=el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom}};
    const commands=[...document.querySelectorAll('button')].filter(el=>/^Ran command/.test(el.textContent.trim()));
    const first=p('Nested first'),second=p('Nested second');
    return {header:box(document.querySelector('.u-worked-group')),userCopy:box(document.querySelector('[data-item-index] button[aria-label="Copy reply"]')),
      first:first&&box(first),second:second&&box(second),final:box(p('Final answer')),outer:box(p('Outer first')),inner:box(p('Inner paragraph')),last:box(p('Outer second')),
      heading:box(document.querySelector('h1')),commands:commands.map(box)};
  })()`);
  const check = async (expanded, label) => {
    await pause(150);
    const m = await metrics();
    near(m.header.top - m.userCopy.bottom, 14, label + ': user to work');
    near(m.outer.top - m.final.bottom, 22, label + ': separate text chunks');
    near(m.inner.top - m.outer.bottom, 12, label + ': inner paragraphs');
    near(m.commands.at(-1).top - m.inner.bottom, 22, label + ': text to command');
    near(m.last.top - m.commands.at(-1).bottom, 22, label + ': command to text');
    near(m.heading.top - m.last.bottom, 28, label + ': heading edge');
    if (expanded) {
      near(m.commands[0].top - m.first.bottom, 22, label + ': nested text to command');
      near(m.second.top - m.commands[0].bottom, 22, label + ': nested command to text');
      near(m.final.top - m.commands[1].bottom, 14, label + ': expanded work to final');
    } else near(m.final.top - m.header.bottom, 12, label + ': collapsed work to final');
    const samples = await ev(`new Promise(resolve=>{const samples=[],start=performance.now();function frame(){const s=document.querySelector('[data-virtuoso-scroller]');samples.push([s.scrollTop,s.scrollHeight,...[...document.querySelectorAll('[data-item-index]')].map(el=>el.getBoundingClientRect().top)]);if(performance.now()-start<500)requestAnimationFrame(frame);else resolve(samples)}requestAnimationFrame(frame)})`);
    assert.ok(samples.length >= 5, label + ': sufficient painted frames');
    for (let i = 0; i < samples[0].length; i++) assert.ok(Math.max(...samples.map(s => s[i])) - Math.min(...samples.map(s => s[i])) <= 1, label + ': transcript geometry stays settled');
    assert.equal(await ev(`(()=>{for(const row of document.querySelectorAll('[data-item-index]')){const r=row.getBoundingClientRect();if(r.height<1)return false;for(const p of row.querySelectorAll('p')){const c=p.getBoundingClientRect();if(c.top<r.top-.5||c.bottom>r.bottom+.5)return false}}return true})()`), true, label + ': margins remain in measured rows');
    return { label, metrics: m };
  };
  try {
    await win.loadFile(html);await until(`!!document.querySelector('h1')&&!!document.querySelector('.u-worked-group')`);
    const results = [await check(false, 'wide collapsed')];
    await ev(`document.querySelector('.u-worked-group').click()`);await until(`document.querySelector('.u-worked-group').getAttribute('aria-expanded')==='true'`);
    results.push(await check(true, 'wide expanded'));
    if (process.env.UNBIASED_SPACING_SCREENSHOT) fs.writeFileSync(process.env.UNBIASED_SPACING_SCREENSHOT, (await win.webContents.capturePage()).toPNG());
    win.setSize(560, 1450);results.push(await check(true, 'narrow expanded'));
    await ev(`document.getElementById('root').style.display='none'`);await pause(150);
    await ev(`document.getElementById('root').style.display=''`);results.push(await check(true, 'revealed pane'));
    await ev(`document.querySelector('.u-worked-group').click()`);results.push(await check(false, 'narrow collapsed'));
    await ev('window.qaReset()');await pause(150);results.push(await check(false, 'remounted transcript'));
    await ev(`document.querySelector('.u-worked-group').click()`);results.push(await check(true, 'remounted expanded'));
    assert.deepEqual(errors, []);
    console.log('PASS: legacy transcript gaps, paragraph and heading margins, fold toggles, width changes, hidden panes, remounts, contained row measurements and settled geometry.');
    fs.writeFileSync(join(fixture, 'results.json'), JSON.stringify(results, null, 2));
  } finally { win.destroy();clearTimeout(deadline);app.quit(); }
})().catch(error => { console.error(error);app.exit(1); });
