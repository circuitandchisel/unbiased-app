// Real SettingsView -> production preload -> production IPC/store, in an isolated home.
const assert = require("node:assert/strict");
const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { build } = require("esbuild");
require("tsx/cjs");
const { agentInstructionsPath, connectAgentInstructions, registerAgentInstructionsIpc } = require("../src/main/agent-instructions.ts");
const { DEFAULT_AGENT_INSTRUCTIONS } = require("../src/shared/default-agent-instructions.ts");

async function main() {
  const home = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), "unbiased-personalization-")));
  app.setPath("userData", join(home, "electron"));
  await app.whenReady();
  registerAgentInstructionsIpc(ipcMain, home);
  const file = agentInstructionsPath(home);
  const engineHome = join(home, "engine");
  connectAgentInstructions(home, engineHome);
  const codex = join(home, ".codex", "AGENTS.md");
  fs.mkdirSync(join(home, ".codex")); fs.writeFileSync(codex, "Do not change me.");
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import {SettingsView,SidebarSectionPreview,DEFAULT_THEME} from './src/renderer/src/App';
      const noop=()=>{};
      function Fixture(){const [tab,setTab]=React.useState(null);return tab
        ? <SettingsView initialTab={tab} theme={DEFAULT_THEME} onChange={noop} onBack={()=>setTab(null)} onOpenProject={noop} onOpenConnectors={noop} onOpenScheduled={noop} onOpenWhatsNew={noop} onUpdate={noop} onSignOut={noop} releases={[]} />
        : <div style={{width:320}}><SidebarSectionPreview section="settings" projects={[]} mosaicChats={[]} updateVersion={null} latestRelease={null} onOpenSettings={setTab} /></div>;}
      createRoot(document.getElementById('root')).render(<Fixture />);
    ` },
    bundle: true, write: false, outfile: "settings.js", platform: "browser", format: "iife", logLevel: "silent",
    plugins: [{ name: "settings-test-exports", setup(b) {
      b.onLoad({ filter: /\.md$/ }, a => ({ contents: fs.readFileSync(a.path, "utf8"), loader: "text" }));
      b.onLoad({ filter: /\/src\/renderer\/src\/App\.tsx$/ }, a => ({ contents: fs.readFileSync(a.path, "utf8") + "\nexport {SettingsView,SidebarSectionPreview,DEFAULT_THEME};", loader: "tsx" }));
    } }],
  });
  const win = new BrowserWindow({ show: false, width: 1200, height: 850, webPreferences: { preload: resolve("out/preload/index.js"), contextIsolation: true, sandbox: true } });
  try {
    const html = join(home, "settings.html");
    const js = bundle.outputFiles.find(file => file.path.endsWith(".js")).text;
    const css = bundle.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? "";
    const baseStyles = [...fs.readFileSync("src/renderer/index.html", "utf8").matchAll(/<style>([\s\S]*?)<\/style>/g)].map(match => match[1]).join("\n");
    fs.writeFileSync(html, `<!doctype html><style>${baseStyles}${css}body{margin:0;font:14px system-ui;background:#111;color:#eee;--bg:#111;--fg:#eee;--fg-soft:#ccc;--fg-msg:#ddd;--panel:#1e1e1e;--panel-2:#252525;--border:#333;--dim:#999;--accent:#ff7764;--font-ui:system-ui;--font-code:monospace}button{font:inherit}</style><div id="root"></div><script>${js.replaceAll("</script", "<\\/script")}</script>`);
    await win.loadFile(html);
    const evaluate = code => win.webContents.executeJavaScript(code);
    const until = async (code, message) => {
      for (let i = 0; i < 60; i++) {
        if (await evaluate(code)) return;
        await new Promise(r => setTimeout(r, 50));
      }
      assert.fail(message + ": " + await evaluate("document.body.innerText"));
    };
    const click = async label => {
      await until(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(label)})`, "Missing " + label);
      await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}).click()`);
    };
    const type = text => evaluate(`{const t=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,${JSON.stringify(text)});t.dispatchEvent(new Event('input',{bubbles:true}));}`);
    await click("Personalization");
    await until("!!document.querySelector('[aria-controls=\"default-agent-instructions\"]')", "Default instructions card mounts");
    await evaluate("document.querySelector('[aria-controls=\"default-agent-instructions\"]').click()");
    await until("!!document.querySelector('#default-agent-instructions')", "Default instructions expand");
    const defaultsText = await evaluate("document.querySelector('#default-agent-instructions').textContent");
    for (const rule of DEFAULT_AGENT_INSTRUCTIONS) assert.ok(defaultsText.includes(rule.text));
    assert.equal(await evaluate("document.querySelectorAll('#default-agent-instructions input, #default-agent-instructions textarea, #default-agent-instructions [contenteditable=true], #default-agent-instructions button').length"), 0, "built-in rules have no editing or saving controls");
    if (process.env.UNBIASED_PERSONALIZATION_SCREENSHOT) {
      await new Promise(r => setTimeout(r, 100));
      fs.writeFileSync(process.env.UNBIASED_PERSONALIZATION_SCREENSHOT.replace(/\.png$/, "-defaults.png"), (await win.webContents.capturePage()).toPNG());
    }
    await evaluate("document.querySelector('[aria-controls=\"default-agent-instructions\"]').click()");
    await until("!!document.querySelector('[aria-controls=\"custom-agent-instructions-editor\"]')", "Custom instructions card mounts");
    await evaluate("document.querySelector('[aria-controls=\"custom-agent-instructions-editor\"]').click()");
    await until("!!document.querySelector('textarea:not(:disabled)')", "Instructions load");
    const rules = "Never merge a PR without my explicit consent.\nKeep AWS read-only.";
    await type(rules); await click("Save");
    await until("document.querySelector('[role=status]')?.textContent.startsWith('Saved.')", "Save completes");
    assert.equal(fs.readFileSync(file, "utf8"), rules);
    assert.equal(fs.readFileSync(join(engineHome, "AGENTS.md"), "utf8"), rules);
    await evaluate("document.querySelector('[aria-controls=\"default-agent-instructions\"]').click()");
    await until("!!document.querySelector('#default-agent-instructions')", "Defaults reopen after saving custom rules");
    assert.equal(await evaluate("document.querySelector('#default-agent-instructions').textContent"), defaultsText, "custom saves leave built-in defaults unchanged");
    await evaluate("document.querySelector('[aria-controls=\"default-agent-instructions\"]').click()");
    await click("Appearance"); await click("Personalization");
    await evaluate("document.querySelector('[aria-controls=\"custom-agent-instructions-editor\"]').click()");
    await until(`document.querySelector('textarea')?.value===${JSON.stringify(rules)}`, "Saved rules survive remount");
    await type("Stale editor draft"); fs.writeFileSync(file, "External agent edit");
    await click("Save");
    await until("document.querySelector('[role=alert]')?.textContent.includes('changed outside')", "External edit conflict is visible");
    assert.equal(fs.readFileSync(file, "utf8"), "External agent edit");
    assert.equal(await evaluate("document.querySelector('textarea').value"), "Stale editor draft");
    await click("Reload from file");
    await until("document.querySelector('textarea')?.value==='External agent edit'", "Reload reads external edit");
    if (process.env.UNBIASED_PERSONALIZATION_SCREENSHOT) {
      await new Promise(r => setTimeout(r, 100));
      fs.writeFileSync(process.env.UNBIASED_PERSONALIZATION_SCREENSHOT, (await win.webContents.capturePage()).toPNG());
    }
    await type(""); await click("Save");
    await until("document.querySelector('[role=status]')?.textContent.startsWith('Saved.')", "Clearing saves");
    assert.equal(fs.readFileSync(file, "utf8"), "");
    assert.equal(fs.readFileSync(codex, "utf8"), "Do not change me.");
    console.log("PASS: Settings preview opens Personalization; built-in defaults are read-only and separate from editable custom instructions; real settings save, reload, remount, clear and reject stale edits through production preload/IPC; engine link follows edits; Codex is untouched.");
  } finally { win.destroy(); fs.rmSync(home, { recursive: true, force: true }); }
}
const deadline = setTimeout(() => { console.error("Personalization regression timed out"); app.exit(1); }, 30000); deadline.unref();
main().then(() => app.exit(0), error => { console.error(error); app.exit(1); });
