"""Inspect an existing engine and prepare the SSH transport; never install engines."""
import base64
import fcntl
import hashlib
import json
import os
import pathlib
import platform
import re
import shlex
import shutil
import subprocess
import sys

c = json.loads(base64.b64decode(sys.argv[1]))
os.umask(0o077)
if platform.system() != 'Linux':
    raise RuntimeError('Remote workspaces currently require Linux')
home = pathlib.Path.home()
root = home / '.cache' / 'unbiased-ssh' / c['id']


def version_output(path, prefix):
    result = subprocess.run([str(path), '--version'], capture_output=True, text=True, timeout=5)
    match = re.fullmatch(re.escape(prefix) + r' ([0-9]+\.[0-9]+\.[0-9]+|dev)', result.stdout.strip())
    return match[1] if result.returncode == 0 and match else None


def standalone_engine():
    candidate = home / '.local' / 'bin' / 'unbiased-engine'
    if not candidate.exists():
        found = shutil.which('unbiased-engine') or shutil.which('unbiased-app-engine')
        if not found:
            return {'state': 'missing'}
        candidate = pathlib.Path(found)
    if not candidate.is_file() or not os.access(candidate, os.X_OK):
        return {'state': 'error', 'path': str(candidate)}
    try:
        # The public installer writes this small launcher. Parse its literal exec
        # path without evaluating shell code, so custom install roots work too.
        with candidate.open('rb') as stream:
            header = stream.read(4096)
        if b'# Managed by Unbiased engine installer' in header:
            lines = header.decode().splitlines()
            args = shlex.split(next(line for line in lines if line.startswith('exec ')))
            if len(args) != 3 or args[2] != '$@' or not args[1].startswith('/'):
                raise ValueError('Invalid engine launcher')
            candidate = pathlib.Path(args[1])
        candidate = candidate.resolve()
        version = version_output(candidate, 'unbiased-app-engine')
        server_version = version_output(candidate.parent / 'pareto-app-server', 'codex-app-server')
        if version and server_version:
            return {'state': 'installed', 'version': version, 'serverVersion': server_version, 'path': str(candidate)}
    except (OSError, ValueError, StopIteration, subprocess.SubprocessError):
        pass
    return {'state': 'error', 'path': str(candidate)}


def manual_restart():
    command = None
    try:
        pid = int((root / 'daemon.pid').read_text())
        if pid > 1:
            script = """import os, pathlib, signal, sys
root = pathlib.Path(sys.argv[1]).resolve()
pid = int(sys.argv[2])
try:
    args = (pathlib.Path('/proc') / str(pid) / 'cmdline').read_bytes().split(b'\\0')
except FileNotFoundError:
    print('The previous session has already stopped. Choose Check again in the app.')
    sys.exit(0)
expected = [str(root / 'helper.py').encode(), b'daemon', str(root).encode()]
if not all(value in args for value in expected) or os.getpgid(pid) != pid:
    raise SystemExit('This is no longer the expected SSH session; no process was stopped.')
os.killpg(pid, signal.SIGTERM)
"""
            command = 'python3 -c ' + shlex.quote(script) + ' ' + shlex.quote(str(root)) + ' ' + str(pid)
    except (OSError, ValueError):
        pass
    return {'title': 'Stop the previous session first',
            'message': 'A previous app session is still running on this host. Finish its work, then stop it manually and choose Check again. The app will not stop it for you.',
            'command': command}


if c['phase'] == 'engine-status':
    print(json.dumps(standalone_engine()))
    sys.exit(0)
if c['phase'] == 'detect':
    arch = {'x86_64': 'x64', 'aarch64': 'arm64'}.get(platform.machine())
    if not arch:
        raise RuntimeError('Unsupported remote architecture')
    print(json.dumps({'root': str(root), 'home': str(home), 'arch': arch,
                      'signedIn': (home / '.unbiased' / 'credentials.json').is_file(),
                      'sandboxReady': shutil.which('bwrap') is not None,
                      'standaloneEngine': standalone_engine()}))
    sys.exit(0)
if c['phase'] != 'prepare':
    raise RuntimeError('Engine installation and updates must be run manually')
engine = standalone_engine()
if engine.get('version') != c['version'] or engine.get('serverVersion') != c['serverVersion'] or engine.get('path') != c['enginePath']:
    raise RuntimeError('The installed engine changed. Check its installation again.')
# Only connection-specific transport/configuration is created here. Engine
# binaries remain at the path the user installed and are never copied/replaced.
root.mkdir(parents=True, exist_ok=True, mode=0o700)
if root.is_symlink() or root.stat().st_uid != os.getuid():
    raise RuntimeError('Unsafe remote runtime directory')
root.chmod(0o700)
helper = base64.b64decode(c['helper'])
fingerprint = {'version': c['version'], 'serverVersion': c['serverVersion'],
               'enginePath': c['enginePath'], 'helperSha': hashlib.sha256(helper).hexdigest()}
runtime = root / 'runtime.json'
lock = (root / 'daemon.lock').open('a')
try:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    current = json.loads(runtime.read_text()) if runtime.exists() else None
    print(json.dumps({'ok': True} if current == fingerprint else {'ok': False, 'actionRequired': manual_restart()}))
    sys.exit(0)
for name, content in [('helper.py', helper), ('runtime.json', json.dumps(fingerprint).encode()), ('empty-mcp.json', b'{"servers":[]}')]:
    staged = root / (name + '.next')
    staged.write_bytes(content)
    staged.replace(root / name)
print(json.dumps({'ok': True}))
