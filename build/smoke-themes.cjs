// Production settings, theme storage, Prism, Mermaid and xterm in an isolated app.
const { app, BrowserWindow } = require("electron");
const { build } = require("esbuild");
const fs = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const assert = require("node:assert/strict");
const root = process.cwd();
const fixture = fs.mkdtempSync(join(tmpdir(), "unbiased-themes-"));
app.setPath("userData", join(fixture, "user-data"));
const deadline = setTimeout(() => { console.error("Theme regression timed out"); app.exit(1); }, 60000); deadline.unref();

async function main() {
  const css = [];
  const result = await build({ stdin: { resolveDir: root, loader: "tsx", contents: `
import React,{useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';
import {SettingsView,TerminalPane,CodeBlock,StartPage} from './src/renderer/src/App';
import {MermaidDiagram} from './src/renderer/src/mermaid-diagram';
import {loadTheme,saveTheme,themeVars,applyDocumentTheme} from './src/renderer/src/theme';
window.qaCalls=[];window.qaListeners=new Map();window.qaEmit=(name,payload)=>{for(const callback of window.qaListeners.get(name)??[])callback(payload)};
window.unbiased=new Proxy({}, {get:(_,key)=>{
  if(String(key).startsWith('on'))return callback=>{const set=window.qaListeners.get(key)??new Set();set.add(callback);window.qaListeners.set(key,set);return ()=>set.delete(callback)};
  return async(...args)=>{window.qaCalls.push([key,...args]);if(key==='createTerminal')return {id:'theme-terminal'};if(key==='authWhoami')return {ok:false,error:'Local fixture'};return {}};
}});
if(!localStorage.getItem('qaSeed')) {localStorage.setItem('themeV1',JSON.stringify({accent:'#CCAA66',surface:'#202530',ink:'#ECEFF4',contrast:41,fonts:{ui:'system-ui',code:'Menlo'}}));localStorage.setItem('qaSeed','true')}
function Harness(){
  const [theme,setTheme]=useState(loadTheme);const [view,setView]=useState('samples');window.qaView=setView;window.qaTheme=theme;
  useEffect(()=>applyDocumentTheme(theme),[theme]);
  const change=next=>{setTheme(next);saveTheme(next)};const noop=()=>{};
  return <div style={{...themeVars(theme),fontFamily:'var(--font-ui)',background:'var(--bg)',color:'var(--fg)',minHeight:'100vh'}}>
    <div hidden={view!=='settings'}><SettingsView initialTab="appearance" theme={theme} onChange={change} onBack={noop} onOpenProject={noop} onOpenConnectors={noop} onOpenScheduled={noop} onOpenWhatsNew={noop} onUpdate={noop} onSignOut={noop} updateAvailable={false} updateStaged={false} changelogUnread={false} missedCount={0} releases={[]}/></div>
    <section hidden={view!=='samples'} style={{padding:24}}>
      <StartPage projectName="Theme QA" onPick={noop}/>
      <CodeBlock><code className="language-javascript">{'// Keep a readable comment\\nconst message = "Hello";\\nif (ready) return 42;'}</code></CodeBlock>
      <MermaidDiagram diagram={'graph LR\\n A[Input] --> B[Validate]'} />
      <div style={{height:170,display:'flex'}}><TerminalPane/></div>
      <span data-testid="error" style={{color:'var(--err)'}}>Example error</span>
    </section>
  </div>
}
createRoot(document.getElementById('root')).render(<Harness/>);
` }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "import.meta.glob": "__qaGlob" }, banner: { js: "var __qaGlob=()=>({});" }, loader: { ".svg": "dataurl", ".png": "dataurl", ".webp": "dataurl" }, plugins: [{ name: "qa", setup(b) {
    b.onLoad({ filter: /\.css$/ }, args => { css.push(fs.readFileSync(args.path, "utf8")); return { contents: "", loader: "js" }; });
    b.onLoad({ filter: /\.md$/ }, args => ({ contents: fs.readFileSync(args.path, "utf8"), loader: "text" }));
    b.onLoad({ filter: /\/src\/renderer\/src\/App\.tsx$/ }, args => ({ contents: fs.readFileSync(args.path, "utf8") + "\nexport {SettingsView,TerminalPane,CodeBlock,StartPage};", loader: "tsx" }));
  } }] });
  const baseCSS = fs.readFileSync(join(root, "src/renderer/index.html"), "utf8").match(/<style>([\s\S]*?)<\/style>/)[1];
  const html = join(fixture, "index.html");
  fs.writeFileSync(html, `<!doctype html><style>body{margin:0} [hidden]{display:none!important} ${baseCSS}\n${css.join("\n")}</style><div id="root"></div><script>${result.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script>`);
  await app.whenReady();
  const win = new BrowserWindow({ show: false, width: 1100, height: 960, webPreferences: { backgroundThrottling: false } });
  const errors = []; win.webContents.on("console-message", details => { if (details.level === "error") errors.push(details.message); });
  const evaluate = async expression => {
    const result = await win.webContents.executeJavaScript(`(async()=>{try{return {ok:true,value:await (0,eval)(${JSON.stringify(expression)})}}catch(error){return {ok:false,error:error.stack??String(error)}}})()`);
    if (!result.ok) throw new Error(result.error + "\nRenderer expression: " + expression);
    return result.value;
  };
  const until = async (expression, description) => {
    for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 50)); }
    throw new Error(description + ": " + await evaluate("document.body.innerText.slice(-1200)"));
  };
  const click = text => evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);
  try {
    await win.loadFile(html);
    await until("window.qaCalls?.some(c=>c[0]==='createTerminal')&&document.querySelector('.mermaid-diagram svg')", "real samples mount");
    assert.equal(await evaluate("window.qaTheme.accent"), "#CCAA66", "legacy custom color survives startup");
    await evaluate("window.qaEmit('onTermData',{id:'theme-terminal',data:'preserve this terminal\\r\\n'});window.qaView('settings')");
    await until("document.querySelectorAll('[aria-label=\"Theme profiles\"] button').length===6", "six presets mount");
    for (const name of ["Ember", "Chalk", "Tide", "Grove", "Dune", "Vesper"]) {
      await evaluate(`document.querySelector('[aria-label="${name}, ${["Chalk", "Dune"].includes(name) ? "light" : "dark"} theme"]').click()`);
      await until(`window.qaTheme.profile==='${name.toLowerCase()}'`, `${name} applies immediately`);
      assert.equal(await evaluate("JSON.parse(localStorage.getItem('themeV1')).profile"), name.toLowerCase());
      assert.equal(await evaluate("window.qaTheme.fonts.code"), "Menlo", "preset selection preserves custom fonts");
      assert.equal(await evaluate("document.querySelectorAll('[aria-label=\"Theme profiles\"] [aria-pressed=true]').length"), 1);
      await evaluate("window.qaView('samples')");
      await until("document.querySelector('.mermaid-diagram svg .node rect') && getComputedStyle(document.querySelector('.mermaid-diagram svg .node rect')).fill===getComputedStyle(document.querySelector('.u-theme-profile')).backgroundColor", "diagram follows live profile");
      const code = await evaluate("getComputedStyle(document.querySelector('.token.keyword')).color");
      const keyword = await evaluate("const probe=document.createElement('span');probe.style.color='var(--code-keyword)';document.body.append(probe);const color=getComputedStyle(probe).color;probe.remove();color");
      assert.equal(code, keyword, "Prism follows the selected profile");
      assert.equal(await evaluate("getComputedStyle(document.querySelector('.xterm-scrollable-element')).backgroundColor"), await evaluate("getComputedStyle(document.querySelector('.u-theme-profile')).backgroundColor"), "running terminal follows the selected profile");
      await evaluate("window.qaView('settings')");
    }
    assert.equal(await evaluate("window.qaCalls.filter(c=>c[0]==='createTerminal').length"), 1, "theme changes do not recreate the PTY");
    assert.equal(await evaluate("window.qaCalls.filter(c=>c[0]==='killTerminal').length"), 0, "theme changes do not kill shell state");
    await evaluate("document.querySelector('[aria-label=\"Chalk, light theme\"]').focus()");
    win.webContents.debugger.attach("1.3");
    await win.webContents.debugger.sendCommand("Emulation.setFocusEmulationEnabled", { enabled: true });
    if (process.env.CI) win.showInactive();
    await win.webContents.debugger.sendCommand("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
    await win.webContents.debugger.sendCommand("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
    await until("window.qaTheme.profile==='chalk'", "keyboard selects profiles");
    await new Promise(resolve => { win.webContents.once("did-finish-load", resolve); win.webContents.reload(); });
    await until("window.qaTheme?.profile==='chalk'", "selected profile survives reload");
    assert.equal(await evaluate("document.documentElement.style.colorScheme"), "light");
    await evaluate("window.qaView('settings')");
    await click("Reset to default");
    await until("window.qaTheme.profile==='ember'", "reset restores Ember");
    assert.equal(await evaluate("window.qaTheme.fonts.ui"), "Geist, Inter");
    await evaluate("document.querySelector('[aria-label=\"Dune, light theme\"]').click()");
    await until("window.qaTheme.profile==='dune'", "light profile selected for customization");
    await evaluate("document.querySelector('.u-theme-customize').open=true");
    await evaluate("window.qaColorField=document.querySelector('[aria-label=\"Accent hex color\"]');window.qaColorField.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(window.qaColorField,'#7A');window.qaColorField.dispatchEvent(new Event('input',{bubbles:true}))");
    await until("document.querySelector('[aria-label=\"Accent hex color\"]').value==='#7A'", "partial color is editable");
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('themeV1')).accent"), "#8B482F", "partial color does not overwrite saved theme");
    await evaluate("Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(window.qaColorField,'#7A3456');window.qaColorField.dispatchEvent(new Event('input',{bubbles:true}))");
    await until("window.qaTheme.accent==='#7A3456'&&window.qaTheme.profile==='custom'", "custom edit updates theme and selection state");
    assert.equal(await evaluate("document.activeElement===window.qaColorField&&window.qaColorField.isConnected"), true, "editing a valid color retains keyboard focus");
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Theme profiles\"] [aria-pressed=true]')===null"), true);
    for (const width of [1100, 736, 420]) {
      win.setSize(width, 960);
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.ok(await evaluate("document.querySelector('.u-theme-profile-grid').scrollWidth<=document.querySelector('.u-theme-profile-grid').clientWidth+1"), `profile grid fits ${width}px`);
    }
    win.setSize(1100, 960);
    await click("Reset to default");
    await evaluate("document.querySelector('.u-theme-customize').open=false");
    await new Promise(resolve => setTimeout(resolve, 150));
    fs.writeFileSync(process.env.UNBIASED_THEME_SCREENSHOT || "/tmp/unbiased-theme-settings-ember.png", (await win.webContents.capturePage()).toPNG());
    await evaluate("document.querySelector('[aria-label=\"Chalk, light theme\"]').click()");
    await new Promise(resolve => setTimeout(resolve, 150));
    fs.writeFileSync("/tmp/unbiased-theme-settings-chalk.png", (await win.webContents.capturePage()).toPNG());
    assert.deepEqual(errors.filter(error => !error.includes("Electron Security Warning")), []);
    console.log("PASS: real settings select six profiles by mouse/keyboard, preserve fonts and legacy preferences, persist across reload, customize/reset, fit narrow layouts, retheme Prism/Mermaid and retain the running terminal.");
  } finally { win.destroy(); fs.rmSync(fixture, { recursive: true, force: true }); }
}
main().then(() => app.exit(0), error => { console.error(error); app.exit(1); });
