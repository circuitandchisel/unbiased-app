# Better Auth review

This is independently written Unbiased guidance. No text or code from the `better-auth/skills` repository, which has no declared license is redistributed here. See [provenance](../../UPSTREAM.md).

Load this module only after confirming Better Auth is used in the reviewed application and the change affects its configuration, consumers or security boundary. Keep the parent's read-only scope and reporting rules.

## Establish effective behavior

Identify the installed `better-auth` version from the authoritative lockfile, server initialization, enabled plugins, route adapters and deployment topology. Inspect the installed implementation or version-matched official documentation before assuming an option, default, endpoint protection or hook exists. Missing explicit configuration is not a finding when the effective default supplies the control. If documentation access is unavailable, state the uncertainty instead of inventing defaults.

## Follow the affected auth flow

- Trace how the application validates a session on the server and then authorizes the particular resource, organization and role. A valid login alone does not establish access to another user's data.
- Inspect secret sourcing and rotation, cookie scope, production transport, cross-origin trust, redirect destinations, and disabled protections only where the change affects them. Tie any finding to an actual trust boundary; do not prescribe blanket wildcard or cookie policies without the application's requirements.
- For changes to login, recovery, verification or account linking, trace proof of identity, redirect/state handling, failure responses and session invalidation. Check any application wrappers that bypass framework routes.
- For session caching or freshness changes, follow when revocation and changed privileges take effect. State the actual stale-authorization window and the sensitive operation it affects before assigning impact.
- For abuse controls, establish which requests reach the framework limiter and which application-defined server routes call auth APIs directly. Check storage sharing and trusted client-IP derivation against the real proxy topology. Do not run brute-force requests or change throttling during review.
- For OAuth token storage or logging changes, inspect which credentials are persisted, protected or exposed, and which users or services can read them. Redact credentials from evidence.

Report verified exploit paths under Security vulnerabilities. Put useful configuration improvements without a demonstrated exploit under Hardening suggestions. A project not using Better Auth should never receive Better Auth-specific recommendations.

## Official references

Consult the relevant page for the installed version and affected feature; these are reference links, not authorization to operate a live service:

- [Security](https://www.better-auth.com/docs/reference/security): framework protections, origin and redirect handling, secret lifecycle.
- [Session management](https://www.better-auth.com/docs/concepts/session-management): caching, revocation and freshness.
- [Rate limiting](https://www.better-auth.com/docs/concepts/rate-limit): coverage, storage and proxy/IP configuration.
