# Delegation: client-executed model calls for Pareto

**Protocol version 1 — draft, 2026-10-02.** Implemented behind flags in gpu-router, unbiased-api and the `unbiased-proxy` repo; nothing deployed.

## Why

Pareto is a cascade: open-weight models on our GPUs answer most requests, and a frontier model (today OpenAI's GPT-6 Astra) answers the hard ones. Every escalation runs on our provider account, so we pay for it and the customer's prompt transits our account. Two things want it to run on the customer's own credential instead. BYOK customers want their prompts to stay inside their own provider account. And OpenAI's Sign in with ChatGPT lets a Plus or Pro subscriber's plan pay for the frontier call, but its Terms require the request to originate from the user's local runtime and forbid storing the token anywhere remote. The gateway can therefore neither hold the credential nor make the call. The server keeps deciding *when* to escalate; the client executes it.

## Use case

A user runs the Unbiased proxy on their machine, or a harness that speaks this protocol directly. The client declares which providers it can call and with what kind of credential. Pareto runs as today. When it decides a request needs a frontier model the client declared, it hands the step back instead of dialing the seat itself. The client re-issues its own request to that provider on the user's credential, with a small patch the server supplies, and streams the answer to the user as Pareto's. Pareto never sees the credential and never makes the call. A later version lets the client post the frontier answer back so Pareto can judge or synthesise it.

## Why this way

- **A stream event, not an HTTP status.** The hand-off arrives in-band on the committed SSE stream, so heartbeats flow for as long as the decision takes and the server may decide minutes into a request. The same channel can later carry a continuation handshake or an escalation after partial output. The one invariant is the cascade's own: a hand-off lands before the first content byte, because streamed content cannot be retracted. A non-streaming request has no stream, so it gets the identical payload as an HTTP 422.
- **The standard terminal event.** The hand-off is `response.failed` with `error.code = "delegation_required"`. A client that declared the capability and did not act sees an accurate failure with an actionable message. Whether the handed-off request is billed is a separate, explicit decision; the event carries `usage` so either answer is implementable.
- **A patch, not a prompt.** The client already holds the request. The server sends only what it would have added or changed. This keeps the event small enough for every relay hop and keeps prompt text off the hand-off path.
- **Capability in a request header**, HTTP's extension point for client capabilities (`OpenAI-Beta`, `anthropic-beta` are the precedents). RFC 6648 retires the `X-` prefix; RFC 8941 Structured Fields supply the grammar, so adopters parse it with a library. The server requests a delegation only from a client that declared it, and echoes what it accepted. Per provider the client declares its credential kind and the models that credential can serve, so the server picks a seat the client can actually dial and can offer fallbacks. Plan tier is deliberately absent: tokens do not expose it, and the server must not trust a client's assertion of it.
- **The name.** MCP calls the pattern where a server asks the client to run an LLM call on the client's own model access *sampling*. That word already means parameters here, so this is *delegation*.

## Out of scope for v1

Billing of the work done before a hand-off; ZDR-organization policy; hand-off after partial output; the continuation post-back (its handle is reserved); providers other than OpenAI (the grammar admits them; only the Responses-API patch is defined).

## Protocol

### 1. Capability declaration

The client sends a `Delegation` request header, an RFC 8941 Dictionary whose keys are providers and whose parameters describe the credential. Unknown keys and parameters are ignored. The server echoes the entries it accepted on the response, in the same grammar, on every response; an absent echo means the server does not speak the protocol.

```http
Delegation: openai;v=1;cred=plan;models="gpt-6-astra gpt-6.1-sol";api=responses
Delegation: openai;v=1;cred=key;models="gpt-6-astra";api=responses, anthropic;v=1;cred=key;models="claude-opus-5";api=messages
```

| Parameter | Meaning |
|---|---|
| `v` | schema version of this entry; v1 is this document |
| `cred` | `plan` (a Sign in with ChatGPT token: the plan route's restrictions apply) or `key` (a provider API key) |
| `models` | space-separated model ids this credential can serve, from the provider's catalog |
| `api` | the wire the client can speak to this provider: `responses` (v1), `messages` (reserved) |

The gateway validates the header and mints the accepted entries into the signed caller token it already attaches to every Pareto call:

```json
{ "org": "…", "workload": "…", "rid": "…", "byok": false,
  "delegation": [ { "provider": "openai", "v": 1, "cred": "plan", "models": ["gpt-6-astra", "gpt-6.1-sol"], "api": "responses" } ] }
```

### 2. The hand-off event

At an escalation decision the cascade walks its escalation chain and takes the first seat whose provider and model the client declared. If none matches it escalates server-side as today. Otherwise, instead of dialing the seat, it ends the response:

```
event: response.failed
data: {"type":"response.failed","response":{"id":"resp_…","status":"failed","usage":null,
  "error":{"code":"delegation_required","type":"delegation_required",
    "message":"This request opted into delegated escalation (Delegation header), which the Unbiased proxy performs. Use the proxy, or drop the header.",
    "delegation":{"v":1,"kind":"escalation","reason":"leader-takeover",
      "provider":"openai","api":"responses","model":"gpt-6-astra","fallbacks":["gpt-6.1-sol"],
      "patch":{"instructions_prepend":"<identity prompt>",
               "input_append":[{"role":"user","content":"[Self-check] …judge advice…"}],
               "reasoning":{"effort":"medium"},"prompt_cache_key":"pc_…",
               "drop":["max_output_tokens","service_tier","temperature","…"]},
      "window":{"remaining":5},
      "continuation":null}}}}
```

`reason` is `leader-takeover` (an agentic step; `window.remaining` is the takeover steps left after this one) or `seqr-escalate` (a one-shot whose tier-1 panel disagreed). `drop` lists the request fields the chosen credential's route rejects; for `cred=key` it is empty. `continuation` is reserved for v2. A request sent with `stream: false` receives the same `error` object as the body of an HTTP 422.

### 3. Applying the patch (client)

```text
req ← the client's own Responses request
for f in delegation.patch.drop: delete req[f]
req.model ← delegation.model
req.store ← false; req.stream ← true          # always stream the provider; assemble JSON for a non-streaming caller
if patch.instructions_prepend: req.instructions ← prepend + "\n\n" + req.instructions
if patch.input_append: req.input ← asArray(req.input) ++ patch.input_append
if patch.reasoning:  req.reasoning ← merge(req.reasoning, patch.reasoning)
if patch.text:       req.text ← patch.text
if patch.prompt_cache_key: req.prompt_cache_key ← patch.prompt_cache_key
POST {provider base}/responses with the user's credential; on a provider 4xx try the next of `fallbacks`
```

### 4. Proxy flow

```text
on client request R to /v1/responses:
  send R' = R + {stream:true} to Pareto with the Delegation header
  hold Pareto's pre-content events (response.created, in_progress); forward SSE comments (heartbeats)
  if first content/tool item arrives: flush held events, relay Pareto's stream to the end
  if response.failed with error.code == "delegation_required": discard held events,
      apply the patch (§3), stream the provider's response to the client in its place
  if R had stream:false: collect the chosen stream's response.completed and answer JSON
```

### 5. Transport notes

The event rides gpu-router's chat-completions→Responses translation as an error chunk carrying `error.delegation`; the router's pre-stream failure gate must not convert this code into an HTTP error, and the gateway relays it byte-for-byte (an error-shaped terminal event; the billing gate's treatment of it is the deferred decision above). Only a request carrying a valid `Delegation` header can ever receive the event: the cascade reads the signed claim, never the header.
