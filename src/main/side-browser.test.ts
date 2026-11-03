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


test('Full access controls existing tabs without invoking approval', async () => {
  const f = fixture();
  f.controller.register(7, 'one', new Contents() as unknown as WebContents);
  await f.controller.use('one', 7, true, async () => assert.fail('Full access must not prompt'));
  assert.equal(f.controller.list('one')[0].controlled, true);
  assert.equal(await f.controller.run('one', 7, async () => 'clicked'), 'clicked');
  await f.controller.shutdown();
});
test('approval mode asks before control, preserves denial, and reuses an approved grant', async () => {
  const f = fixture();
  f.controller.register(7, 'one', new Contents() as unknown as WebContents);
  let prompts = 0;
  await assert.rejects(f.controller.use('one', 7, false, async () => { prompts++; return false; }), /declined/);
  assert.equal(f.controller.list('one')[0].controlled, false);
  assert.equal(f.connections(), 0);
  await f.controller.use('one', 7, false, async tab => { prompts++; assert.equal(tab.origin, 'https://example.test'); return true; });
  await f.controller.use('one', 7, false, async () => assert.fail('already-approved tab must not prompt again'));
  assert.equal(prompts, 2); assert.equal(f.controller.list('one')[0].controlled, true);
  await f.controller.shutdown();
});
test('Full access preserves conversation isolation and cannot resume a user handoff', async () => {
  const f = fixture();
  f.controller.register(7, 'one', new Contents() as unknown as WebContents);
  const noPrompt = async () => assert.fail('Full access must not prompt');
  await assert.rejects(f.controller.use('two', 7, true, noPrompt), /different conversation/);
  await f.controller.use('one', 7, true, noPrompt);
  await f.controller.requestHelp('one', 7, 'Please sign in');
  await f.controller.use('one', 7, true, noPrompt);
  await assert.rejects(f.controller.run('one', 7, async () => {}), /waiting for the user/);
  await f.controller.shutdown();
});
test('a site change during approval requires a fresh control request', async () => {
  const f = fixture(); const contents = new Contents();
  f.controller.register(7, 'one', contents as unknown as WebContents);
  await assert.rejects(f.controller.use('one', 7, false, async () => { contents.url = 'https://different.test/'; return true; }), /changed sites/);
  assert.equal(f.controller.list('one')[0].controlled, false);
  await f.controller.shutdown();
});

test('browser work stays active between calls and ends per worker, without clearing another agent', async () => {
  const f = fixture();
  f.controller.register(7, 'one', new Contents() as unknown as WebContents, true);
  assert.equal(f.controller.list('one')[0].working, false);
  await f.controller.run('one', 7, async () => {}, false, 'parent');
  await f.controller.run('one', 7, async () => {}, false, 'child');
  assert.equal(f.controller.list('one')[0].working, true);
  assert.ok(f.controller.list('one')[0].lastUsedAt > 0);
  f.controller.finishWorker('parent');
  assert.equal(f.controller.list('one')[0].working, true);
  f.controller.finishWorker('child');
  assert.equal(f.controller.list('one')[0].working, false);
  f.controller.beginWorker('child');
  await f.controller.run('one', 7, async () => {}, false, 'child');
  f.controller.finishWorker();
  assert.equal(f.controller.list('one')[0].working, false);
  await f.controller.shutdown();
});
test('user handoff clears browser work; continuing alone does not claim the agent is working', async () => {
  const f = fixture();
  const tab = await f.controller.open('one', 'https://example.test/');
  assert.equal(tab.working, true);
  const help = await f.controller.requestHelp('one', tab.id, 'Please sign in');
  assert.equal(f.controller.list('one')[0].working, false);
  f.controller.resume('one', tab.id, help.requestId);
  assert.equal(f.controller.list('one')[0].working, false);
  await f.controller.run('one', tab.id, async () => {});
  assert.equal(f.controller.list('one')[0].working, true);
  await f.controller.shutdown();
  assert.deepEqual(f.controller.list('one'), []);
});

test('reusing an already-open page starts browser work for the new run without navigating', async () => {
  const f = fixture();
  const first = await f.controller.open('one', 'https://example.test/');
  f.controller.finishWorker('one');
  assert.equal(f.controller.list('one')[0].working, false);
  f.controller.beginWorker('child');
  const reused = await f.controller.open('one', 'https://example.test/', 'child');
  assert.equal(reused.id, first.id); assert.equal(reused.working, true);
  assert.equal(f.connections(), 1);
  f.controller.finishWorker('child');
  assert.equal(f.controller.list('one')[0].working, false);
  await f.controller.shutdown();
});

test('stopping rejects queued work, preserves another worker and allows a fresh turn', async () => {
  const f = fixture();
  f.controller.register(7, 'one', new Contents() as unknown as WebContents, true);
  let release!: () => void, entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const active = f.controller.run('one', 7, async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); }, false, 'stopped');
  await started;
  const activeRejected = assert.rejects(active, { name: 'AbortError' });
  const queued = f.controller.run('one', 7, async () => assert.fail('stopped action executed'), false, 'stopped');
  const rejected = assert.rejects(queued, { name: 'AbortError' });
  const other = f.controller.run('one', 7, async () => 'other worker', false, 'other');
  f.controller.finishWorker('stopped');
  assert.equal(f.controller.list('one')[0].working, false);
  release(); await activeRejected; await rejected;
  assert.equal(await other, 'other worker');
  assert.equal(f.closes(), 1, 'active connection is detached on cancellation');
  assert.equal(f.connections(), 2, 'unaffected worker reconnects after cancellation');
  await assert.rejects(f.controller.run('one', 7, async () => {}, false, 'stopped'), { name: 'AbortError' });
  f.controller.beginWorker('stopped');
  assert.equal(await f.controller.run('one', 7, async () => 'fresh turn', false, 'stopped'), 'fresh turn');
  await f.controller.shutdown();
});
test('a late approval cannot grant browser control after Stop, even if a new turn has started', async () => {
  const f = fixture();
  f.controller.register(7, 'one', new Contents() as unknown as WebContents);
  let approve!: (value: boolean) => void;
  const use = f.controller.use('one', 7, false, () => new Promise(resolve => { approve = resolve; }), 'worker');
  const rejected = assert.rejects(use, { name: 'AbortError' });
  f.controller.finishWorker('worker'); f.controller.beginWorker('worker');
  approve(true); await rejected;
  assert.equal(f.controller.list('one')[0].controlled, false);
  await f.controller.shutdown();
});
test('a connection completing after Stop is closed without executing an action', async () => {
  let connected!: (value: { page: Page; close: () => Promise<void> }) => void, entered!: () => void;
  let closes = 0;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const f = fixture(async () => { entered(); return new Promise(resolve => { connected = resolve; }); });
  f.controller.register(7, 'one', new Contents() as unknown as WebContents, true);
  const action = f.controller.run('one', 7, async () => assert.fail('late action executed'), false, 'worker');
  const rejected = assert.rejects(action, /paused or the tab closed/);
  await started; f.controller.finishWorker('worker');
  connected({ page: f.page, close: async () => { closes++; } });
  await rejected; assert.equal(closes, 1); assert.equal(f.controller.list('one')[0].working, false);
  await f.controller.shutdown();
});
