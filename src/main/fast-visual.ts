import spec from "@unbiased/iui/spec";
import { generateSystemPrompt } from "@openuidev/react-lang";
import { validateOpenUIForAgent } from "../shared/visual-validation";
import type { VisualRouteHistoryEntry, VisualRouteTrace } from "./visual-route";

const ENDPOINT = "https://api.unbiased.ai/v1/chat/completions";
const MAX_SOURCE_LENGTH = 256_000;

const components = [
  "Stack", "TextContent", "Col", "Row", "Grid", "Table", "BarChart", "LineChart",
  "PaletteScene", "ChoiceGroup", "ChoiceOption", "Sequence", "SequenceSlide",
  "StateScope", "StateView", "StateCase", "StateScene", "Slider", "Button",
  "LocalButton", "LocalView", "LocalRange",
] as const;

const focusedComponents = Object.fromEntries(
  components.filter((name) => name in spec.components).map((name) => [name, spec.components[name as keyof typeof spec.components]]),
);

const prompt = generateSystemPrompt({
  library: {
    ...spec,
    components: {
      ...focusedComponents,
      VisualHtml: {
        signature: "VisualHtml(source: string)",
        description: "A self-contained interactive HTML fragment with inline CSS, SVG, and JavaScript. No network, imports, external assets, storage, navigation, forms, or host APIs.",
      },
    },
    functions: {},
    actions: {},
  },
  promptOptions: {
    bindings: false,
    additionalRules: [
      "Make a useful visual answer, not a prose poster. For a game, changing system, process, or decision, give the learner a meaningful local action and update both the illustration and its short explanation.",
      "Put the central example in the first viewport. Use a few clear controls and compact copy. Avoid nested cards and decorative chrome.",
      "For custom geometry or an interactive board, use one VisualHtml inside Stack. Its source is a JSON-escaped string containing a self-contained HTML fragment; JavaScript loops and local event handlers are allowed inside its sandbox. Make the scene responsive and keep controls inside the fragment. Set an explicit background and contrasting text color on the fragment root; do not assume the host background is white. Check contrast in every selected state and panel.",
      "Use only components named in this prompt. Do not use Query, Mutation, SearchImage, remote media, external scripts, or links. Do not invent citations or imply you checked a source.",
      "Output exactly one complete OpenUI program, beginning with root = Stack(...). No Markdown fences or prose outside the program.",
    ],
    examples: [
      'A simple local choice: root = Stack([TextContent("What changes when the light moves?"), ChoiceGroup("Light", [ChoiceOption("morning", "Morning", [TextContent("Long shadows"), PaletteScene("Morning", "blue", [{id:"sun",kind:"circle",x:200,y:160,width:90,fill:"accent"}])]), ChoiceOption("noon", "Noon", [TextContent("Short shadows"), PaletteScene("Noon", "blue", [{id:"sun",kind:"circle",x:500,y:100,width:90,fill:"accent"}])])])])',
    ],
  },
});

const REQUIRES_AGENT = /\b(?:latest|current|today|tomorrow|this week|recent|breaking|news|price|cost|available|schedule|weather|law|legal|tax|visa|medical|diagnos|symptom|medication|invest|financial|prescription|repair|fix|broken|injur|emergency|search|browse|look up|verify|official|source|citation|my file|my photo|my screen|my account|upload|download|send|email|deploy|edit|change the code|repository|repo|pull request|commit|fold|origami|cut|sew|solder|install|assemble|recipe|bake|cook)\b/i;
const VISUAL_INTENT = /\b(?:visuals?|visually|interactive|diagrams?|illustrat\w*|simulat\w*|charts?|graphs?|maps?|draw|show me)\b/i;

export function fastVisualEligible(input: {
  text: string;
  route: VisualRouteTrace | null;
  attachments: number;
  computer: boolean;
  planMode: boolean;
  paneId: string;
}): boolean {
  return input.paneId === "main" && !input.computer && !input.planMode && input.attachments === 0 &&
    input.route?.status === "classified" && input.route.detail === "explicit visual request" &&
    input.route.choice !== "text" && VISUAL_INTENT.test(input.text) && !REQUIRES_AGENT.test(input.text);
}

export function fastVisualPrompt(): string {
  return prompt;
}

const CHECKPOINT_PROMPT = `Create the first small, complete visual lesson for the user's topic while a richer interactive lesson is being prepared. Return only one valid OpenUI program beginning root = Stack(...). Use only TextContent and PaletteScene. Keep it focused on one recognizable example with at most 16 shapes, and under 1800 characters. For anatomy or handshapes, prioritize accurate proportions and finger positions over decoration; do not guess if unsure. Do not invent facts, citations, or unsafe instructions. If no accurate scene is possible, return root = Stack([TextContent("Preparing a verified visual example")]). Example syntax: root = Stack([TextContent("First example"), PaletteScene("Example", "blue", [{id:"subject",kind:"circle",x:350,y:300,width:80,fill:"accent"}])])`;

function asMessages(text: string, history: VisualRouteHistoryEntry[], systemPrompt = prompt) {
  const prior = history.slice(-4).filter((entry) => (entry.role === "user" || entry.role === "assistant") && typeof entry.text === "string")
    .map((entry) => ({ role: entry.role, content: entry.text.slice(0, 24_000) }));
  return [{ role: "system", content: systemPrompt }, ...prior, { role: "user", content: text }];
}

export type FastVisualResult = {
  source: string;
  firstChunkMs: number | null;
  totalMs: number;
  chunks: number;
};

export async function streamFastVisual(
  input: { key: string; text: string; history: VisualRouteHistoryEntry[]; signal: AbortSignal; model?: string; checkpoint?: boolean },
  onDelta: (delta: string) => void,
  fetcher: typeof fetch = fetch,
): Promise<FastVisualResult> {
  const started = performance.now();
  const response = await fetcher(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: input.model || "pareto-26.10-preview",
      messages: asMessages(input.text, input.checkpoint ? [] : input.history, input.checkpoint ? CHECKPOINT_PROMPT : prompt),
      stream: true,
      reasoning_effort: "low",
      reasoning: { effort: "low" },
    }),
    signal: input.signal,
  });
  if (!response.ok) throw new Error(`Pareto returned HTTP ${response.status}`);
  if (!response.body) throw new Error("Pareto did not return a stream");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let source = "";
  let chunks = 0;
  let firstChunkMs: number | null = null;
  const consume = (frame: string) => {
    const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") return;
    const event = JSON.parse(data) as { choices?: { delta?: { content?: string } }[]; error?: { message?: string } };
    if (event.error) throw new Error(event.error.message || "Pareto stream failed");
    const delta = event.choices?.[0]?.delta?.content;
    if (!delta) return;
    source += delta;
    if (source.length > MAX_SOURCE_LENGTH) throw new Error("Visual exceeded the 256 KB limit");
    chunks++;
    firstChunkMs ??= Math.round(performance.now() - started);
    onDelta(delta);
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let split: number;
      while ((split = pending.indexOf("\n\n")) !== -1) {
        consume(pending.slice(0, split));
        pending = pending.slice(split + 2);
      }
    }
    pending += decoder.decode();
    if (pending.trim()) consume(pending);
  } finally {
    reader.releaseLock();
  }
  const checked = validateOpenUIForAgent(source);
  if (!checked.valid) throw new Error(`OpenUI validation failed: ${checked.errors[0] || "invalid program"}`);
  return { source, chunks, firstChunkMs, totalMs: Math.round(performance.now() - started) };
}
