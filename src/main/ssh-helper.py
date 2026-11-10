"""Private SSH session supervisor. JSONL only on the attach process's stdout.

The engine owns durable conversation history; this bridge buffers disconnect
events and never retries an ambiguous tool/turn RPC. No public network listener.
"""
import base64
import collections
import fcntl
import json
import os
import pathlib
import selectors
import socket
import subprocess
import sys
import threading
import time

ROOT = pathlib.Path(sys.argv[2]).resolve()
SOCKET = ROOT / 'rpc.sock'
MAX_LINE = 32 * 1024 * 1024  # Holds a 20 MB attachment after base64 + JSON framing.


def frame(value):
    return (json.dumps(value, separators=(',', ':')) + '\n').encode()


def workspace(p):
    op = p.get('op')
    path = p.get('path', str(pathlib.Path.home()))
    if not isinstance(path, str) or not path.startswith('/') or '\0' in path:
        raise ValueError('An absolute remote path is required')
    target = pathlib.Path(path)
    if op == 'list':
        entries = [{'name': f.name, 'dir': f.is_dir()} for f in target.iterdir()]
        return {'dir': str(target), 'entries': sorted(entries, key=lambda x: (not x['dir'], x['name'].lower()))}
    if op == 'stat':
        return {'exists': target.exists(), 'dir': target.is_dir(), 'file': target.is_file()}
    if op in ('read', 'image'):
        limit = 15_000_000 if op == 'image' else 1_000_000
        with target.open('rb') as f:
            data = f.read(limit + 1)
        if len(data) > limit:
            raise ValueError('File exceeds viewer size limit')
        if op == 'image':
            return {'base64': base64.b64encode(data).decode(), 'suffix': target.suffix.lower()}
        if b'\0' in data:
            raise ValueError('Binary file')
        return {'fullPath': str(target), 'relPath': str(target), 'content': data.decode('utf-8', errors='replace')}
    if op == 'upload':
        data = base64.b64decode(p['data'], validate=True)
        if len(data) > 20_000_000:
            raise ValueError('Attachment too large')
        uploads = ROOT / 'uploads'
        uploads.mkdir(mode=0o700, exist_ok=True)
        import uuid
        out = uploads / (str(uuid.uuid4()) + pathlib.Path(p.get('name', '')).suffix[:12])
        out.write_bytes(data)
        out.chmod(0o600)
        return {'path': str(out)}
    if op in ('exec', 'worktree'):
        if op == 'worktree':
            import re
            name = p.get('name', '')
            if not re.fullmatch(r'[a-z0-9-]{1,80}', name):
                raise ValueError('Invalid worktree name')
            parent = target / '.unbiased' / 'worktrees'
            parent.mkdir(parents=True, exist_ok=True)
            exclude = subprocess.run(['git', 'rev-parse', '--path-format=absolute', '--git-path', 'info/exclude'], cwd=path, capture_output=True, text=True, timeout=10, check=True).stdout.strip()
            exclude_file = pathlib.Path(exclude)
            current = exclude_file.read_text() if exclude_file.exists() else ''
            if '.unbiased/' not in current.splitlines():
                exclude_file.parent.mkdir(parents=True, exist_ok=True)
                with exclude_file.open('a') as f:
                    f.write('\n.unbiased/\n')
            argv = ['git', 'worktree', 'add', str(parent / name), '-b', 'pareto/' + name]
        else:
            argv = p.get('argv')
        if not isinstance(argv, list) or not argv or any(not isinstance(a, str) or '\0' in a for a in argv):
            raise ValueError('Invalid command arguments')
        # Output goes to a file so a runaway command cannot exhaust daemon RAM.
        import tempfile
        with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
            proc = subprocess.Popen(argv, cwd=path, stdout=out, stderr=err, start_new_session=True)
            try:
                code = proc.wait(timeout=60)
            except subprocess.TimeoutExpired:
                import signal
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait()
                raise ValueError('Remote command timed out')
            out.seek(0); err.seek(0)
            return {'out': out.read(4_000_000).decode(errors='replace'), 'err': err.read(4_000_000).decode(errors='replace'), 'code': code}
    raise ValueError('Unknown workspace operation')


def daemon():
    os.umask(0o077)
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    lock = open(ROOT / 'daemon.lock', 'a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return
    SOCKET.unlink(missing_ok=True)
    listener = socket.socket(socket.AF_UNIX)
    listener.bind(str(SOCKET)); listener.listen(4)
    cfg = json.loads((ROOT / 'runtime.json').read_text())
    env = dict(os.environ)
    # Authentication is resolved on this host; never accept inherited desktop tokens.
    env.pop('UNBIASED_API_KEY', None)
    env['RUST_LOG'] = 'error'
    log = open(ROOT / 'engine.log', 'ab', buffering=0)
    engine = subprocess.Popen([cfg['enginePath'], '--home', str(ROOT / 'home'), '--mcp-config', str(ROOT / 'empty-mcp.json')], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=log, env=env)
    (ROOT / 'daemon.pid').write_text(str(os.getpid()))
    gate = threading.RLock()
    stdin_gate = threading.Lock()
    client = None
    seq = 0
    history = collections.deque()
    history_bytes = 0
    pending = {}
    approvals = {}
    init_result = None
    initialized = False
    counter = 0

    def deliver(message, record=False):
        nonlocal seq, client, history_bytes
        with gate:
            payload = frame(message)
            if record:
                seq += 1
                cursor = frame({'method': 'unbiased/ssh/cursor', 'params': {'cursor': seq}})
                history.append((seq, payload + cursor))
                history_bytes += len(payload) + len(cursor)
                while history and (len(history) > 20000 or history_bytes > 32_000_000):
                    history_bytes -= len(history.popleft()[1])
                payload += cursor
            if client:
                try: client.sendall(payload)
                except OSError:
                    client.close(); client = None

    def to_engine(message):
        with stdin_gate:
            engine.stdin.write(frame(message)); engine.stdin.flush()

    def reader():
        nonlocal init_result, initialized, client
        try:
            while True:
                line = engine.stdout.readline(MAX_LINE + 1)
                if not line: break
                if len(line) > MAX_LINE: raise ValueError('Engine frame exceeded limit')
                try: msg = json.loads(line)
                except ValueError: continue
                if 'method' in msg:
                    if 'id' in msg:
                        with gate: approvals[str(msg['id'])] = msg
                    deliver(msg, 'id' not in msg)
                elif 'id' in msg:
                    with gate:
                        request = pending.pop(str(msg['id']), None)
                        if request:
                            original, method, owner = request
                            if method == 'initialize' and 'result' in msg:
                                init_result = msg['result']
                            if owner is client:
                                deliver({**msg, 'id': original})
        finally:
            deliver({'method': 'unbiased/ssh/engine-exited', 'params': {}})
            listener.close()
            if client: client.close()
            os._exit(0)

    threading.Thread(target=reader, daemon=True).start()
    while True:
        conn, _ = listener.accept()
        conn.settimeout(10)
        stream = conn.makefile('rb')
        try:
            hello = json.loads(stream.readline(4096))
            after = hello.get('after', 0)
            if not isinstance(after, int) or after < 0: raise ValueError('Invalid replay cursor')
            conn.settimeout(None)
            with gate:
                if client:
                    # One controlling desktop connection per private profile.
                    raise ValueError('This remote session is already attached')
                client = conn
                if after > seq or (history and after < history[0][0] - 1):
                    conn.sendall(frame({'method': 'unbiased/ssh/replay-gap', 'params': {'cursor': seq}}))
                else:
                    for n, payload in history:
                        if n > after: conn.sendall(payload)
                for approval in approvals.values():
                    conn.sendall(frame(approval))
            while True:
                line = stream.readline(MAX_LINE + 1)
                if not line: break
                if len(line) > MAX_LINE: raise ValueError('Client frame exceeded limit')
                msg = json.loads(line)
                method = msg.get('method')
                if method == 'unbiased/workspace':
                    def run_work(msg=msg, owner=conn):
                        try: response = {'id': msg['id'], 'result': workspace(msg.get('params', {}))}
                        except Exception as e: response = {'id': msg['id'], 'error': {'code': -32000, 'message': str(e)}}
                        with gate:
                            if client is owner: deliver(response)
                    threading.Thread(target=run_work, daemon=True).start()
                    continue
                if method == 'initialize' and init_result is not None:
                    deliver({'id': msg['id'], 'result': init_result}); continue
                if method == 'initialized':
                    if not initialized:
                        to_engine(msg); initialized = True
                    continue
                if method and 'id' in msg:
                    with gate:
                        counter += 1
                        key = f'ssh-rpc-{counter}'
                        pending[key] = (msg['id'], method, conn)
                    to_engine({**msg, 'id': key})
                else:
                    if 'id' in msg:
                        with gate: approvals.pop(str(msg['id']), None)
                    to_engine(msg)
        except Exception as e:
            print(str(e), file=sys.stderr)
        finally:
            with gate:
                if client is conn: client = None
                for key in [key for key, value in pending.items() if value[2] is conn]: pending.pop(key, None)
            conn.close()


def attach():
    os.umask(0o077)
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    def connect():
        s = socket.socket(socket.AF_UNIX)
        try: s.connect(str(SOCKET)); return s
        except OSError: s.close(); return None
    s = connect()
    if s is None:
        subprocess.Popen([sys.executable, __file__, 'daemon', str(ROOT)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=open(ROOT/'bridge.log','ab'), start_new_session=True)
        for _ in range(100):
            time.sleep(.1); s = connect()
            if s: break
    if s is None: raise RuntimeError('Remote engine failed to start; check bridge.log')
    s.sendall(frame({'after': int(sys.argv[3])}))
    sel = selectors.DefaultSelector()
    sel.register(s, selectors.EVENT_READ)
    sel.register(sys.stdin.buffer, selectors.EVENT_READ)
    try:
        while True:
            for key, _ in sel.select():
                if key.fileobj is s:
                    data = s.recv(65536)
                    if not data: return
                    sys.stdout.buffer.write(data); sys.stdout.buffer.flush()
                else:
                    data = os.read(sys.stdin.fileno(), 65536)
                    if not data: return
                    s.sendall(data)
    finally: s.close()


if __name__ == '__main__':
    if sys.argv[1] == 'daemon': daemon()
    elif sys.argv[1] == 'attach': attach()
    else: raise ValueError('Unknown bridge mode')
