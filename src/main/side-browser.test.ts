import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { WebContents } from 'electron';
import type { Page } from 'playwright-core';
import { SideBrowserController, sideBrowserUrl, SIDE_BROWSER_TOOLS } from './side-browser';

class Contents extends EventEmitter {
  url = 'https://example.test/'; destroyed = false;
  getURL() { return this.url; }
  getTitle() { return 'Test page'; }
  isDestroyed() { return this.destroyed; }
}
function fixture(connect?: ConstructorParameters<typeof SideBrowserController>[1]) {
  let next = -1; let connections = 0; let closes = 0;
  const updates: Array<[string, number | undefined]> = [];
  const contents = new Map<number, Contents>();
  const page = { isClosed: () => false, goto: async (url: string) => { contents.get(-1)!.url = url; } } as unknown as Page;
  const controller = new SideBrowserController({
    create: root => { const id = next--; const wc = new Contents(); contents.set(id, wc); return { id, contents: wc as unknown as WebContents }; },
    controlled: () => {}, update: (root, reveal) => updates.push([root, reveal]),
  }, connect ?? (async () => { connections++; return { page, close: async () => { closes++; } }; }));
  return { controller, contents, updates, page, connections: () => connections, closes: () => closes };
}
test('accepts web URLs only and does not expose an agent resume tool', () => {
  for (const url of ['file:///etc/hosts', 'data:text/html,test', 'javascript:alert(1)', 'chrome://settings', 'https://a:b@example.com']) assert.throws(() => sideBrowserUrl(url));
  assert.equal(sideBrowserUrl('https://example.com'), 'https://example.com/');
  assert.equal(SIDE_BROWSER_TOOLS.some(tool => tool.name.includes('resume')), false);
});
test('existing tabs require control permission and cannot cross conversation boundaries', async () => {
  const f = fixture(); const wc = new Contents();
  f.controller.register(7, 'one', wc as unknown as WebContents);
  assert.deepEqual(f.controller.list('two'), []);
  await assert.rejects(f.controller.run('two', 7, async () => {}), /different conversation/);
  await assert.rejects(f.controller.run('one', 7, async () => {}), /obtain permission/);
  assert.equal(f.connections(), 0);
  f.controller.grant('one', 7);
  assert.equal(await f.controller.run('one', 7, async () => 'read'), 'read');
  assert.equal(f.connections(), 1);
  wc.url = 'file:///private/file';
  await assert.rejects(f.controller.run('one', 7, async () => {}), /HTTP/);
  await f.controller.shutdown();
});
test('help blocks queued reads and writes until a matching user resume', async () => {
  const f = fixture(); const tab = await f.controller.open('one', 'https://example.test/');
  let release!: () => void; let started!: () => void;
  const ready = new Promise<void>(r => { started = r; });
  const action = f.controller.run('one', tab.id, async () => { started(); await new Promise<void>(r => { release = r; }); });
  await ready;
  const queued = f.controller.run('one', tab.id, async () => assert.fail('queued action ran during user help'));
  const rejected = assert.rejects(queued, /control changed/);
  const help = await f.controller.requestHelp('one', tab.id, 'Please sign in.');
  release(); await action; await rejected;
  await assert.rejects(f.controller.run('one', tab.id, async () => {}), /waiting for the user/);
  assert.throws(() => f.controller.resume('two', tab.id, help.requestId), /different conversation/);
  assert.throws(() => f.controller.resume('one', tab.id, 'old-request'), /expired/);
  f.controller.resume('one', tab.id, help.requestId);
  assert.equal(await f.controller.run('one', tab.id, async () => 'resumed'), 'resumed');
  assert.equal(f.connections(), 2); assert.equal(f.closes(), 1);
  assert.equal(f.updates.filter(([, reveal]) => reveal === tab.id).length, 1);
  await f.controller.shutdown();
});
test('a help request or closed tab cannot acquire a connection that finishes late', async () => {
  for (const closeTab of [false, true]) {
    let connected!: (value: { page: Page; close: () => Promise<void> }) => void; let entered!: () => void; let closed = 0;
    const ready = new Promise<void>(r => { entered = r; });
    const f = fixture(async () => { entered(); return new Promise(r => { connected = r; }); });
    f.controller.register(5, 'one', new Contents() as unknown as WebContents, true);
    const action = f.controller.run('one', 5, async () => assert.fail('late action ran'));
    const rejected = assert.rejects(action, /paused or the tab closed/);
    await ready;
    if (closeTab) await f.controller.dispose(5); else await f.controller.requestHelp('one', 5, 'Help');
    connected({ page: f.page, close: async () => { closed++; } });
    await rejected; assert.equal(closed, 1);
    await f.controller.shutdown();
  }
});
test('pending opens reuse a tab, root tabs are isolated, and closed tabs are removed', async () => {
  let finish!: () => void;
  const f = fixture();
  f.page.goto = async () => { await new Promise<void>(r => { finish = r; }); return null; };
  const first = f.controller.open('one', 'https://example.test/');
  await new Promise(r => setImmediate(r));
  const second = await f.controller.open('one', 'https://example.test/');
  assert.equal(second.id, -1); assert.equal(f.controller.list('one').length, 1);
  finish(); await first;
  const wc = f.contents.get(-1)!; wc.destroyed = true; wc.emit('destroyed');
  assert.equal(f.controller.list('one').length, 0);
  await assert.rejects(f.controller.run('one', -1, async () => {}), /closed/);
  await f.controller.shutdown();
});

test('resuming help does not revive stale queued actions or late connections', async () => {
  let connected!: (value: { page: Page; close: () => Promise<void> }) => void;
  let started!: () => void; let closes = 0;
  const ready = new Promise<void>(r => { started = r; });
  const f = fixture(async () => { started(); return new Promise(r => { connected = r; }); });
  f.controller.register(9, 'one', new Contents() as unknown as WebContents, true);
  const action = f.controller.run('one', 9, async () => assert.fail('stale action revived'));
  const rejected = assert.rejects(action, /paused or the tab closed/);
  await ready;
  const help = await f.controller.requestHelp('one', 9, 'Confirm');
  f.controller.resume('one', 9, help.requestId);
  connected({ page: f.page, close: async () => { closes++; } });
  await rejected; assert.equal(closes, 1);
  await f.controller.shutdown();
});
