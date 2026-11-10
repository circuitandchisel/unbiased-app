import test from "node:test";
import { execFileSync } from "node:child_process";

// Exercise the real Unix-socket daemon with a local fake engine. No SSH,
// credentials, remote installation, or inference requests are involved.
test("SSH bridge reconnects, replays pending approval, and never resends accepted work", () => {
  execFileSync("python3", ["-c", String.raw`
import json, os, pathlib, signal, socket, subprocess, sys, tempfile, time
helper = sys.argv[1]
with tempfile.TemporaryDirectory(prefix='ssh-bridge-', dir='/tmp') as temp:
    root = pathlib.Path(temp)
    fake = root / 'fake-engine'
    fake.write_text('#!' + sys.executable + '\n' + '''import json, pathlib, sys
root = pathlib.Path(__file__).parent
for line in sys.stdin:
    msg = json.loads(line)
    method = msg.get('method')
    if method == 'initialize':
        assert not (root/'initialized').exists(), 'initialize was repeated'
        (root/'initialized').write_text('1')
        print(json.dumps({'id': msg['id'], 'result': {'userAgent': 'fake', 'codexHome': str(root)}}), flush=True)
    elif method == 'test/start':
        count = root/'count'
        count.write_text(str(int(count.read_text())+1) if count.exists() else '1')
        print(json.dumps({'id': msg['id'], 'result': {'accepted': True}}), flush=True)
        print(json.dumps({'method': 'turn/started', 'params': {'threadId': 'remote'}}), flush=True)
        print(json.dumps({'id': 99, 'method': 'item/commandExecution/requestApproval', 'params': {'threadId': 'remote'}}), flush=True)
    elif method == 'test/ping':
        print(json.dumps({'id': msg['id'], 'result': {'count': (root/'count').read_text(), 'approved': (root/'approved').exists()}}), flush=True)
    elif msg.get('id') == 99 and 'result' in msg:
        (root/'approved').write_text('yes')
''')
    fake.chmod(0o700)
    (root/'runtime.json').write_text(json.dumps({'enginePath': str(fake)}))
    daemon = subprocess.Popen([sys.executable, helper, 'daemon', temp], start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    clients = []
    def attach(after):
        s = socket.socket(socket.AF_UNIX); s.settimeout(3)
        s.connect(str(root/'rpc.sock')); stream = s.makefile('rb')
        clients.append((s, stream))
        s.sendall((json.dumps({'after': after})+'\n').encode())
        return s, stream
    def send(s, msg): s.sendall((json.dumps(msg)+'\n').encode())
    def read_until(stream, predicate):
        for _ in range(20):
            line = stream.readline()
            assert line, 'bridge closed unexpectedly'
            msg = json.loads(line)
            if predicate(msg): return msg
        raise AssertionError('expected message did not arrive')
    try:
        deadline = time.monotonic() + 5
        while not (root/'rpc.sock').exists():
            assert time.monotonic() < deadline, 'daemon startup timed out'
            time.sleep(.01)
        s, stream = attach(0)
        send(s, {'method': 'initialize', 'id': 1, 'params': {}})
        assert read_until(stream, lambda m: m.get('id') == 1)['result']['userAgent'] == 'fake'
        send(s, {'method': 'initialized'})
        send(s, {'method': 'test/start', 'id': 2, 'params': {}})
        assert read_until(stream, lambda m: m.get('id') == 2)['result']['accepted']
        read_until(stream, lambda m: m.get('id') == 99)
        stream.close(); s.close(); clients.clear()
        # Let the daemon finish observing EOF before a new controlling attach.
        time.sleep(.05)
        s, stream = attach(0)
        read_until(stream, lambda m: m.get('method') == 'turn/started')
        read_until(stream, lambda m: m.get('id') == 99)
        send(s, {'method': 'initialize', 'id': 3, 'params': {}})
        read_until(stream, lambda m: m.get('id') == 3)
        send(s, {'method': 'initialized'})
        send(s, {'id': 99, 'result': {'decision': 'accept'}})
        send(s, {'method': 'test/ping', 'id': 4, 'params': {}})
        result = read_until(stream, lambda m: m.get('id') == 4)['result']
        assert result == {'count': '1', 'approved': True}, result
    finally:
        for s, stream in clients: stream.close(); s.close()
        if daemon.poll() is None: os.killpg(daemon.pid, signal.SIGTERM)
        daemon.wait(timeout=5)
`, new URL("./ssh-helper.py", import.meta.url).pathname], { timeout: 15000, stdio: "pipe" });
});
