# Conversation state and Home personalization

The desktop main process owns one versioned metadata record per conversation.
It is separate from durable memory notes and context-compaction checkpoints.

## Storage and ownership

Records live under the app's private userData directory at
`conversation-metadata/<owner-hash>/<thread-hash>.json`. The owner is the verified
organization/member identity when available; otherwise an API-key fingerprint
isolates records. Raw keys are never written into the metadata. Files use atomic
replacement and private permissions. Refreshing a summary updates the same file.

Each record contains execution status, goal, current focus, reported progress,
decisions, pending work, blockers, completed/summarized counters, pending turn IDs,
the last summarized turn ID, evidence turn IDs, revision and timestamps.

## Cadence

- Execution status updates from engine start/completion and approval/input events.
- The first meaningful completed user turn produces an initial summary.
- Each additional 25 meaningful completed user turns refreshes that summary.
- Automatic continuation fragments, duplicate events, empty turns, failed and
  interrupted turns do not increment the cadence. A continuation chain can finish
  the initial summary without becoming another user turn.
- Counters and cursor persist across app restarts. Failed jobs retain pending
  evidence and do not advance the cursor.

The worker merges the previous context with new bounded user/assistant text and
small tool outcome records. It does not send images, complete tool output, or the
whole transcript to the model. Evidence is secret-redacted before transmission.
A plan/promise must not be represented as completed work. Missing older evidence
is marked as partial coverage rather than represented as complete knowledge.

## Background behavior

The production worker starts at most one summary request at a time and waits to
start queued work while interactive turns are running. Per-conversation model
attempts are separated by two minutes and coalesced. Summary calls do not block
chat send/completion. An already-running background request may finish alongside
a newly started interactive turn.

Old jobs merge into the latest execution-state record and check owner, key,
abort state and cursor before committing. Deletion aborts that conversation's job
and removes its record. Sign-out cancels queued/in-flight work. Personalization
cache invalidation prevents an in-flight recap from reintroducing deleted context.

## Home recap

Home supplies conversation IDs; the main process attaches trusted metadata from
its own store. Renderer-supplied context is ignored. Existing recent conversations
without records are backfilled through the same bounded worker. The UI shows a
background preparation state and refreshes when metadata arrives. The recap uses
conversation goals, decisions, progress, blockers and remaining work, with titles
only as supporting context. It does not invent a personal biography.

## Validation

`npm test`, `npm run typecheck`, `npm run smoke:home`, and `npm run build`.
The metadata tests cover cadence, in-place updates, persistence, duplicate and
continuation handling, failure retry, concurrent status updates, deletion,
owner/key isolation, bounded evidence and background concurrency.

Recap requests deduplicate only identical source fingerprints. A changed source arriving during generation never subscribes to the old stream. After that generation finishes, the caller rechecks its own fingerprint; cached older text is marked stale and includes a retry deadline. Home quietly retries when the existing throttle expires, even if no further metadata event arrives, and cancels that timer when sources change or Home unmounts.
