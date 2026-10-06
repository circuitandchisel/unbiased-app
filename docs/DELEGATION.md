# Delegation: client-executed model calls for Pareto

**Protocol version 2 — draft, 2026-10-06.** Implemented in gpu-router, unbiased-api, the `unbiased-proxy` repo and unbiased-cli (the Go helper, the second client); nothing deployed. The cascade's switch, `LC_DELEGATION_ENABLED`, defaults to on and is the quick way off. v1 (2026-10-02) sent the client a patch and let it finish the answer itself; v2 moves every decision to the server.

## Why

Pareto answers the hard requests on a frontier model, on our provider account. OpenAI's Sign in with ChatGPT lets a user's Plus or Pro plan pay for that call instead, but its Terms require the request to come from the user's local runtime with the token stored only there ([SIGN-IN-WITH-CHATGPT.md](SIGN-IN-WITH-CHATGPT.md)), so the gateway can neither hold the credential nor make the call. The server keeps deciding *when* to escalate and *what* to send; the client only executes.

## Use case

The user runs the Unbiased proxy, or a harness speaking this protocol, which declares the credential it holds. The proxy accepts Responses, Chat Completions and Anthropic Messages requests and relays each to Pareto verbatim, streaming or not, as the client sent it; every format conversion stays on the server. When Pareto decides a request needs a frontier model that credential can serve, it hands the client the exact request it would have sent; the client sends it on the user's credential, posts the outcome back, and Pareto composes the answer the user sees. Neither side sees the other's secrets: Pareto never sees the credential, and the client never learns why Pareto escalated — the continuation it carries is sealed, not merely signed.

## Design rules

- **The client is dumb.** It declares a credential, sends the request it is given, reports what came back. Which models a plan serves, what to send, how to fail over, how to judge or bill the result: all server-side, so Pareto's internals change without a client release.
- **Every wire field is necessary.** v1's `kind`, `reason`, `window`, `model`, `fallbacks`, `cred`, `api`, patch vocabulary, header model list and echo header changed nothing a correct client did; they are gone. Each remaining field drives one stated decision.
- **A stream event, not an HTTP status.** In-band on the committed SSE stream, so heartbeats keep flowing and the decision may come minutes in, always before the first content byte. A non-streaming request gets the same payload as an HTTP 422.
- **The post-back is a normal request.** Pareto sees the delegated output at once, judges it like any step, and may synthesise before answering. Billing is a separate decision, under three invariants the rule must keep: the delegated leg is the user's and Pareto never bills it; Pareto's own work on the request is billed from Pareto's own measurements; nothing in the post-back's `usage` reaches a bill. The cost is streaming: the frontier answer is collected before it is posted back, so a delegated one-shot's time-to-first-token is the frontier's full generation time.
- **Failure is Pareto's to handle.** The client reports a timeout, a limit or a refusal; Pareto escalates on its own seats and the user gets a Pareto answer on their Pareto plan. An exhausted credential is simply not declared for a while (the plan route names no reset time), so no request fails because a plan ran out.
- **A zero-data-retention request is never delegated.** Its data stays on Pareto's ZDR lanes; a client's own credential is not one.

**Out of scope for v2:** the billing rule for a delegated request; ZDR-organization policy; hand-off after partial output; streaming the post-back; providers other than OpenAI (the grammar admits them; only an OpenAI Responses `request` is defined).

## Protocol

### 1. Capability declaration

`Delegation` is an RFC 8941 Dictionary: keys are providers, parameters describe the credential. Unknown keys and parameters are ignored; a malformed header declares nothing; a repeated provider follows RFC 8941 §3.2 — the later entry replaces the earlier.

```http
Delegation: openai;v=2;cred=plan
Delegation: openai;v=2;cred=key, anthropic;v=2;cred=key
```

| Field | Decides |
|---|---|
| key | which provider the client can dial |
| `v` | the schema of the entry; v2 is this document |
| `cred` | `plan` (a Sign in with ChatGPT token: the plan's catalog and route restrictions apply) or `key` (a provider API key) |

The gateway mints the accepted entries into the signed caller token every Pareto call carries: `"delegation": [{"provider": "openai", "v": 2, "cred": "plan"}]`.

### 2. The hand-off event

At an escalation decision the cascade takes the first seat of its chain the credential can serve (or escalates server-side as today) and, instead of dialing it, ends the response:

```
event: response.failed
data: {"type":"response.failed","response":{"id":"resp_…","status":"failed","usage":null,
  "error":{"code":"delegation_required","type":"delegation_required",
    "message":"This request opted into delegated escalation (Delegation header), which the Unbiased proxy performs. Use the proxy, or drop the header.",
    "delegation":{
      "provider":"openai",
      "request":{"model":"gpt-6-astra","store":false,"stream":true,
                 "instructions":"<identity prompt + the caller's system prompt>",
                 "input":[…the conversation as the cascade would send it…],
                 "tools":[…],"reasoning":{"effort":"medium"},"prompt_cache_key":"pc_…"},
      "timeout_ms":180000,
      "continuation":"<opaque>"}}}}
```

| Field | Decides |
|---|---|
| `provider` | which credential and endpoint to use |
| `request` | the complete provider request, sent as given, never edited |
| `timeout_ms` | when to give up and report a timeout |
| `continuation` | opaque; echoed on the post-back so Pareto resumes |

With `stream: false` the same `error` object is the body of an HTTP 422. The hand-off is spoken in whichever dialect the client used; the `delegation` object is identical in all three, and the handed-over `request` is always an OpenAI Responses request:

| Client dialect | Streaming | Non-streaming | Marker |
|---|---|---|---|
| Responses | terminal `response.failed`, `response.error` | HTTP 422, `error` | `error.code = "delegation_required"` |
| Chat Completions | the in-band `{"error": {…}}` chunk | HTTP 422, `error` | `error.code = "delegation_required"` |
| Anthropic Messages | `event: error` | HTTP 422, `error` | `error.type = "delegation_required"` (the Anthropic error object has no `code`) |

### 3. The post-back

The client re-sends its original request, in its own dialect, with one added top-level field; Pareto answers it as a normal response in that dialect:

```json
{ "model": "pareto", "input": [...], "stream": true,
  "delegation": { "continuation": "<opaque>", "response": { "...": "the provider's completed Responses object" } } }
```

| Field | Decides |
|---|---|
| `continuation` | which hand-off this outcome answers |
| `response` | the provider's completed Responses object: Pareto's answer is made from it |
| `error` | in place of `response`: `{"status": 429, "code": "subscription_sharing_usage_limit_exceeded"}` as the provider said it, or `{"code": "timeout"}`; any `error` object means "escalate here" — a client maps no codes |

A hand-off in reply to a post-back is a protocol error; the client refuses it rather than loop. A continuation is good for one post-back of the same request from the same caller, until shortly after `timeout_ms`; a client never retries a stale one.

### 4. Client flow

```text
on request R to /v1/responses, /v1/chat/completions or /v1/messages:
  send R to Pareto verbatim — same body, same stream flag, the client's own Authorization (the client holds no Pareto credential; removing it removes only the delegation) — with the Delegation header while the credential is declared
  non-streaming: relay the answer; a 422 whose error carries the marker is the hand-off
  streaming:    hold the dialect's pre-content events; forward SSE comments (heartbeats)
                first content → flush what was held, relay Pareto's stream to the end
                the dialect's hand-off event → discard what was held
  on a hand-off:
      POST delegation.request to the provider with the user's credential, bounded by timeout_ms
      collect the completed Responses object (the plan route's completed event has an empty output: rebuild it from output_item.done)
      send R + {delegation:{continuation, response | error}} to Pareto, same stream flag; relay its answer in place of the first
      a streaming client MUST hear `: ping` comments meanwhile (the leg is the provider's whole generation; idle timeouts fire otherwise)
      a second hand-off in reply is refused as a loop; any other rejection of the post-back → send R once more WITHOUT the header, so the user still gets an answer
  provider 429 → stop declaring for a cool-off that doubles (5 min … 1 h); a plan's 401 or dead refresh token → stop declaring and open the browser to sign in again, once (a refused API key just stops declaring); 403 → stop declaring until the stored sign-in changes
```

The client's dialect knowledge is this table and one rule, nothing more: which event carries the hand-off (§2); which events precede content and are discarded when a hand-off replaces them — `response.created`, `response.in_progress` and `response.queued` for Responses; the role-only first chunk for Chat Completions; `message_start` and `ping` for Messages; and that a Chat Completions delta whose only payload is `reasoning_content` (Pareto's narration while it decides) is forwarded as it arrives without counting as content, so a hand-off after it still delegates.

### 5. Transport note

Inside our stack the hand-off is the cascade's in-band error chunk, relayed as-is to a Chat Completions client and translated by gpu-router's Responses and Messages dialects (its pre-stream failure gate and error-envelope size cap both admit this code), then relayed byte-for-byte by the gateway; the post-back's `delegation` field crosses both request translations untouched. The cascade reads the signed claim, never the header, and refuses a continuation it did not mint.
