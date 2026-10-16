import { createLibrary, createParser, defineComponent } from "@openuidev/react-lang";
import { choiceGroupIssue, choiceGroupSchema, choiceOptionSchema, gridSchema, guidedExplainerSchema, hotspotSchema, hotspotVisualIssue, hotspotVisualSchema, imageAssetSchema, milestoneSchema, paletteSceneSchema, sceneSchema, sequenceSlideSchema, sliderSchema, stateCaseSchema, stateSceneSchema, stateScopeSchema, timelineSchema } from "@unbiased/iui";
import { iuiOpenUILibrary } from "@unbiased/iui/openui";
import { z } from "zod/v4";
import { isInteractiveVisualSource, visualHtmlSchema } from "./interactive-visual";
import { whiteboardSchema } from "../renderer/src/whiteboard-model";
import { stateScopeIssue } from "./visual-state";
import { focusedSequenceIssue, focusedSequenceSchema } from "./focused-sequence";
import { approvedVisualImage, approvedVisualUrl, OPENUI_MUTATION_TOOLS, OPENUI_QUERY_TOOLS } from "./visual-openui-policy";

// Validation uses the same component schemas as the renderer; no UI is mounted in the main process.
const library = createLibrary({
  root: "Stack",
  components: [
    ...Object.values(iuiOpenUILibrary.components),
    defineComponent({ name: "FocusedSequence", description: "", props: focusedSequenceSchema, component: () => null }),
    defineComponent({ name: "Whiteboard", description: "", props: whiteboardSchema, component: () => null }),
    defineComponent({ name: "VisualHtml", description: "", props: visualHtmlSchema, component: () => null }),
  ],
});
const parser = createParser(library.toJSONSchema(), "Stack");
const knownComponents = new Set(Object.keys(library.components));
const unsafeUrl = /(?:https?:\/\/|file:\/\/|javascript:|data:)/i;
const MAX_PROGRAM_LENGTH = 256_000;
const MAX_COMPONENTS = 40;
const SAFE_EXPRESSION_NODES = new Set(["Str", "Num", "Bool", "Null", "StateRef", "RuntimeRef", "BinOp", "UnaryOp", "Ternary", "Obj", "Arr", "Member", "Index"]);

type Element = { type: "element"; typeName: string; props: Record<string, unknown> };
type Check = { valid: boolean; errors: string[] };

export function validateVisualHtmlForAgent(source: string): Check {
  return isInteractiveVisualSource(source)
    ? { valid: true, errors: [] }
    : { valid: false, errors: ["Use a nonempty HTML fragment under 128 KB, without html, head, body, or doctype tags."] };
}

export function openUIVisualHtmlSources(source: string): string[] {
  const parsed = parser.parse(source);
  const sources: string[] = [];
  function visit(value: unknown): void {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    const item = value as Record<string, unknown>;
    if (item.type === "element" && item.typeName === "VisualHtml") {
      if (typeof (item.props as Record<string, unknown>)?.source === "string") {
        sources.push((item.props as Record<string, string>).source);
      }
      return;
    }
    Object.values(item).forEach(visit);
  }
  visit(parsed.root);
  return sources;
}

export function createVisualValidationBudget(limit = 2) {
  const attempts = new Map<string, { turnId: string | null; count: number }>();
  return {
    remaining(threadId: string | null, turnId: string | null): number {
      if (!threadId) return limit;
      const previous = attempts.get(threadId);
      return Math.max(0, limit - (previous?.turnId === turnId ? previous.count : 0));
    },
    tryUse(threadId: string | null, turnId: string | null): boolean {
      if (!threadId) return true;
      const previous = attempts.get(threadId);
      const count = previous?.turnId === turnId ? previous.count : 0;
      if (count >= limit) return false;
      attempts.set(threadId, { turnId, count: count + 1 });
      return true;
    },
    clear(threadId: string): void {
      attempts.delete(threadId);
    },
  };
}

function issueFor(typeName: string, props: Record<string, unknown>): string | null {
  const schemas = {
    GuidedExplainer: guidedExplainerSchema,
    PaletteScene: paletteSceneSchema,
    Scene: sceneSchema,
    ImageAsset: imageAssetSchema,
    Hotspot: hotspotSchema,
    HotspotVisual: hotspotVisualSchema,
    ChoiceOption: choiceOptionSchema,
    ChoiceGroup: choiceGroupSchema,
    Grid: gridSchema,
    Milestone: milestoneSchema,
    Timeline: timelineSchema,
    SequenceSlide: sequenceSlideSchema,
    StateScope: stateScopeSchema,
    Slider: sliderSchema,
    StateCase: stateCaseSchema,
    StateScene: stateSceneSchema,
    Whiteboard: whiteboardSchema,
    VisualHtml: visualHtmlSchema,
  } as Record<string, z.ZodType>;
  const schema = schemas[typeName];
  if (!schema) return null;
  const result = schema.safeParse(props);
  if (result.success) return null;
  const first = result.error.issues[0];
  return `${typeName}${first.path.length ? ` ${first.path.join(".")}` : ""}: ${first.message}`;
}

export function validateOpenUIForAgent(source: string): Check {
  if (!source.trim() || source.length > MAX_PROGRAM_LENGTH) return { valid: false, errors: ["The program is empty or exceeds 256 KB."] };
  let parsed: ReturnType<typeof parser.parse>;
  try {
    parsed = parser.parse(source);
  } catch {
    return { valid: false, errors: ["OpenUI syntax could not be parsed."] };
  }
  if (!parsed.root || parsed.root.typeName !== "Stack" || parsed.meta.incomplete || parsed.meta.errors.length ||
      parsed.meta.unresolved.length || parsed.meta.statementCount > MAX_COMPONENTS + 6) {
    const details = parsed.meta.errors.map((error) => typeof error === "string" ? error : JSON.stringify(error));
    return { valid: false, errors: details.length ? details.slice(0, 3) : ["Use one complete root = Stack([...]) program with known components and no unsupported actions."] };
  }
  const errors: string[] = [];
  const state = parsed.stateDeclarations as Record<string, unknown>;
  const stateNames = Object.keys(state);
  const queries = new Set(parsed.queryStatements.map((statement) => statement.statementId));
  const mutations = new Set(parsed.mutationStatements.map((statement) => statement.statementId));
  if (stateNames.length > 8) errors.push("Use at most eight local state variables.");
  for (const name of stateNames) {
    const value = state[name];
    if (!/^\$[a-z][a-z0-9_]{0,31}$/i.test(name) ||
        !(typeof value === "boolean" || typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 10_000 ||
          typeof value === "string" && value.length <= 80 && !unsafeUrl.test(value))) {
      errors.push(`Invalid local state declaration: ${name}.`);
    }
  }
  function checkExpression(value: unknown, depth = 0, allowUrl = false): boolean {
    if (depth > 10 || !value || typeof value !== "object") return false;
    const node = value as Record<string, unknown>;
    if (typeof node.k !== "string" || !SAFE_EXPRESSION_NODES.has(node.k)) return false;
    if (node.k === "StateRef") return typeof node.n === "string" && Object.hasOwn(state, node.n);
    if (node.k === "RuntimeRef") return typeof node.n === "string" &&
      (node.refType === "query" && queries.has(node.n) || node.refType === "mutation" && mutations.has(node.n));
    if (node.k === "Str") return typeof node.v === "string" && node.v.length <= 2000 && (allowUrl || !unsafeUrl.test(node.v));
    if (node.k === "Num") return typeof node.v === "number" && Number.isFinite(node.v) && Math.abs(node.v) <= 10_000;
    if (node.k === "Bool" || node.k === "Null") return true;
    if (node.k === "BinOp") return checkExpression(node.left, depth + 1) && checkExpression(node.right, depth + 1);
    if (node.k === "UnaryOp") return checkExpression(node.operand, depth + 1);
    if (node.k === "Ternary") return checkExpression(node.cond, depth + 1) && checkExpression(node.then, depth + 1) && checkExpression(node.else, depth + 1);
    if (node.k === "Obj") return Array.isArray(node.entries) && node.entries.length <= 30 && node.entries.every((entry) =>
      Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string" && entry[0].length <= 64 &&
      !["constructor", "prototype", "__proto__"].includes(entry[0]) && checkExpression(entry[1], depth + 1));
    if (node.k === "Arr") return Array.isArray(node.els) && node.els.length <= 30 && node.els.every((item) => checkExpression(item, depth + 1));
    if (node.k === "Member") return typeof node.field === "string" && /^[a-z][a-z0-9_]{0,63}$/i.test(node.field) &&
      !["constructor", "prototype", "__proto__"].includes(node.field) && checkExpression(node.obj, depth + 1);
    if (node.k === "Index") return checkExpression(node.obj, depth + 1) &&
      ["Str", "Num"].includes((node.index as Record<string, unknown>)?.k as string) && checkExpression(node.index, depth + 1) &&
      !["constructor", "prototype", "__proto__"].includes(String((node.index as Record<string, unknown>).v));
    return false;
  }
  if (queries.size > 3 || mutations.size > 3) errors.push("Use at most three approved queries and three approved mutations.");
  for (const query of parsed.queryStatements) {
    if (query.toolAST?.k !== "Str" || !OPENUI_QUERY_TOOLS.includes(query.toolAST.v as typeof OPENUI_QUERY_TOOLS[number]) ||
        query.refreshAST || query.argsAST && !checkExpression(query.argsAST) ||
        query.defaultsAST && !checkExpression(query.defaultsAST)) errors.push(`Query ${query.statementId} must use an approved read tool without refresh.`);
  }
  for (const mutation of parsed.mutationStatements) {
    if (mutation.toolAST?.k !== "Str" || !OPENUI_MUTATION_TOOLS.includes(mutation.toolAST.v as typeof OPENUI_MUTATION_TOOLS[number]) ||
        mutation.argsAST && !checkExpression(mutation.argsAST)) errors.push(`Mutation ${mutation.statementId} must use an approved write tool.`);
  }
  function checkAction(action: unknown): boolean {
    if (!action || typeof action !== "object") return false;
    const item = action as Record<string, unknown>;
    if (item.k !== "Comp" || !Array.isArray(item.args)) return false;
    const args = item.args;
    if (item.name === "Set") {
      const target = args[0] as Record<string, unknown> | undefined;
      return args.length === 2 && target?.k === "StateRef" && typeof target.n === "string" &&
        Object.hasOwn(state, target.n) && checkExpression(args[1]);
    }
    if (item.name === "Reset") return args.length > 0 && args.every((arg) =>
      arg && typeof arg === "object" && (arg as Record<string, unknown>).k === "StateRef" &&
      Object.hasOwn(state, (arg as Record<string, unknown>).n as string));
    if (item.name === "ToAssistant") return (args.length === 1 || args.length === 2) &&
      checkExpression(args[0]) && (args.length === 1 || checkExpression(args[1]));
    if (item.name === "OpenUrl") return args.length === 1 && (args[0] as Record<string, unknown>)?.k === "Str" &&
      approvedVisualUrl((args[0] as Record<string, unknown>).v) !== null;
    if (item.name === "Run") return args.length === 1 && (args[0] as Record<string, unknown>)?.k === "RuntimeRef" &&
      typeof (args[0] as Record<string, unknown>).n === "string" &&
      (mutations.has((args[0] as Record<string, unknown>).n as string) || queries.has((args[0] as Record<string, unknown>).n as string));
    return false;
  }
  let count = 0;
  let scriptedCount = 0;
  function visit(value: unknown, depth: number): void {
    if (errors.length >= 8) return;
    if (depth > 20) { errors.push("Component nesting is too deep."); return; }
    if (typeof value === "string") {
      if (unsafeUrl.test(value)) errors.push("URLs are only allowed in approved navigation actions and media props.");
      return;
    }
    if (Array.isArray(value)) { value.forEach((child) => visit(child, depth + 1)); return; }
    if (!value || typeof value !== "object") return;
    const item = value as Record<string, unknown>;
    if (typeof item.k === "string") {
      if (!checkExpression(item)) errors.push("Only pure expressions over declared local state are allowed.");
      return;
    }
    if (item.type === "element") {
      const element = item as Element;
      if (!knownComponents.has(element.typeName)) { errors.push(`Unknown component: ${element.typeName}.`); return; }
      if (++count > MAX_COMPONENTS) { errors.push("Use at most 40 components."); return; }
      const issue = issueFor(element.typeName, element.props);
      if (issue) errors.push(issue);
      if (element.typeName === "VisualHtml") {
        if (++scriptedCount > 1) errors.push("Use at most one sandboxed VisualHtml per program.");
        return;
      }
      if (element.typeName === "LocalButton") {
        const action = element.props.action as Record<string, unknown> | undefined;
        const args = action?.args;
        const target = Array.isArray(args) ? args[0] as Record<string, unknown> : undefined;
        const next = Array.isArray(args) ? args[1] as Record<string, unknown> : undefined;
        if (action?.k !== "Comp" || action.name !== "Set" || !Array.isArray(args) || args.length !== 2 ||
            target?.k !== "StateRef" || typeof target.n !== "string" || !Object.hasOwn(state, target.n) ||
            !next || !["Str", "Num", "Bool"].includes(String(next.k)) || !checkExpression(next) ||
            typeof next.v !== typeof state[target.n]) {
          errors.push("LocalButton requires @Set on a declared $state variable with a literal value.");
        }
      }
      if ("action" in element.props && element.typeName !== "LocalButton" && !checkAction(element.props.action)) {
        errors.push(`${element.typeName} has an unsupported action.`);
      }
      if (element.typeName === "LocalRange") {
        const value = element.props.value as Record<string, unknown> | undefined;
        const min = element.props.min;
        const max = element.props.max;
        const step = element.props.step ?? 1;
        if (value?.k !== "StateRef" || typeof value.n !== "string" || typeof state[value.n] !== "number" ||
            typeof min !== "number" || typeof max !== "number" || typeof step !== "number" ||
            !Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) ||
            max <= min || max - min > 100 || step <= 0 || step > max - min ||
            (state[value.n] as number) < min || (state[value.n] as number) > max) {
          errors.push("LocalRange needs a bounded numeric $state variable and a range of at most 100.");
        }
      }
      if (element.typeName === "Input" && element.props.type === "password") {
        errors.push("Generated forms cannot ask for passwords.");
      }
      if (element.typeName === "StateScope") {
        const stateIssue = stateScopeIssue(element.props);
        if (stateIssue) errors.push(stateIssue);
      }
      if (element.typeName === "HotspotVisual") {
        const hotspotIssue = hotspotVisualIssue(element.props);
        if (hotspotIssue) errors.push(hotspotIssue);
      }
      if (element.typeName === "ChoiceGroup") {
        const choiceIssue = choiceGroupIssue(element.props);
        if (choiceIssue) errors.push(choiceIssue);
      }
      if (element.typeName === "Sequence" || element.typeName === "FocusedSequence") {
        const slides = element.props.slides;
        if (typeof element.props.title !== "string" || !Array.isArray(slides) || slides.length < 2 || slides.length > 12 ||
            !slides.every((slide) => slide && typeof slide === "object" && (slide as Element).typeName === "SequenceSlide")) {
          errors.push(`${element.typeName} needs a title and 2-12 SequenceSlide entries.`);
        }
        if (element.typeName === "FocusedSequence") {
          const sequenceIssue = focusedSequenceIssue(element.props);
          if (sequenceIssue) errors.push(sequenceIssue);
        }
      }
      if (["Image", "ImageBlock", "ImageText", "ImageTextLarge"].includes(element.typeName) && element.props.src !== undefined &&
          !approvedVisualImage(element.props.src)) errors.push(`${element.typeName} needs an embedded PNG, JPEG, WebP, or GIF image.`);
      if (element.typeName === "ImageGallery") {
        const images = element.props.images;
        if (!Array.isArray(images) || images.length > 12 || images.some((image) => !image || typeof image !== "object" ||
            !approvedVisualImage((image as Record<string, unknown>).src))) errors.push("ImageGallery needs at most 12 embedded images.");
      }
      if (element.typeName === "Timeline") {
        const milestones = element.props.milestones;
        if (!Array.isArray(milestones) || !milestones.every((milestone) => milestone && typeof milestone === "object" && (milestone as Element).typeName === "Milestone")) {
          errors.push("Timeline needs 2-12 Milestone entries.");
        }
      }
      if (element.typeName === "LocalButton" || "action" in element.props || ["Image", "ImageBlock", "ImageText", "ImageTextLarge", "ImageGallery"].includes(element.typeName)) {
        Object.entries(element.props).filter(([key]) => key !== "action" && key !== "src" && key !== "images").forEach(([, child]) => visit(child, depth + 1));
        return;
      }
    }
    Object.values(item).forEach((child) => visit(child, depth + 1));
  }
  visit(parsed.root, 0);
  return { valid: errors.length === 0, errors };
}

const VISUALIZE_COMPONENTS = new Set([
  "Stack", "TextContent", "Callout", "Steps", "StepsItem", "Table", "Col",
  "BarChart", "LineChart", "Series", "Separator", "Card", "CardHeader",
  "Scene", "PaletteScene", "Grid", "Timeline", "Milestone",
]);

export function validateVisualizeDraft(source: string): Check {
  if (source.length > 32_000) return { valid: false, errors: ["Keep a provisional visual under 32 KB."] };
  const checked = validateOpenUIForAgent(source);
  if (!checked.valid) return checked;
  const parsed = parser.parse(source);
  if (Object.keys(parsed.stateDeclarations as Record<string, unknown>).length ||
      parsed.queryStatements.length || parsed.mutationStatements.length) {
    return { valid: false, errors: ["Provisional visuals cannot declare state or use data tools."] };
  }
  let count = 0;
  let unsafe = false;
  function visit(value: unknown): void {
    if (unsafe || !value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const item = value as Record<string, unknown>;
    if (item.type === "element") {
      count++;
      if (!VISUALIZE_COMPONENTS.has(String(item.typeName)) || "action" in (item.props as Record<string, unknown>)) {
        unsafe = true;
        return;
      }
    }
    Object.values(item).forEach(visit);
  }
  visit(parsed.root);
  return unsafe || count > 20
    ? { valid: false, errors: ["Use at most 20 static display components; no controls, scripts, or host actions in a provisional visual."] }
    : { valid: true, errors: [] };
}
