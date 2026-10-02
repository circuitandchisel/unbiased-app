# Delegation: client-executed model calls for Pareto

**Protocol version 1 — draft, 2026-10-02.** Implemented behind flags in gpu-router, unbiased-api and the `unbiased-proxy` repo; nothing deployed.

## Why

Pareto is a cascade: open-weight models on our GPUs answer most requests and a frontier model (today GPT-6 Astra) answers the hard ones, on our provider account. BYOK customers want their prompts to stay in their own account. OpenAI's Sign in with ChatGPT lets a Plus or Pro plan pay for the frontier call, but its Terms require the request to originate from the user's local runtime and forbid storing the token remotely, so the gateway can neither hold the credential nor make the call. The server keeps deciding *when* to escalate; the client executes it.

## Use case

A user runs the Unbiased proxy, or a harness that speaks this protocol, and it declares which providers it can call and with what credential. When Pareto decides a request needs a frontier model the client declared, it hands the step back instead of dialing the seat; the client re-issues its own request to that provider on the user's credential, with a small patch from the server, and streams the answer as Pareto's. Pareto never sees the credential or makes the call. A later version lets the client post the answer back for Pareto to judge or synthesise.

## Why this way

- **A stream event, not an HTTP status.** In-band on the committed SSE stream, so heartbeats keep flowing and the decision may come minutes in; the channel can later carry a continuation. The one invariant is the cascade's own: before the first content byte. A non-streaming request gets the same payload as an HTTP 422.
- **The standard terminal event**, `response.failed` with `error.code = "delegation_required"`: a client that declared the capability and did not act sees an accurate, actionable failure. Billing the handed-off request is a separate decision; the event carries `usage` either way.
- **A patch, not a prompt.** The client holds the request; the server sends only what it would have added or changed. Small for every relay hop; no prompt text on the hand-off path.
- **Capability in a request header**, HTTP's extension point for client capabilities (`OpenAI-Beta`, `anthropic-beta`); RFC 6648 retires `X-`, RFC 8941 gives the grammar. The server delegates only to a client that declared it, and echoes what it accepted. Per provider the client declares credential kind and servable models, so the server picks a seat the client can dial and can offer fallbacks. Plan tier is absent on purpose: tokens do not expose it.
- **The name.** MCP calls this pattern *sampling*; that word means parameters here, so *delegation*.

**Out of scope for v1:** billing of pre-hand-off work; ZDR-organization policy; hand-off after partial output; the continuation post-back (handle reserved); providers other than OpenAI (the grammar admits them; only the Responses patch is defined).

## Protocol

### 1. Capability declaration

`Delegation` is an RFC 8941 Dictionary: keys are providers, parameters describe the credential; unknown keys and parameters are ignored. The server echoes the accepted entries on every response; no echo means it does not speak the protocol.

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

The gateway mints the accepted entries into the signed caller token it already attaches to every Pareto call:

```json
{ "org": "…", "workload": "…", "rid": "…", "byok": false,
  "delegation": [ { "provider": "openai", "v": 1, "cred": "plan", "models": ["gpt-6-astra", "gpt-6.1-sol"], "api": "responses" } ] }
```

### 2. The hand-off event

At an escalation decision the cascade takes the first seat of its escalation chain the client declared, or escalates server-side as today if none matches. Instead of dialing the seat it ends the response:

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

`reason` is `leader-takeover` (an agentic step; `window.remaining` is the takeover steps left after it) or `seqr-escalate` (a one-shot whose tier-1 panel disagreed). `drop` lists what the chosen credential's route rejects; empty for `cred=key`. `continuation` is reserved for v2. With `stream: false` the same `error` object is the body of an HTTP 422.

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

### 5. Transport note

Inside our stack the event is the cascade's in-band error chunk, translated to `response.failed` by gpu-router (whose pre-stream failure gate passes this code through) and relayed byte-for-byte by the gateway. The cascade reads the signed claim, never the header.
