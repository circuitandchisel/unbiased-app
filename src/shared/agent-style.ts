export type AgentStylePrefs = {
  outputDetail: "concise" | "balanced" | "detailed";
  tone: "direct" | "warm" | "formal";
  explanations: "plain" | "technical";
};

export const DEFAULT_AGENT_STYLE: AgentStylePrefs = {
  outputDetail: "concise",
  tone: "direct",
  explanations: "plain",
};

export function parseAgentStylePrefs(value: unknown): AgentStylePrefs {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    outputDetail: raw.outputDetail === "balanced" || raw.outputDetail === "detailed"
      ? raw.outputDetail : "concise",
    tone: raw.tone === "warm" || raw.tone === "formal" ? raw.tone : "direct",
    explanations: raw.explanations === "technical" ? "technical" : "plain",
  };
}

export function agentStyleInstructions(prefs: AgentStylePrefs): string {
  const detail = {
    concise: "Answer directly in one or two short paragraphs when that covers the task. Keep essential evidence, caveats, and next steps; omit repetition and filler.",
    balanced: "Lead with the answer, then give the reasoning and steps needed to make it useful. Avoid repetition and unnecessary background.",
    detailed: "Lead with the answer, then explain relevant reasoning, tradeoffs, and examples thoroughly while staying focused on the task.",
  }[prefs.outputDetail];
  const tone = {
    direct: "Use a straightforward, respectful voice without generic praise or sign-offs.",
    warm: "Use a warm, approachable voice without excessive reassurance or filler.",
    formal: "Use a polished, professional voice and precise phrasing.",
  }[prefs.tone];
  const explanations = prefs.explanations === "plain"
    ? "Use familiar words. Briefly explain technical terms and use a concrete example when it clarifies a difficult point."
    : "Use precise technical language appropriate to the task. Explain unfamiliar terms when needed for clarity.";
  return `Response style preferences: ${detail} ${tone} ${explanations} These are defaults for presentation, not limits on the work. Follow the user's explicit request for more detail, brevity, or a different style; never omit a material risk or uncertainty.`;
}
