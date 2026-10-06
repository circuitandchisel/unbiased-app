# Mods v1

Mods v1 is a fixed, first-party sidecar bundled with Unbiased. The composer
switch enables it per conversation and is off by default. It receives only a
thread ID and one of three event kinds: turn started, turn completed, or dynamic
tool called. It does not receive prompts, tool arguments, model output, or
credentials. Its `mods_session_stats` dynamic tool reports those counts since
the sidecar started; it never writes files or modifies a turn.

The app launches `resources/mods/entry.cjs` as a separate Node process over
newline-delimited JSON-RPC. The handshake pins protocol version 1. The app
enforces the conversation switch before sending events or running its tool,
bounds the output and request sizes, times out requests, and fails an individual
tool call if the sidecar is unavailable. The sidecar receives a minimal
environment instead of the app's API credentials.

This is not a third-party mod host or a security sandbox. A process running as
the user can still access that user's files. Do not load externally supplied
code into this process. Engine dynamic tools are offered when a thread starts,
so the tool definition remains visible even when Mods is off; the switch
controls execution, not the context cost. A future engine capability would be
needed to add/remove tools cleanly for an existing conversation.
