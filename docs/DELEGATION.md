# Delegation: client-executed model calls for Pareto

**Protocol version 2 — draft, 2026-10-05.** Implemented behind flags in gpu-router, unbiased-api and the `unbiased-proxy` repo; nothing deployed. v1 (2026-10-02) sent the client a patch and let it finish the answer itself; v2 moves every decision to the server.

## Why

Pareto answers the hard requests on a frontier model, on our provider account. OpenAI's Sign in with ChatGPT lets a user's Plus or Pro plan pay for that call instead, but its Terms require the request to come from the user's local runtime with the token stored only there ([SIGN-IN-WITH-CHATGPT.md](SIGN-IN-WITH-CHATGPT.md)), so the gateway can neither hold the credential nor make the call. The server keeps deciding *when* to escalate and *what* to send; the client only executes.

## Use case

The user runs the Unbiased proxy, or a harness speaking this protocol, which declares the credential it holds. When Pareto decides a request needs a frontier model that credential can serve, it hands the client the exact request it would have sent; the client sends it on the user's credential, posts the outcome back, and Pareto composes the answer the user sees. Neither side sees the other's secrets: not the credential, not the reason for escalating.

## Design rules

- **The client is dumb.** It declares a credential, sends the request it is given, reports what came back. Which models a plan serves, what to send, how to fail over, how to judge or bill the result: all server-side, so Pareto's internals change without a client release.
- **Every wire field is necessary.** v1's `kind`, `reason`, `window`, `model`, `fallbacks`, `cred`, `api`, patch vocabulary, header model list and echo header changed nothing a correct client did; they are gone. Each remaining field drives one stated decision.
- **A stream event, not an HTTP status.** In-band on the committed SSE stream, so heartbeats keep flowing and the decision may come minutes in, always before the first content byte. A non-streaming request gets the same payload as an HTTP 422.
- **The post-back is a normal request.** Pareto sees the delegated output at once, bills it with the plumbing it already has (the rule is a separate decision), and may judge or synthesise before answering. The cost is streaming: the frontier answer is collected before it is posted back, so a delegated one-shot's time-to-first-token is the frontier's full generation time.
- **Failure is Pareto's to handle.** The client reports a timeout, a limit or a refusal; Pareto escalates on its own seats and the user gets a Pareto answer on their Pareto plan. An exhausted credential is simply not declared for a while (the plan route names no reset time), so no request fails because a plan ran out.

**Out of scope for v2:** the billing rule for a delegated request; ZDR-organization policy; hand-off after partial output; streaming the post-back; providers other than OpenAI (the grammar admits them; only the Responses wire is defined).

## Protocol

### 1. Capability declaration

`Delegation` is an RFC 8941 Dictionary: keys are providers, parameters describe the credential. Unknown keys and parameters are ignored; a malformed header declares nothing.

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

With `stream: false` the same `error` object is the body of an HTTP 422.

### 3. The post-back

The client re-sends its original request with one added field; Pareto answers it as a normal response:

```json
{ "model": "pareto", "input": [...], "stream": true,
  "delegation": { "continuation": "<opaque>", "response": { "...": "the provider's completed Responses object" } } }
```

| Field | Decides |
|---|---|
| `continuation` | which hand-off this outcome answers |
| `response` | the provider's completed Responses object: Pareto's answer is made from it |
| `error` | in place of `response`: `{"status": 429, "code": "subscription_sharing_usage_limit_exceeded"}` as the provider said it, or `{"code": "timeout"}`; Pareto escalates on its own seats |

A hand-off in reply to a post-back is a protocol error; the client refuses it rather than loop.

### 4. Client flow

```text
on request R to /v1/responses:
  send R + {stream:true} to Pareto, with the Delegation header while the credential is declared
  hold pre-content events (response.created, in_progress); forward SSE comments (heartbeats)
  first content/tool item → flush what was held, relay Pareto's stream to the end
  response.failed with error.code == "delegation_required" →
      POST delegation.request to the provider with the user's credential, bounded by timeout_ms
      collect the completed Responses object (the plan route's completed event has an empty output: rebuild it from output_item.done)
      send R + {stream:true, delegation:{continuation, response | error}} to Pareto; relay its stream in place of the first
  if R had stream:false: assemble the relayed stream's response.completed and answer JSON
  provider 429 → stop declaring for a cool-off that doubles (5 min … 1 h); 401/403 or a failed token refresh → until the user signs in again (re-checked hourly)
```

### 5. Transport note

Inside our stack the hand-off is the cascade's in-band error chunk, translated to `response.failed` by gpu-router (its pre-stream failure gate and error-envelope size cap both admit this code) and relayed byte-for-byte by the gateway; the post-back's `delegation` field crosses the router's request translation untouched. The cascade reads the signed claim, never the header, and refuses a continuation it did not mint.
