import assert from "node:assert/strict";
import test from "node:test";
import { OPENUI_VISUAL_INSTRUCTIONS } from "./visual-instructions";

test("illustration guidance explains scene coordinates and safe fallback", () => {
  const guide = OPENUI_VISUAL_INSTRUCTIONS.join("\n");
  assert.match(guide, /Circle and ellipse x,y are their CENTERS/);
  assert.match(guide, /rect and triangle x,y are their top-left corners/);
  assert.match(guide, /explain it in prose instead/);
  assert.match(guide, /Never substitute a flowchart/);
  assert.doesNotMatch(guide, /FlowDiagram\(|Mermaid\(/);
  assert.match(guide, /real-world repair or safety topics/);
});

test("new illustrations use OpenUI scenes and local controls", () => {
  const guide = OPENUI_VISUAL_INSTRUCTIONS.join("\n");
  assert.match(guide, /call visualize promptly with a small, complete, static OpenUI scene/);
  assert.match(guide, /first useful scene within about 30 seconds/);
  assert.match(guide, /do not spend another preview on cosmetic polish/);
  assert.match(guide, /provisional scene is not approved final output/);
  assert.match(guide, /connected mechanical geometry/);
  assert.match(guide, /use one VisualHtml HTML-fragment string inside the OpenUI Stack/);
  assert.match(guide, /JavaScript loops and event handlers/);
  assert.match(guide, /no network, imports, external assets, storage, forms, navigation, parent DOM, or host tools/);
  assert.match(guide, /FocusedSequence with SequenceSlide and a scene in every slide/);
  assert.match(guide, /StateScope with StateScene for continuous changes/);
  assert.match(guide, /call visual_validate with format openui/);
  assert.doesNotMatch(guide, /call visual_validate with format openui or visual-html/);
  assert.match(guide, /call visual_commit on a preview/);
  assert.match(guide, /at most 50 shapes/);
  assert.match(guide, /3-20 ordered strings of 12-240 characters/);
  assert.match(guide, /every essential intermediate transformation/);
  assert.match(guide, /Back\/Next controls/);
  assert.match(guide, /do not put every step in a horizontal tab row/);
  assert.match(guide, /Do not impose stage navigation/);
  assert.match(guide, /review brief/);
  assert.match(guide, /A static visual is valid/);
  assert.match(guide, /review\.staticReason/);
  assert.match(guide, /review\.interaction/);
  assert.match(guide, /central loop of a game or process/);
});
