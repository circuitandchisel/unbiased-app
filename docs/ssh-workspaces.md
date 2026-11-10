# SSH workspaces

Settings → SSH → Add connection accepts an OpenSSH host alias (for
example dev-server) or user@hostname, an optional port, and an optional
identity file. OpenSSH reads the user's existing config, agent, ProxyJump and
ProxyCommand settings. Password/passphrase prompts are not implemented in the
app: load a passphrase-protected key into the SSH agent first. New host keys
must be verified through ordinary SSH before the app connects; host checking
is never disabled.

Connect, choose **Add a remote project**, browse to the repository, and create
the project. Select it in the normal project picker, including Mosaic. Native
engine tools execute directly on the host. The desktop file viewer, file tree,
Git/review operations, and terminal use that host too. Native desktop computer
tools and desktop-local MCP/skill configuration are not implicitly exported.
Remote project AGENTS.md and native project skill discovery run on the host.

## Runtime and authentication

- Linux x86-64 and ARM64 with Python 3, OpenSSH, and an existing compatible
  standalone app-engine installation. The user runs any installation/update
  commands manually; Connect never downloads, copies, or replaces engine binaries.
- Connect first checks SSH reachability and reports **Connected**. If the engine
  is missing or incompatible, the host card shows the public curl command pinned
  to the desktop's required runtime version. **Copy** only copies text.
- After running the displayed command themselves, the user selects **Check again**.
  The app verifies both engine and app-server versions before starting a session.
- Authentication requires a valid ~/.unbiased/credentials.json on the host.
  The app never copies desktop credentials or provisions remote sign-in.
- Connection-specific configuration and the Python transport adapter live under
  ~/.cache/unbiased-ssh/<connection-id>. They reference the user-installed engine
  in place. No compiler, administrator access, or engine installation is required
  during connection.
- If an old session holds the transport lock with a different runtime, setup
  pauses and shows a guarded stop command for the user to run manually after
  finishing existing work. It never kills a process or rewrites the active session.
- The provider uses the stable pareto alias. Desktop server tools, when eligible,
  are brokered through the desktop account.
- Sandboxed modes require the host's Linux sandbox prerequisites. Missing
  bubblewrap is reported; sandboxed starts are rejected before inference. The app
  never grants Full Access silently or changes host security settings.

Build the native engine bundle as usual, then npm run dev / npm run dist copies
VERSION and engine.lock from the pinned app-engine checkout into the bundle.
UNBIASED_ENGINE_DIR selects an alternative source checkout's dist/bundle.
Plain npm run build remains usable for renderer CI without an engine checkout.

Detection uses --version with a five-second timeout per binary, without a model
request. Custom installation roots are resolved from the public installer's
literal launcher path without shell evaluation. Checks never install software.

## Identity and recovery

Project folders use a private host-qualified path namespace internally.
Remote native thread UUIDs have persisted host ownership, including subagents;
offline requests reject instead of falling back to a local engine. Hostname
or port changes are refused after a connection owns chats. Create another
connection when moving to a different machine.

One private Python supervisor per connection runs the app-server over stdio
and listens on a user-only Unix socket. The desktop attaches over SSH. Engine
requests are correlated independently of the desktop request IDs. Command
and file approvals return to the desktop with host-scoped request IDs.

Disconnect detaches the transport and leaves ongoing remote work running.
Reconnect replays notifications after the saved cursor and reissues pending
approval cards. User turns and tool commands are never automatically resent.
The in-memory replay buffer is bounded at 32 MB / 20,000 events. On an event
gap or daemon restart, the desktop reconciles from durable engine history;
active-process survival across a server reboot is not promised.

An engine or bridge upgrade never hot-swaps a live daemon: finish work and
stop that private session before upgrading its runtime. Remote terminals
remain normal SSH PTYs and close when their terminal tab closes.

## Validation

- npm test: includes host isolation, offline routing/cache, sandbox preflight,
  approval routing and reconnect ownership checks.
- npm run smoke:ssh-ui: deterministic Electron connection/picker interaction.
- UNBIASED_SSH_SMOKE_HOST=dev-server UNBIASED_ENGINE_DIR=<bundle>
  npm run smoke:ssh: explicit live check using the host's own sign-in and a
  small paid Pareto turn. It creates a private test profile, inspects the
  devbox repository read-only, drops SSH during a controlled counter command,
  reconnects, and asserts the command ran once. It cleans its own profile.

No public TCP service is exposed. Disconnecting the desktop does not erase
remote conversation history. Removing a connection is blocked while its
projects/chats are still registered. To stop a private remote supervisor
manually, first finish its work, then terminate the daemon PID recorded in
that connection's daemon.pid (verify the process identity before doing so).

Create project also offers a device selector: This computer, saved SSH hosts,
and Add remote. Remote folder browsing fills the name from the chosen folder
and only registers the project when Create project is confirmed. A project
keeps all source folders on one device; remove its folders before switching.
Engine setup stays manual when a selected SSH host is not ready.
