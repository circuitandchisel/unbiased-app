import assert from "node:assert/strict";
import test from "node:test";
import { parseVisualReviewBrief, visualInteractionRequestIssue, visualProcedureResearchIssue, visualReviewChecklist, visualReviewIssues, visualRevisionIssue } from "./visual-review";

test("review briefs support different visual explanations without prescribing a component", () => {
  for (const review of [
    { kind: "procedure", goal: "Explain how a paper boat takes shape", mustShow: ["Every essential fold changes the paper silhouette"], interaction: "Moving to the next stage reveals the next fold and its instruction", procedure: { reference: "A consulted paper boat folding guide", states: ["Fold the sheet in half; show a shorter doubled rectangle", "Fold the corners to the center; show a pointed roof", "Open and flatten the paper hat; show a square diamond"] } },
    { kind: "other", goal: "Explain how settlements collect resources", mustShow: ["A settlement touches a hex corner", "A matching dice roll yields a resource"], interaction: "Changing the roll highlights paying hexes and updates the collected resources" },
    { kind: "other", goal: "Compare rainfall across the four seasons", mustShow: ["All four seasons use a common quantitative scale"], staticReason: "One shared chart already exposes the full comparison; choosing a season would hide useful context." },
  ]) {
    const result = parseVisualReviewBrief(review);
    assert.deepEqual(result.errors, []);
    assert.equal(result.brief?.goal, review.goal);
    assert.match(visualReviewChecklist(result.brief!, 0), /actual request/);
    if (review.kind === "procedure") {
      assert.match(visualReviewChecklist(result.brief!, 0), /Verify every transition in order/);
    }
  }
});

test("review brief rejects empty, duplicate, and oversized evidence before rendering", () => {
  assert.ok(parseVisualReviewBrief(null).errors.length);
  assert.match(parseVisualReviewBrief({ kind: "procedure", goal: "Explain how to assemble a model", mustShow: ["Each step changes the model"] }).errors.join(" "), /requires a sourced/);
  assert.match(parseVisualReviewBrief({ kind: "other", goal: "Explain how to assemble a model", mustShow: ["Each step changes the model"], procedure: { reference: "A consulted assembly guide", states: ["First stage shows the model", "Second stage shows the model", "Third stage shows the model"] } }).errors.join(" "), /Use kind procedure/);
  assert.ok(parseVisualReviewBrief({ goal: "A visual", mustShow: [] }).errors.length);
  assert.ok(parseVisualReviewBrief({ goal: "Explain a meaningful visual", mustShow: ["The same visible thing", "the same visible thing"] }).errors.length);
  assert.ok(parseVisualReviewBrief({ goal: "Explain a meaningful visual", mustShow: ["a".repeat(181)] }).errors.length);
  assert.match(parseVisualReviewBrief({ kind: "other", goal: "Explain how a system changes", mustShow: ["A changing state is visible"] }).errors.join(" "), /exactly one/);
  assert.match(parseVisualReviewBrief({ kind: "other", goal: "Explain how a system changes", mustShow: ["A changing state is visible"], interaction: "Changing the input changes the state", staticReason: "The chart is complete without controls or a changing state." }).errors.join(" "), /exactly one/);
  assert.match(parseVisualReviewBrief({ kind: "other", goal: "Explain how a system changes", mustShow: ["A changing state is visible"], staticReason: "No controls needed" }).errors.join(" "), /20-240/);
});

test("review checklist calls out controls with no stated learning outcome", () => {
  const brief = parseVisualReviewBrief({ kind: "other", goal: "Show how a pendulum moves", mustShow: ["The bob follows the orbit at each angle"], staticReason: "The single illustration shows the entire trajectory without hiding a useful comparison." }).brief!;
  assert.match(visualReviewChecklist(brief, 2), /Controls were found/);
  assert.match(visualReviewChecklist(brief, 0), /Static rationale/);
  assert.deepEqual(visualReviewIssues(brief, 0), []);
  assert.match(visualReviewIssues(brief, 2)[0], /does not say what they should visibly teach/);
  assert.match(visualReviewIssues({ ...brief, staticReason: undefined, interaction: "Dragging the bob changes the angle and explanation" }, 0)[0], /no testable controls/);
});

test("an explicit interactive request cannot be reviewed as static", () => {
  const staticBrief = parseVisualReviewBrief({ kind: "other", goal: "Explore resource production on a game board",
    mustShow: ["The displayed roll pays a resource to each adjacent settlement"],
    staticReason: "A still board diagram shows the adjacency relationships and number tokens together." }).brief!;
  assert.match(visualInteractionRequestIssue(staticBrief, true) ?? "", /interactive visual/);
  assert.equal(visualInteractionRequestIssue(staticBrief, false), null);
  assert.equal(visualInteractionRequestIssue({ ...staticBrief, staticReason: undefined,
    interaction: "Changing the roll updates paying hexes, resources, and the explanation" }, true), null);
});

test("the final repair preview requires a specific revision reason", () => {
  assert.equal(visualRevisionIssue(2, undefined), null);
  assert.match(visualRevisionIssue(1, "minor fix") ?? "", /final repair preview/);
  assert.equal(visualRevisionIssue(1, "The mobile stage labels clipped, so I replaced them with shorter labels and checked the scene."), null);
});

test("procedural previews require a consulted source unless instructions came from the user", () => {
  const brief = parseVisualReviewBrief({
    kind: "procedure", goal: "Show how to assemble the paper model", mustShow: ["Each fold changes the shape"], interaction: "Next reveals the resulting shape and instruction for the next fold",
    procedure: { reference: "A public paper model assembly guide", states: [
      "Fold the sheet once; show the doubled sheet", "Fold the corners; show a pointed top", "Open the pocket; show the finished model",
    ] },
  }).brief!;
  assert.match(visualProcedureResearchIssue(brief, false) ?? "", /browser_open followed by browser_read/);
  assert.equal(visualProcedureResearchIssue(brief, true), null);
  assert.equal(visualProcedureResearchIssue({ ...brief, procedure: { ...brief.procedure!, reference: "User-supplied instructions in the prompt" } }, false), null);
  assert.equal(visualProcedureResearchIssue({ ...brief, kind: "other", procedure: undefined }, false), null);
});
