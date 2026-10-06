# Sign in with ChatGPT: what is self-serve, and what the Terms require

**Notes from the Delegation spike, 2026-10-02.** Companion to [DELEGATION.md](DELEGATION.md). Sources are OpenAI's developer docs, the Sign in with ChatGPT Terms, the DevKit license and the Help Center as read on that date; quotations are verbatim. This is an engineering summary, not legal advice — the two clauses marked **legal call** need a decision from legal and DNR before the proxy ever signs in a real ChatGPT account.

## What is self-serve

"ChatGPT plan usage" (OpenAI also calls it token sharing) lets an eligible **Plus or Pro** subscriber's plan pay for Responses API calls made by a third-party app. For open-source, locally run apps it is genuinely self-serve: the first sign-in sends `client_id=dynamic_agent_client` plus the app's name and a host id, the user consents in their browser, and OpenAI issues the app's `oaiapp_` client id in the callback. "This direct flow needs neither a client secret nor a partner API key." No form, no review.

Everything else is gated. The docs say "Sign in with ChatGPT is currently available to selected commercial partners through a limited trial. ChatGPT plan usage is available to all open-source partners and selected private clients," and the plan-usage overview says: "These docs explain ChatGPT plan usage for open-source and locally hosted apps. If you're interested in offering it in a paid or remotely hosted app, complete the interest form." The cookbook: "At launch, ChatGPT plan usage is available to open-source projects, personal projects that run locally, and selected private apps." Enforcement is real but opaque: the open-source project Pi hit `invalid_client` with a correct request on launch day.

**Where we stand.** `unbiased-app` and `unbiased-app-engine` are public under Apache-2.0. The proxy repo is private for now; it should be public before it registers a client, since "open-source and locally hosted" is the category the self-serve path is offered to.

## Two separate instruments

1. **The DevKit license** (`openai/sign-in-with-chatgpt-devkit`, "Noncommercial License v1.0") covers OpenAI's sample code only: the `@siwc/local` and `@siwc/react` packages and the design assets. "Noncommercial Purpose … excludes development, testing, distribution, or operation of a product or service by or for a business … whether or not a fee is currently charged," and "Commercial use of OpenAI's Contribution requires a separate written agreement with OpenAI." Open-sourcing our own code does not change that. **Consequence: we write our own OAuth client and never vendor DevKit code.** The protocol itself is standard OpenID Connect with PKCE against documented endpoints; Pi, OpenClaw and T3 each wrote their own.
2. **The Sign in with ChatGPT Terms** govern "your use of Sign in with ChatGPT (“SIWC”) in an application you develop or maintain," incorporate the Terms of Use, Service Terms and Usage Policies, and point at the DevKit license as "the applicable license." These bind us whatever code we write.

## The Terms, clause by clause, against the Delegation design

| Clause (verbatim) | Delegation proxy on the user's machine | Gateway-side use of the token |
|---|---|---|
| "Any persistent storage of Authentication Tokens must be local and under the user's control, not in a remote or managed environment." | Satisfied. | Forbidden: no Vault, no dashboard storage. |
| "Requests must originate from the user's local runtime or a remote runtime only that user controls." | Satisfied. | Forbidden. The hosted BYOK-style pass-through needs the partnership lane. |
| "Requests must be for the authenticated user and arise from their activity or expressly authorized automations or background processes." | Satisfied; scheduled or background tasks need express consent. | — |
| "Use the user's plan only for the application they connected. Do not provide general-purpose API access for other tools or unrelated requests." | **Legal call.** A proxy any harness can sit in front of reads as "other tools." Our position: the proxy registers as Unbiased, never exposes OpenAI generally, and executes only the escalations Pareto instructs, for the user's own requests. | — |
| "Users must be able to use their ChatGPT plan through SIWC without paying you or upgrading to a paid version of your application." | **Legal call.** Delegations happen inside paid Pareto requests. The Help Center says an app "may charge separately for its subscription, infrastructure, services, or premium features," which supports charging for the open-source leg, but it is not settled. It weighs against the "keep prices the same" option. | — |
| Prohibited: "Creating multiple accounts, splitting usage, rotating accounts, or otherwise bypassing usage limits"; "Pooling, transferring, reselling, gifting, or sharing ChatGPT plan usage or Authentication Tokens"; "Using one user's subscription to fulfill another user's requests." | Document and enforce one proxy per user. A team proxy on a shared box is out. | — |
| "Use your app's own name during sign-in and activation. Do not impersonate OpenAI, another application, or another open-source project." | Register as "Unbiased helper" — one name for both clients, the TypeScript proxy and the Go helper, so a user sees one connected app. Do **not** reuse Codex's first-party client (the engine's built-in `chatgpt` login type) or its `backend-api` route: "do not point it at ChatGPT's backend-api endpoints." | — |
| "Use OpenAI names, logos, and buttons only as authorized." / "We may suspend or disable your application's access to SIWC if it violates these Terms." | Follow the UI/UX guidelines: "Continue with ChatGPT," a first-sign-in confirmation, a "Using ChatGPT plan" indicator, a "Manage usage" link, and "Your app must clearly show which of its plans support ChatGPT plan usage." | — |

## Product constraints that follow from the docs

- Plus and Pro only. Plus shares one five-hour window across every connected app; Pro has none. Users set a per-app weekly cap of 10–100% in ChatGPT settings; an app cannot read remaining quota, and the token carries no plan-tier claim.
- `POST /v1/responses` only, with `store: false` and `stream: true`. Rejected: `temperature`, `top_p`, `max_output_tokens`, `metadata`, `user`, `service_tier`, `previous_response_id` and others; system-role items; hosted tools. Function tools must be grouped in namespaces or sent as `additional_tools`. The model catalog is account-specific (`GET /v1/models` with the token); the docs' example is `gpt-6.1-sol`, and Astra's availability to Plus/Pro accounts is unverified.
- Access tokens last one hour; refresh tokens 30 days and rotate. OpenAI does not notify an app when a user disconnects it.

## Observed on a real Plus account (2026-10-02)

The proxy's `login` registered a client through the dynamic flow (as "Unbiased" at the time; both clients now register as "Unbiased helper") with no review step; plan usage was granted on the first consent. Against that token:

- The catalog (`GET /v1/models`, `visibility: "list"`) was `gpt-6-astra, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5` — Astra is available to Plus; `gpt-6.1-sol` is not listed, yet a request for it was served, so the list is a display catalog, not an entitlement check.
- Codex-style **flat function tools work**: the model returned `function_call` items without namespacing or `additional_tools`.
- `service_tier: flex` is refused before admission with the documented non-standard body `{"detail":"Unsupported service_tier: flex"}` (HTTP 400). `max_output_tokens` and `temperature` were accepted on the calls tried, so the rejected-fields list is enforced unevenly; the cascade drops all of them for a plan credential when it builds the hand-off's request (`PLAN_ROUTE_DROP_FIELDS`); the proxy sends that request as given.
- A string `input` is refused (HTTP 400); `input` must be an array, as the preview limitations say. The cascade builds the array `input` in the hand-off's request; the proxy sends it as given.
- `response.completed` carries **`output: []`**; the answer is only in the `output_item.*` and `*.delta` events. Any client that assembles from the terminal event alone sees nothing (fixed in the proxy).
- Latency: a short Astra reply in 3–4 s; delegated steps in the spike ran 3.6–4.5 s for a tool call and 13.5 s for a three-paragraph answer.

## What we do about it

- What the spike did: a dynamic client registration on bdj's own Plus account, used only from this machine, to measure the route (the section above) and the sign-in flow end to end — including a lapsed sign-in and a re-login. Both clients ship the sign-in. The exposure is therefore the two legal calls above, not none: delegations happen inside paid Pareto requests ("no charge"), and the helper is a connected application only in the sense that a user must still run it with their own Unbiased account. Making the proxy repo public before any real user registers keeps the open-source condition true.
- Hosted use of a user's token — the gateway or cascade calling OpenAI with it — is the partnership conversation, not an engineering option.
- If OpenAI ever offers a commercial plan-usage agreement, the "connected application" and "no charge" questions are the ones to put in it.

## Sources

- developers.openai.com/siwc (quickstart, request-client-id, token-sharing-open-source and its sign-in, models-and-inference, preview-limitations, token-reference, errors-and-recovery, ui-ux-guidelines pages)
- openai.com/policies/sign-in-with-chatgpt-terms
- github.com/openai/sign-in-with-chatgpt-devkit (README, LICENSE) and developers.openai.com/cookbook/articles/sign-in-with-chatgpt
- help.openai.com article 20001542 "Using your ChatGPT plan in other apps and sites"; learn.chatgpt.com/docs/sign-in-with-chatgpt
