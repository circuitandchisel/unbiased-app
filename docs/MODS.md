# First-party Mods host

Mods is a fixed, first-party sidecar bundled with Unbiased. The composer
switch enables its bundled plugins per conversation and is off by default. It receives only a
thread ID and one of three event kinds: turn started, turn completed, or dynamic
tool called. It does not receive prompts, tool arguments, model output, or
credentials. The `session-activity` plugin reports event counts through
`mods_session_stats`; `turn-timing` estimates elapsed time between events
through `mods_turn_timing`. Timing is observed by the sidecar, not by the model
gateway. Neither plugin writes files or modifies a turn.

The app launches `resources/mods/entry.cjs` as a separate Node process over
newline-delimited JSON-RPC. `manifest.json` declares the bundled plugins, their
event subscriptions, and their model-facing tool schemas. The app validates
the manifest without running plugin code, and the sidecar loads only the
fixed first-party implementations named in `entry.cjs`. The handshake pins
protocol version 2 and verifies that both sides agree on plugin and tool names.
Each plugin registers event handlers and tools through a small host API; those
registrations are removed on host disposal. The app enforces the conversation
switch before sending events or running a tool,
bounds the output and request sizes, times out requests, and fails an individual
tool call if the sidecar is unavailable. The sidecar receives a minimal
environment instead of the app's API credentials.

This is not a third-party mod host or a security sandbox. A process running as
the user can still access that user's files. Do not load externally supplied
code into this process. New first-party plugins require a reviewed manifest
entry and an explicit addition to the sidecar allowlist. Engine dynamic tools
are offered when a thread starts, so their definitions remain visible even when Mods is off; the switch
controls execution, not the context cost. A future engine capability would be
needed to add/remove tools cleanly for an existing conversation.
