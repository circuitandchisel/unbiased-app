# Third-Party Notices

Unbiased desktop includes third-party software under its own licenses.

## OpenAI Codex

The packaged application includes an unmodified `codex-app-server` binary
from [OpenAI Codex](https://github.com/openai/codex), licensed under
Apache-2.0. Its license and NOTICE file are included in the engine bundle at
`Contents/Resources/engine/licenses/openai-codex/`.

## Electron and npm dependencies

Electron includes Chromium and Node.js notices in its distribution. The
JavaScript dependencies retain their package metadata and license files in
the packaged application. See `package-lock.json` for the exact dependency
versions used by a release.

## Agent Browser

The packaged application includes the `agent-browser` CLI from
[Vercel Labs](https://github.com/vercel-labs/agent-browser), licensed under
Apache-2.0. Its license is included at
`Contents/Resources/browser/licenses/agent-browser/LICENSE`.

## Private Agent browser

The packaged application includes a pinned
[Chrome for Testing](https://github.com/GoogleChromeLabs/chrome-for-testing)
distribution with Unbiased-specific macOS bundle identifiers and handler
registrations removed. Upstream browser resources and component notices remain
in `Contents/Resources/browser/Unbiased Browser.app`; the browser's
`chrome://credits` page lists third-party component credits. The exact artifact
and checksum are recorded in the pinned `unbiased-browser` repository at `scripts/browser.lock.json`.

## Robot Head Pal

The packaged application includes an adapted version of
[robot-heads](https://github.com/fayazara/robot-heads/tree/58ebf6439a8125a769f63b22ffd35bc18834b1b5)
by Fayaz Ahmed, licensed under MIT. Its copyright and license text are included
at `Contents/Resources/licenses/robot-heads/LICENSE`.

## Octicons

The GitHub link mark comes from [GitHub Octicons](https://github.com/primer/octicons),
licensed under MIT. Its copyright and license text ship at
`Contents/Resources/licenses/octicons/LICENSE`.

## Matt Pocock Skills

The bundled Code Review skill is adapted from
[mattpocock/skills](https://github.com/mattpocock/skills/tree/59db609eb1e18aaf59b63284d0e52255aff0c63c/skills/engineering/code-review),
licensed under MIT. Its copyright, license, upstream revision, and adaptation
notes ship at `Contents/Resources/skills/code-review/`.

## Sentry Security Review and OWASP

Code Review includes adapted material from
[getsentry/skills](https://github.com/getsentry/skills/tree/d12f250460ffd961f549dbebf7eeb0cf4afd4c2e/skills/security-review).
The repository's Apache-2.0 license and the skill's CC BY-SA 4.0 notice for
OWASP-derived reference material ship in `Contents/Resources/skills/code-review/modules/security/`.
That directory includes the full CC BY-SA 4.0 license. Unbiased's security-module
adaptations are also offered under CC BY-SA 4.0; changes and attribution are
documented in the skill's `UPSTREAM.md`.

## Addy Osmani Agent Skills

Code Review includes adapted security-and-hardening guidance and its supporting
patterns/checklist from
[addyosmani/agent-skills](https://github.com/addyosmani/agent-skills/tree/aeac41d4d005999432bb7312f7ff06383a91d59d),
Copyright (c) 2025 Addy Osmani, under MIT. Its license ships at
`Contents/Resources/skills/code-review/modules/hardening/LICENSE-UPSTREAM`.

Better Auth review guidance is independently written by Unbiased and links to
official documentation; no material from the repository `better-auth/skills`
is redistributed because that revision declares no license. See Code Review's
`UPSTREAM.md` for the inspected revision.
