import assert from "node:assert/strict";
import { test } from "node:test";
import { fastVisualEligible, fastVisualPrompt, streamFastVisual } from "./fast-visual";
import type { VisualRouteTrace } from "./visual-route";

const route: VisualRouteTrace = {
  status: "classified", choice: "static", confidence: 1, requestMs: 0,
  serviceMs: null, inputTokens: null, inputChars: 40, detail: "explicit visual request",
};

test("fast path accepts a self-contained visual but defers current and safety-sensitive work", () => {
  const base = { route, attachments: 0, computer: false, planMode: false, paneId: "main" };
  assert.equal(fastVisualEligible({ ...base, text: "Explain Catan to a beginner with visuals" }), true);
  assert.equal(fastVisualEligible({ ...base, text: "Draw an interactive checkerboard" }), true);
  assert.equal(fastVisualEligible({ ...base, text: "Show me visually how to fix my broken bicycle chain" }), false);
  assert.equal(fastVisualEligible({ ...base, text: "Show me visually how to fold a paper boat" }), false);
  assert.equal(fastVisualEligible({ ...base, text: "Chart the latest stock prices" }), false);
  assert.equal(fastVisualEligible({ ...base, text: "Explain Catan with visuals", attachments: 1 }), false);
  assert.equal(fastVisualEligible({ ...base, text: "Explain Catan with visuals", planMode: true }), false);
  assert.match(fastVisualPrompt(), /VisualHtml/);
});

test("direct Pareto stream relays incremental OpenUI and validates the settled program", async () => {
  const source = 'root = Stack([TextContent("Hello")])';
  const pieces = [source.slice(0, 14), source.slice(14)];
  const frames = pieces.map((content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`).join("") + "data: [DONE]\n\n";
  const bytes = new TextEncoder().encode(frames);
  const seen: string[] = [];
  const result = await streamFastVisual(
    { key: "test-key", text: "Show a visual", history: [], signal: new AbortController().signal },
    (delta) => seen.push(delta),
    async (_url, init) => {
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-key");
      const body = JSON.parse(String(init?.body)) as { stream: boolean; model: string; messages: { role: string }[] };
      assert.equal(body.stream, true);
      assert.equal(body.model, "pareto-26.10-preview");
      assert.equal(body.messages[0].role, "system");
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.slice(0, 19));
          controller.enqueue(bytes.slice(19, 57));
          controller.enqueue(bytes.slice(57));
          controller.close();
        },
      }), { status: 200 });
    },
  );
  assert.deepEqual(seen, pieces);
  assert.equal(result.source, source);
  assert.equal(result.chunks, 2);
  assert.ok(result.firstChunkMs !== null);
});

test("invalid direct output is rejected after streaming", async () => {
  const frame = `data: ${JSON.stringify({ choices: [{ delta: { content: 'root = Stack([Unknown("x")])' } }] })}\n\n`;
  await assert.rejects(
    streamFastVisual(
      { key: "test-key", text: "Show a visual", history: [], signal: new AbortController().signal },
      () => undefined,
      async () => new Response(frame, { status: 200 }),
    ),
    /OpenUI validation failed/,
  );
});

test("early checkpoint uses a compact independent prompt and still validates output", async () => {
  const source = 'root = Stack([TextContent("A first useful scene"), PaletteScene("Example", "blue", [{id:"piece",kind:"circle",x:300,y:300,width:80,fill:"accent"}])])';
  const frame = `data: ${JSON.stringify({ choices: [{ delta: { content: source } }] })}\n\n`;
  const result = await streamFastVisual(
    { key: "test-key", text: "Show checkers visually", history: [{ role: "assistant", text: "Earlier answer" }],
      signal: new AbortController().signal, checkpoint: true },
    () => undefined,
    async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] };
      assert.equal(body.messages.length, 2);
      assert.match(body.messages[0].content, /first small, complete visual lesson/);
      assert.match(body.messages[0].content, /handshapes/);
      assert.doesNotMatch(body.messages[0].content, /VisualHtml/);
      return new Response(frame, { status: 200 });
    },
  );
  assert.equal(result.source, source);
});
