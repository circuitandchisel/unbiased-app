export type VisualReviewBrief = {
  kind: "procedure" | "other";
  goal: string;
  mustShow: string[];
  interaction?: string;
  staticReason?: string;
  procedure?: {
    reference: string;
    states: string[];
  };
};

export function parseVisualReviewBrief(raw: unknown): { brief?: VisualReviewBrief; errors: string[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { errors: ["Include a review brief describing the user's goal and visible evidence."] };
  }
  const value = raw as Record<string, unknown>;
  const kind = value.kind;
  const goal = typeof value.goal === "string" ? value.goal.trim() : "";
  const mustShow = Array.isArray(value.mustShow) ? value.mustShow.map((item) => typeof item === "string" ? item.trim() : "") : [];
  const interaction = typeof value.interaction === "string" ? value.interaction.trim() : undefined;
  const staticReason = typeof value.staticReason === "string" ? value.staticReason.trim() : undefined;
  const procedure = value.procedure && typeof value.procedure === "object" && !Array.isArray(value.procedure)
    ? value.procedure as Record<string, unknown>
    : undefined;
  const reference = typeof procedure?.reference === "string" ? procedure.reference.trim() : "";
  const states = Array.isArray(procedure?.states)
    ? procedure.states.map((item) => typeof item === "string" ? item.trim() : "")
    : [];
  const errors: string[] = [];
  if (kind !== "procedure" && kind !== "other") {
    errors.push("Review kind must be procedure for ordered instructions or other for concepts, comparisons, and data.");
  }
  if (goal.length < 12 || goal.length > 240) errors.push("Review goal must be 12-240 characters.");
  if (mustShow.length < 1 || mustShow.length > 6 || mustShow.some((item) => item.length < 8 || item.length > 180)) {
    errors.push("List 1-6 observable mustShow items, each 8-180 characters.");
  }
  if (new Set(mustShow.map((item) => item.toLowerCase())).size !== mustShow.length) {
    errors.push("Review mustShow items must be distinct.");
  }
  if (interaction !== undefined && (interaction.length < 8 || interaction.length > 240)) {
    errors.push("Review interaction must describe an observable change in 8-240 characters, or be omitted for a static visual.");
  }
  if (staticReason !== undefined && (staticReason.length < 20 || staticReason.length > 240)) {
    errors.push("Review staticReason must explain in 20-240 characters why exploring, choosing, or stepping through the subject would not improve understanding.");
  }
  if (Boolean(interaction) === Boolean(staticReason)) {
    errors.push("Choose exactly one: review.interaction with a meaningful action and visible result, or review.staticReason explaining why this visual should remain static.");
  }
  if (value.procedure !== undefined) {
    if (!procedure || reference.length < 12 || reference.length > 500) {
      errors.push("Procedure reference must identify a consulted source or user-supplied instructions in 12-500 characters.");
    }
    if (states.length < 3 || states.length > 20 || states.some((item) => item.length < 12 || item.length > 240)) {
      errors.push("Procedure needs 3-20 ordered states, each naming the action and resulting visible state in 12-240 characters.");
    }
    if (new Set(states.map((item) => item.toLowerCase())).size !== states.length) {
      errors.push("Procedure states must be distinct and ordered.");
    }
  }
  if (kind === "procedure" && value.procedure === undefined) {
    errors.push("A procedural visual requires a sourced, complete review.procedure plan before rendering.");
  }
  if (kind === "other" && value.procedure !== undefined) {
    errors.push("Use kind procedure when review.procedure is supplied.");
  }
  return errors.length ? { errors } : {
    brief: {
      kind: kind as "procedure" | "other", goal, mustShow, ...(interaction ? { interaction } : {}),
      ...(staticReason ? { staticReason } : {}),
      ...(procedure ? { procedure: { reference, states } } : {}),
    }, errors,
  };
}

export function visualReviewChecklist(brief: VisualReviewBrief, interactionsTested: number): string {
  const items = brief.mustShow.map((item, index) => `${index + 1}. ${item}`).join(" ");
  const interaction = brief.interaction
    ? `Interaction to verify: ${brief.interaction}`
    : interactionsTested > 0
      ? "Controls were found but the review brief did not name what they should teach. Verify their visible outcome before approval."
      : `Static rationale: ${brief.staticReason ?? "none supplied"}. Check this against the user's actual learning goal: would changing an input, choosing an outcome, inspecting a part, or advancing a stage teach more?`;
  const procedure = brief.procedure
    ? `Grounded procedure (${brief.procedure.reference}): ${brief.procedure.states.map((state, index) => `${index + 1}. ${state}`).join(" ")} Verify every transition in order against the rendered states; a clean layout does not establish that the actions or resulting shapes are correct. `
    : "";
  return `Review this preview against the user's actual request. Goal: ${brief.goal} Visible evidence: ${items} ${interaction} ${procedure}The checklist is author-supplied, not proof of factual accuracy or completeness; inspect the screenshots and reject or repair any missing, misleading, or incorrect part.`;
}

export function visualReviewIssues(brief: VisualReviewBrief, interactionsTested: number): string[] {
  if (brief.interaction && interactionsTested === 0) {
    return ["The review brief promises an interaction, but the preview found no testable controls."];
  }
  if (!brief.interaction && interactionsTested > 0) {
    return ["The preview found controls, but the review brief does not say what they should visibly teach."];
  }
  return [];
}

export function visualInteractionRequestIssue(brief: VisualReviewBrief, explicitlyInteractive: boolean): string | null {
  if (!explicitlyInteractive || brief.interaction) return null;
  return "The user requested an interactive visual. Add a meaningful learner action that changes the visible scene and explanation, and describe that result in review.interaction. A staticReason cannot override the user's request.";
}

export function visualProcedureResearchIssue(brief: VisualReviewBrief, consultedSource: boolean): string | null {
  if (brief.kind !== "procedure" || consultedSource ||
      /^user[- ]supplied (?:instructions|steps|procedure)/i.test(brief.procedure?.reference ?? "")) return null;
  return "Before previewing an instructional procedure, use browser_open followed by browser_read to consult the specific source named in review.procedure.reference. A search result title or invented citation is not enough. This check does not consume a preview.";
}

export function visualRevisionIssue(previewsRemaining: number, rawReason: unknown): string | null {
  if (previewsRemaining !== 1) return null;
  const reason = typeof rawReason === "string" ? rawReason.trim() : "";
  return reason.length >= 20 && reason.length <= 400
    ? null
    : "The final repair preview needs a 20-400 character revisionReason naming what was wrong in the prior preview and what changed. This check does not consume a preview.";
}
