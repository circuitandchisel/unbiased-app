# Unbiased

Unbiased desktop — a Pareto-powered coding agent in an Electron shell. The
app is a pure client: all agent intelligence lives in a separate
[`unbiased-app-engine`](https://github.com/circuitandchisel/unbiased-app-engine)
binary (a Pareto-locked codex app-server wrapper) that the app spawns and
speaks to over stdio.

**New here?** [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md) explains the whole
chain — UI, supervisor, codex app-server, gateway — and traces one message
from keystroke to file on disk.

<p align="center">
  <img src="resources/icon.png" alt="Unbiased icon" width="128" />
</p>

## Install

Unbiased requires an Apple Silicon Mac running macOS 12 or newer. Download
the latest build from
[unbiased-app-releases](https://github.com/circuitandchisel/unbiased-app-releases/releases/latest),
or use the verified installer:

```bash
curl -fsSL https://raw.githubusercontent.com/circuitandchisel/unbiased-app-releases/main/install.sh | bash
```

On first launch, choose **Sign in with browser** to select an Unbiased
workload, or paste an existing Unbiased API key. Desktop-control features ask
for macOS Accessibility or Screen Recording access only when they need it.

Agent Browser includes a pinned control binary and a private browser, so no
Homebrew or Chrome installation is needed. Browser automation requires macOS
13 or newer. It is built from an exact commit of
[`unbiased-browser`](https://github.com/circuitandchisel/unbiased-browser).
Its separate application identity keeps external links going to
your normal browser; its separate profile requires its own website sign-ins.

## Appearance

Choose a theme in **Settings → Appearance**: Ember (the Unbiased default),
Chalk, Tide, Grove, Dune, or Vesper. Each profile coordinates the app's
surfaces, text, status colors, code blocks, diagrams, and terminal. Changes
save immediately and keep your font preferences.

Expand **Customize colors and typography** to adjust colors, contrast, or
fonts, or import an existing Codex theme. Existing custom themes remain
available after upgrading. **Reset to default** restores Ember and the
default fonts.

## Features

- **Streaming chat** with markdown rendering, Prism-highlighted code
  blocks, elapsed-time "thinking" indicator, and turn interruption.
- **Supervised agent loop** — commands the agent wants to run surface as
  cards with Approve/Decline buttons; consecutive steps fold into a
  collapsible group with per-step output. Threads run with an `untrusted`
  approval policy and a `read-only` sandbox.
- **Projects & Recents sidebar** — chats bound to a chosen project folder
  group under it (hover ✎ starts a new chat there); plain chats pin to the
  home directory and list under Recents.
- **Side chat** — an ephemeral fork of the main conversation (full context
  copied; the engine forgets it on exit). Select any text to *Ask in side
  chat*, or *Add to chat* to stage it as an annotation.
- **Annotations** — Codex-style: an inline comment box on the selection,
  numbered badges pinned to the excerpts (CSS Custom Highlight API keeps
  them tinted), multiple annotations ride the next send.
- **Attachments** — files/folders via the composer's **+** menu (sent as
  engine `mention` items) and images via clipboard paste or file pick
  (sent as `localImage`, so the model sees pixels). Cards show thumbnails;
  clicking one previews full-size in the side panel.
- **Files view** (project chats only) — a split pane: file viewer +
  lazy-loading workspace tree with indent guides and a name filter.
  Breadcrumb segments open a sibling-switcher dropdown.
- **Theming** — every chrome shade derives from surface + ink + accent +
  contrast. Settings → Appearance edits them live; `codex-theme-v1:{…}`
  exports import directly.

## Agent control of in-app browser tabs

The app includes a pinned `playwright-core` library. It controls Electron's
embedded browser pages; it does not download another browser or require
Playwright in the user's project. Project test suites still use their own tools.

The agent can list tabs for the current conversation, request control of an
existing signed-in tab, or open a new page quietly in the background. Existing
tabs follow the selected access mode: Full access grants control without a
prompt; other modes ask before first use. New agent tabs
use an isolated session for that conversation, retained only until the app exits.
Ask-for-approval mode still gates browser network access.

When the agent needs sign-in, 2FA, CAPTCHA, or a decision, it can reveal the
same tab with a **Your help is needed** banner. Automation of that tab is blocked
until the user clicks **Continue agent**. This sends a continuation message
without replacing the composer's draft; it queues if a turn is still running.
The tab stays open afterward. A coral cursor follows agent interactions, matching the computer-use cursor.
A cursor icon in the tab marks ongoing agent access; the page cursor disappears
when the agent requests help. Closing the tab ends agent access. Controlled tabs
remain with their conversation when the user switches chats; ordinary browser
tabs retain their existing close-on-switch behavior.

The Playwright adapter attaches only to the selected sandboxed WebContentsView.
It uses a random, loopback-only transport, rejects browser-origin connections,
and does not enable Electron's application-wide debugging port. The agent gets
structured page tools, not arbitrary JavaScript or raw CDP access. Browser-wide
commands, app UI and other conversations' tabs are outside the connection.
Agent-created tabs stop at five tabs in their conversation or twenty native
tabs overall; users can close unused tabs before requesting another.
Popups in a controlled tab navigate that same tab so its session is preserved.
These tools are desktop-only and are not offered to scheduled tasks.

Run `npm run smoke:side-browser` for real Electron/Playwright checks and
`npm run smoke:side-browser-ui` for the app's background/handoff behavior. Both
use temporary profiles and local fixtures, without model calls or user cookies.

## Architecture

```
┌────────────────────────────┐   IPC (contextBridge)   ┌──────────────────┐
│ renderer (React 19)        │ ◄─────────────────────► │ preload          │
│ src/renderer/src/App.tsx   │                         │ window.unbiased  │
└────────────────────────────┘                         └────────┬─────────┘
                                                                │
┌────────────────────────────┐  JSON-RPC over stdio   ┌─────────▼─────────┐
│ unbiased-app-engine        │ ◄────────────────────► │ main process      │
│ (spawned child process)    │  (newline-delimited)   │ src/main/index.ts │
└────────────────────────────┘                        │ src/main/engine.ts│
                                                      └───────────────────┘
```

- `src/main/engine.ts` — `EngineClient`: the only code that knows a child
  process exists. Spawns the engine, correlates requests/responses,
  surfaces notifications and server-initiated requests (approvals).
- `src/main/index.ts` — window, IPC handlers, pane routing (`main`/`side`
  share one engine, keyed by threadId), project persistence, file access.
- `src/preload/index.ts` — the renderer's whole engine surface, typed and
  minimal.
- `src/renderer/src/App.tsx` — the entire UI. No CSS files; styling is
  inline against CSS variables set from the active theme.

For what sits *below* this diagram — what the engine wrapper does, what the
codex app-server owns, how a turn reaches the model, and where conversations
live on disk — see [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md).

## Skill commands

Type `/` in a chat composer to see matching enabled skills and built-in commands.
Use Up/Down to choose, Enter or Tab to select, and Escape to dismiss. Selecting a
skill inserts its command; add details and send when ready. `/CodeReview` (also
`/Code Review`) uses the bundled Code Review skill, for example `/CodeReview origin/main` followed by
a PR link or spec path. `/Plan` toggles plan mode. Commands are case-insensitive.

Code Review combines code quality and requirements (**Standards** and **Spec**),
**Security vulnerabilities**, and **Hardening suggestions** in one report, keeping
confirmed vulnerabilities separate from uncertain candidates and optional improvements.
Better Auth checks load only when the reviewed application uses Better Auth and
the change touches its auth boundary. Supporting modules are not separate commands.
The skill asks for a missing
comparison base or spec, and reviews without editing files or posting GitHub
comments. Its upstream source and license are recorded alongside the bundled
skill. The picker uses each chat's skill scope; disabled or unavailable skills
cannot be explicitly invoked through their commands.

## Custom agent instructions

Settings → Personalization → Custom agent instructions edits
`~/.unbiased/AGENTS.md`. You can also edit that file directly or explicitly ask
the agent to update instructions for all Unbiased chats. Project `AGENTS.md`
files still apply. Global changes are reloaded on the next turn in existing
and new chats; a turn already running keeps its current instructions.

Personalization also shows read-only **Default instructions** for completing
authorized tasks, respecting consent, handling untrusted content, preserving work,
protecting private information, verifying results, recovering from failures, and
communicating clearly. The app and model prompt use the same built-in definition.
Saving or clearing custom instructions does not change the defaults. These are
agent guidance; the app's tool approval and sandbox mechanisms still enforce
runtime permissions.

The desktop connects the engine's private `AGENTS.md` to this file on startup,
using the engine's existing per-turn instruction refresh. Existing private-home
instructions migrate when there is no canonical file. Conflicting private files
or overrides produce an actionable startup error rather than silently discarding
rules. `~/.codex/AGENTS.md` is neither imported nor changed.

The editor detects files changed since loading and requires a reload before
saving over them. Clearing and saving removes the custom global instructions.

## Development

Requires Node.js 22 and sibling checkouts of the engine and accessibility
bridge:

```
Work/
├── unbiased-app/          # this repo
├── unbiased-app-engine/   # run `make bundle` there first
└── unbiased-ax/           # run `make bundle` there first
```

```bash
# 1. Build the native bundles (once, and after native changes)
cd ../unbiased-app-engine && make bundle
cd ../unbiased-ax && make bundle

# 2. Install and run
cd ../unbiased-app
npm ci
npm run prepare:browser
npm run dev
```

Browser preparation requires Git read access to the internal `unbiased-browser`
repository. [Browser integration](docs/PRIVATE-BROWSER.md) explains the source
pin, local source override and component checks.

`UNBIASED_ENGINE_DIR` overrides the engine location for testing. In a
packaged app the engine is expected beside the app in `extraResources`.

Other scripts:

```bash
npm run build      # electron-vite production build → out/
npm run typecheck  # tsc --noEmit
npx electron .     # run the built app
```

## License

Licensed under Apache-2.0. See [LICENSE](LICENSE), [NOTICE](NOTICE), and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The Unbiased name and logo
are covered separately by [TRADEMARKS.md](TRADEMARKS.md).

## Portable environments and cloud foundations

See [CLOUD-FOUNDATIONS.md](docs/CLOUD-FOUNDATIONS.md) for stable project identities,
scoped settings, manifest validation and current engine limitations, and
[RELAY-INTEGRATION.md](docs/RELAY-INTEGRATION.md) for required cloud APIs.
Cloud continuation and scoped skill activation remain unavailable in this build.
