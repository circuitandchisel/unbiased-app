---
name: visualize-openui
description: Build staged OpenUI visual answers in Unbiased with the visualize, visual_validate, and visual_commit tools. Use for illustrated explanations, interactive diagrams, procedures, and other requests where seeing or manipulating a concept helps. Delivered automatically with the first successful visualize result; do not open separately.
---

# Visual answers in Unbiased

Use the tool descriptions and the OpenUI component guide supplied by the app for syntax. This skill governs the workflow, not the component catalog.

1. Identify the few facts and visual states the answer must get right. Check a reliable source when accuracy depends on a procedure, rules, safety, or current facts. Once those facts are sufficient, stop researching unless a specific gap blocks the answer. Do not draw guessed states. Decide what the learner should be able to *try*: change an input, choose a branch, inspect a part, or advance a stage. For a game, process, or system, a representative action with a visible consequence usually teaches more than a fixed poster.
2. As soon as one useful, accurate scene is ready, call `visualize` with a complete, small, static OpenUI program. When facts are already available, aim for this first checkpoint in about 30 seconds; never guess to meet the target. It appears in the chat while you work. Do not send a loading shell or a fragment.
3. If a second verified concept is ready promptly, update the draft once with a complete program that preserves what was already correct. Then move to the final visual. Do not spend time polishing or repeatedly replacing provisional drafts.
4. Build the final visual with only interactions that change the depicted state *and* its short explanation. A static illustration is preferable when there is no meaningful learner action, such as a single comparison or a chart best read at once. Do not add decorative controls just to pass validation. For dense custom geometry or local interaction, use sandboxed `VisualHtml` in the final program, not in `visualize` drafts.
5. Call `visual_validate` with a brief tied to the original request. Supply `review.interaction` with the action and observable outcome, or `review.staticReason` with a specific explanation of why interactivity would not improve learning. Inspect the actual desktop and narrow previews, including interaction states. Commit the first preview that meets the brief; only repair and revalidate a concrete accuracy or usability defect. Call `visual_commit` only for a preview you judge accurate and legible.

The draft is provisional, not a substitute for final validation. A technically accepted preview is not proof that its subject matter is right. If a faithful visual cannot be made, say so plainly and give the best accurate answer you can.
