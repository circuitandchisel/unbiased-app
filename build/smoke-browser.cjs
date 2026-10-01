const assert = require("node:assert/strict");
const { execFile, spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { existsSync, mkdtempSync, rmSync } = require("node:fs");
const net = require("node:net");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { promisify } = require("node:util");

const exec = promisify(execFile);
const root = resolve(process.argv[2] ?? join(__dirname, "browser-bundle"));
const cli = join(root, "agent-browser");
const chrome = process.env.UNBIASED_TEST_CHROME || [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
].find(existsSync);

async function freePort() {
  const server = net.createServer();
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}

async function main() {
  const cliVersion = (await exec(cli, ["--version"])).stdout.trim();
  assert.ok(chrome, "Install Chrome, Chromium, Brave, or Edge to run the browser smoke test");
  const chromeVersion = (await exec(chrome, ["--version"])).stdout.trim();
  assert.equal(cliVersion, "agent-browser 0.38.1");

  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), "unbiased-browser-smoke-"));
  const env = { ...process.env, AGENT_BROWSER_NAMESPACE: `ub-${randomUUID().slice(0, 8)}` };
  const child = spawn(chrome, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "about:blank",
  ], { stdio: "ignore" });

  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (child.exitCode !== null) throw new Error(`Chrome exited with ${child.exitCode}`);
      try {
        ready = (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) })).ok;
      } catch {}
      if (ready) break;
      await new Promise((done) => setTimeout(done, 250));
    }
    if (!ready) throw new Error("Chrome did not open its CDP port");

    await exec(cli, ["connect", String(port)], { env, timeout: 30_000 });
    await exec(cli, ["open", "data:text/html,%3Ch1%3EBrowser%20smoke%3C%2Fh1%3E"], { env, timeout: 30_000 });
    const snapshot = await exec(cli, ["snapshot"], { env, timeout: 30_000 });
    assert.match(snapshot.stdout, /heading "Browser smoke"/);
    console.log(`${cliVersion}; ${chromeVersion}; CDP navigation and snapshot passed`);
  } finally {
    try { await exec(cli, ["close"], { env, timeout: 10_000 }); } catch {}
    if (child.exitCode === null) {
      const exited = new Promise((done) => child.once("exit", done));
      child.kill();
      await Promise.race([exited, new Promise((done) => setTimeout(done, 5_000))]);
    }
    try { rmSync(profile, { recursive: true, maxRetries: 5, retryDelay: 100 }); } catch {}
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
