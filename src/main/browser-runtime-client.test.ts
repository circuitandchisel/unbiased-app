import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BrowserRuntimeClient } from "./browser-runtime-client";

for (const stage of ["port allocation", "runtime handshake"]) test(`shutdown waits for pending ${stage} and prevents late startup`, async () => {
  const root = mkdtempSync(join(tmpdir(), "unbiased-runtime-shutdown-"));
  const entry = join(root, "runtime.cjs"), log = join(root, "events");
  writeFileSync(entry, `const fs=require('node:fs');const log=${JSON.stringify(log)};
const event=value=>fs.appendFileSync(log,value+'\\n');
const answer=(id,result)=>process.stdout.write(JSON.stringify({id,result})+'\\n');
require('node:readline').createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);
if(r.method==='initialize'){event('initializing');setTimeout(()=>{event('initialized');answer(r.id,{protocolVersion:1,runtimeVersion:'fixture',tools:[],features:[],platform:process.platform})},100)}
else if(r.method==='shutdown'){event('shutdown');answer(r.id,{ok:true})}});`);
  const client = new BrowserRuntimeClient({ entry, executable: process.execPath,
    options: { browserRoot: root, home: root, tempDir: root }, onEvent: () => {} });
  const until = async (condition: () => boolean) => {
    for (let i = 0; i < 200; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
    assert.fail("Runtime did not reach the expected lifecycle state");
  };
  const events = () => existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [];
  let startup: ReturnType<BrowserRuntimeClient["ready"]> | undefined;
  try {
    startup = client.ready();
    if (stage === "runtime handshake") await until(() => events().includes("initializing"));
    const stopping = client.shutdown();
    assert.equal(client.shutdown(), stopping, "concurrent shutdown callers share cleanup");
    await assert.rejects(client.ready(), /shutting down/, "requests arriving during cleanup cannot restart the runtime");
    await startup;
    assert.equal((await stopping).ok, true);
    await until(() => !client.running);
    assert.deepEqual(events(), ["initializing", "initialized", "shutdown"], "startup finishes before cleanup, with no later child left alive");
    // Shutdown is reusable: a later explicit operation may start a new session.
    await client.ready();
    assert.equal(client.running, true);
    assert.equal((await client.shutdown()).ok, true);
    await until(() => !client.running);
    assert.deepEqual(events(), ["initializing", "initialized", "shutdown", "initializing", "initialized", "shutdown"]);
  } finally {
    await startup?.catch(() => undefined);
    await client.shutdown();
    await until(() => !client.running);
    rmSync(root, { recursive: true, force: true });
  }
});

test("desktop runtimes bind distinct ports, including while another app owns 9222", async () => {
  const root = mkdtempSync(join(tmpdir(), "unbiased-runtime-ports-"));
  const entry = join(root, "runtime.cjs");
  // The real pinned client speaks its normal initialization protocol to this
  // local fixture, which actually binds the allocated port until shutdown.
  writeFileSync(entry, `const net=require('node:net');const readline=require('node:readline');let server;
const answer=(id,result)=>process.stdout.write(JSON.stringify({id,result})+'\\n');
readline.createInterface({input:process.stdin}).on('line',async line=>{const r=JSON.parse(line);
if(r.method==='initialize'){server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(r.params.options.port,'127.0.0.1',resolve)});answer(r.id,{protocolVersion:1,runtimeVersion:'fixture',tools:[],features:['port:'+server.address().port],platform:process.platform})}
else if(r.method==='shutdown'){await new Promise(resolve=>server.close(resolve));answer(r.id,{ok:true})}});`);
  const occupied = createServer();
  await new Promise<void>((resolve, reject) => {
    occupied.once("error", error => {
      if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") resolve();
      else reject(error);
    });
    occupied.listen(9222, "127.0.0.1", resolve);
  });
  const client = (port?: number) => new BrowserRuntimeClient({ entry, executable: process.execPath,
    options: { browserRoot: root, home: root, tempDir: root, ...(port === undefined ? {} : { port }) }, onEvent: () => {} });
  const one = client(), two = client();
  let three: BrowserRuntimeClient | undefined;
  try {
    const [a, b, again] = await Promise.all([one.ready(), two.ready(), one.ready()]);
    const port = (caps: typeof a) => Number(caps.features[0].slice(5));
    assert.equal(port(a), port(again), "concurrent discovery shares one allocation and runtime");
    assert.notEqual(port(a), 9222); assert.notEqual(port(b), 9222);
    assert.notEqual(port(a), port(b), "dev and production do not contend for one Chrome port");
    assert.equal((await one.ready()).features[0], a.features[0], "ordinary calls retain the same browser session");
    // Explicit operator/test ports remain supported.
    await one.shutdown();
    three = client(port(a));
    assert.equal(port(await three.ready()), port(a));
  } finally {
    await Promise.all([one.shutdown(), two.shutdown(), three?.shutdown()]);
    if (occupied.listening) await new Promise<void>(resolve => occupied.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});
