# Code Review sources and changes

The app exposes one `code-review` skill. Supporting modules have no skill frontmatter and are loaded as relevant. The Unbiased entrypoint coordinates the modules without relicensing their source material.

## Code quality and requirements

- Source: https://github.com/mattpocock/skills
- Revision: `59db609eb1e18aaf59b63284d0e52255aff0c63c`
- Upstream path: `skills/engineering/code-review`
- Packaged path: `modules/code-quality/`
- License: MIT, including Unbiased's adaptations (see [LICENSE](LICENSE)).
- Changes: replace the external tracker setup dependency with a bundled read-only GitHub workflow; prioritize the user-identified spec and parent's pinned scope; include tracked and untracked WIP scope; allow direct review when delegation is unavailable; return Standards/Spec to the parent report. Preserve the two-axis process and all twelve smell heuristics.

## Security vulnerabilities

- Source: https://github.com/getsentry/skills
- Revision: `d12f250460ffd961f549dbebf7eeb0cf4afd4c2e`
- Upstream path: `skills/security-review`
- Packaged path: `modules/security/`
- Licenses: repository [Apache-2.0](modules/security/LICENSE-UPSTREAM); the skill's OWASP-derived reference material is [CC BY-SA 4.0](modules/security/LICENSE). The [full CC license](modules/security/LICENSE-CC-BY-SA-4.0.txt) is included. Sentry and the OWASP Foundation retain their attribution and source links in the reference material.
- Changes: remove discovery frontmatter; adapt to the parent read-only, scoped review; include authenticated/tenant attacks; verify trust rather than assuming configuration is safe; replace unconditional pattern flags with evidence-based investigation; use local references instead of unshipped skills; return findings to the unified report. Unbiased's adaptations to this module are also offered under CC BY-SA 4.0.

## Hardening suggestions

- Source: https://github.com/addyosmani/agent-skills
- Revision: `aeac41d4d005999432bb7312f7ff06383a91d59d`
- Upstream paths: `skills/security-and-hardening/`, `references/security-checklist.md`
- Packaged paths: `modules/hardening/`, `references/security-checklist.md`
- License: MIT, including Unbiased's adaptations (see [LICENSE-UPSTREAM](modules/hardening/LICENSE-UPSTREAM)). Copyright (c) 2025 Addy Osmani.
- Changes: remove discovery frontmatter; frame controls as context-sensitive review questions, not permission to implement or demand blanket configuration changes; replace calls to unshipped skills with packaged-module links. Supporting patterns and shared checklist are included.

## Better Auth checks

The requested `better-auth/skills/security/SKILL.md` was inspected at revision `20c9e88a5c007461a703f1c213572b073196113e`. That repository declared no license at this revision, so none of its text or code is redistributed. `modules/better-auth/review.md` is independently written Unbiased guidance with links to the official Better Auth documentation. It verifies the reviewed project's installed version and effective configuration instead of embedding version-sensitive defaults. It is covered by the app's Apache-2.0 license.
