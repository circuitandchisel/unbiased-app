import { Component, createContext, useContext, useEffect, useRef, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { createLibrary, createParser, defineComponent, Renderer, type ActionEvent } from "@openuidev/react-lang";
import { iuiOpenUILibrary } from "@unbiased/iui/openui";
import { choiceGroupIssue, choiceGroupSchema, choiceOptionSchema, gridSchema, guidedExplainerSchema, hotspotSchema, hotspotVisualIssue, hotspotVisualSchema, imageAssetSchema, milestoneSchema, paletteSceneSchema, sceneSchema, sequenceSlideSchema, sliderSchema, stateCaseSchema, stateSceneSchema, stateScopeSchema, timelineSchema } from "@unbiased/iui";
import { isInteractiveVisualSource, visualHtmlSchema } from "../../shared/interactive-visual";
import { InteractiveHtmlVisual } from "./interactive-html-visual";
import { FocusedSequenceComponent } from "./focused-sequence";
import { GeneratedVisualViewport } from "./generated-visual-viewport";
import { Whiteboard } from "./whiteboard";
import { whiteboardSchema } from "./whiteboard-model";
import { VisualReadyContext } from "./visual-ready-context";
import { afterVisibleVisualPaint } from "./visible-visual-paint";
import { stateScopeIssue } from "../../shared/visual-state";
import { focusedSequenceIssue } from "../../shared/focused-sequence";
import { validateOpenUIForAgent } from "../../shared/visual-validation";
import { boundedVisualText, MAX_VISUAL_FILE_BYTES, visualExportName } from "../../shared/visual-openui-policy";

export const VisualHostContext = createContext<{
  onAction: (event: ActionEvent) => void;
  confirmWrite: (description: string) => Promise<boolean>;
  confirmRead: (description: string) => Promise<boolean>;
} | null>(null);

const WhiteboardComponent = defineComponent({
  name: "Whiteboard",
  description: "Editable spatial diagram on an 800x450 board. Use labeled shapes and connector edges for graphs. Shapes are bounded, and connector IDs must refer to distinct nodes.",
  props: whiteboardSchema,
  component: ({ props }) => <Whiteboard title={props.title} initialShapes={props.shapes} />,
});

const VisualHtmlComponent = defineComponent({
  name: "VisualHtml",
  description: "A bespoke interactive illustration. Pass a self-contained HTML fragment with inline style and script; no full document, network, external assets, links, forms, imports, fetch, or app APIs. The host renders it in a sandboxed frame.",
  props: visualHtmlSchema,
  component: ({ props }) => <GeneratedVisualViewport streaming={false}><InteractiveHtmlVisual source={props.source} /></GeneratedVisualViewport>,
});

export const appOpenUILibrary = createLibrary({
  root: "Stack",
  components: [
    ...Object.values(iuiOpenUILibrary.components),
    FocusedSequenceComponent,
    WhiteboardComponent,
    VisualHtmlComponent,
  ],
});

export type ProgressiveVisualEvent = { kind: "paint" | "rejected"; sourceBytes: number; reason?: string };
export const ProgressiveVisualContext = createContext<{
  enabled: boolean;
  onEvent?: (event: ProgressiveVisualEvent) => void;
}>({ enabled: false });

const parser = createParser(appOpenUILibrary.toJSONSchema(), "Stack");
const knownComponents = new Set(Object.keys(appOpenUILibrary.components));
const MAX_PROGRAM_LENGTH = 256_000;
const MAX_COMPONENTS = 40;
const UNSAFE_URL = /(?:https?:\/\/|file:\/\/|javascript:|data:)/i;

type Element = { type: "element"; typeName: string; props: Record<string, unknown> };

function inspectTree(value: unknown, depth: number, state: { count: number }): boolean {
  if (depth > 20) return false;
  if (typeof value === "string") return !UNSAFE_URL.test(value);
  if (Array.isArray(value)) return value.every((item) => inspectTree(item, depth + 1, state));
  if (!value || typeof value !== "object") return true;
  const item = value as Record<string, unknown>;
  if (item.type === "element") {
    const element = item as Element;
    if (!knownComponents.has(element.typeName) || ++state.count > MAX_COMPONENTS) return false;
    if (element.typeName === "GuidedExplainer" && !guidedExplainerSchema.safeParse(element.props).success) return false;
    if (element.typeName === "PaletteScene" && !paletteSceneSchema.safeParse(element.props).success) return false;
    if (element.typeName === "Scene" && !sceneSchema.safeParse(element.props).success) return false;
    if (element.typeName === "ImageAsset" && !imageAssetSchema.safeParse(element.props).success) return false;
    if (element.typeName === "Hotspot" && !hotspotSchema.safeParse(element.props).success) return false;
    if (element.typeName === "HotspotVisual" && (!hotspotVisualSchema.safeParse(element.props).success || hotspotVisualIssue(element.props))) return false;
    if (element.typeName === "ChoiceOption" && !choiceOptionSchema.safeParse(element.props).success) return false;
    if (element.typeName === "ChoiceGroup" && (!choiceGroupSchema.safeParse(element.props).success || choiceGroupIssue(element.props))) return false;
    if (element.typeName === "Grid" && !gridSchema.safeParse(element.props).success) return false;
    if (element.typeName === "Milestone" && !milestoneSchema.safeParse(element.props).success) return false;
    if (element.typeName === "Timeline") {
      const milestones = element.props.milestones;
      if (!timelineSchema.safeParse(element.props).success || !Array.isArray(milestones) ||
          !milestones.every((milestone) => milestone && typeof milestone === "object" && (milestone as Element).typeName === "Milestone")) return false;
    }
    if (element.typeName === "SequenceSlide" && !sequenceSlideSchema.safeParse(element.props).success) return false;
    if (element.typeName === "FocusedSequence" && focusedSequenceIssue(element.props)) return false;
    if (element.typeName === "StateScope" && (!stateScopeSchema.safeParse(element.props).success || stateScopeIssue(element.props))) return false;
    if (element.typeName === "Slider" && !sliderSchema.safeParse(element.props).success) return false;
    if (element.typeName === "StateCase" && !stateCaseSchema.safeParse(element.props).success) return false;
    if (element.typeName === "StateScene" && !stateSceneSchema.safeParse(element.props).success) return false;
    if (element.typeName === "Sequence") {
      const slides = element.props.slides;
      if (typeof element.props.title !== "string" || !Array.isArray(slides) || slides.length < 2 || slides.length > 12 ||
          !slides.every((slide) => slide && typeof slide === "object" && (slide as Element).typeName === "SequenceSlide")) return false;
    }
    if (element.typeName === "Whiteboard" && !whiteboardSchema.safeParse(element.props).success) return false;
    if (element.typeName === "VisualHtml") {
      if (!visualHtmlSchema.safeParse(element.props).success) return false;
      return Object.entries(element.props).every(([key, child]) => key === "source" || inspectTree(child, depth + 1, state));
    }
  }
  return Object.values(item).every((child) => inspectTree(child, depth + 1, state));
}

function inspectProgram(source: string, streaming: boolean): { valid: boolean; reason?: string; selfFramed?: boolean } {
  if (!source.trim() || source.length > MAX_PROGRAM_LENGTH) return { valid: false, reason: "size" };
  if (!streaming) {
    const checked = validateOpenUIForAgent(source);
    if (!checked.valid) return { valid: false, reason: checked.errors[0] ?? "content" };
    const result = parser.parse(source);
    const children = result.root?.props.children;
    const first = Array.isArray(children) ? children[0] as Element | undefined : undefined;
    return {
      valid: true,
      selfFramed: Array.isArray(children) && children.length === 1 && first?.type === "element" &&
        ["GuidedExplainer", "Sequence", "FocusedSequence", "PaletteScene", "Scene", "StateScope", "Whiteboard", "VisualHtml"].includes(first.typeName),
    };
  }
  // Host-owned widgets may register scripts or do asynchronous layout. Keep
  // them on the settled path until each has an explicit partial-input policy.
  if (streaming && (/\b(?:Whiteboard|VisualHtml|FocusedSequence|LocalButton|LocalRange|LocalView|Button|IconButton|Form|Input|Select|Checkbox|Switch|Query|Mutation)\s*\(/.test(source) ||
      /@(?:ToAssistant|OpenUrl|Run|Set|Reset)\s*\(/.test(source))) return { valid: false, reason: "settled-only" };
  try {
    const result = parser.parse(source);
    if (!result.root || result.root.typeName !== "Stack" || (!streaming && result.meta.incomplete) ||
        result.meta.errors.length || (!streaming && result.meta.unresolved.length) || result.meta.statementCount > MAX_COMPONENTS ||
        result.queryStatements.length || result.mutationStatements.length) {
      return { valid: false, reason: "parse" };
    }
    const state = { count: 0 };
    if (!inspectTree(result.root, 0, state)) return { valid: false, reason: "content" };
    const children = result.root.props.children;
    if (streaming && (!Array.isArray(children) || children.length === 0 || state.count < 2)) {
      return { valid: false, reason: "no-component" };
    }
    const first = Array.isArray(children) ? children[0] as Element | undefined : undefined;
    const selfFramed = Array.isArray(children) && children.length === 1 && first?.type === "element" &&
      ["GuidedExplainer", "Sequence", "FocusedSequence", "PaletteScene", "Scene", "StateScope", "Whiteboard", "VisualHtml"].includes(first.typeName);
    return { valid: true, selfFramed };
  } catch {
    return { valid: false, reason: "parse" };
  }
}

export function inspectOpenUI(source: string): { valid: boolean; reason?: string; selfFramed?: boolean } {
  return inspectProgram(source, false);
}

export function inspectProgressiveOpenUI(source: string): { valid: boolean; reason?: string; selfFramed?: boolean } {
  return inspectProgram(source, true);
}

class VisualRenderBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean; resetKey: string }> {
  state = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromProps(props: { resetKey: string }, state: { failed: boolean; resetKey: string }) {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.warn("[visual] OpenUI rendering failed:", error.message);
  }

  render() {
    return this.state.failed ? <VisualFenceStatus /> : this.props.children;
  }
}

function OpenUIVisualSurface({ source, selfFramed, streaming = false }: { source: string; selfFramed: boolean; streaming?: boolean }) {
  const onReady = useContext(VisualReadyContext);
  const { onEvent } = useContext(ProgressiveVisualContext);
  const host = useContext(VisualHostContext);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const toolProvider = {
    visual_current_time: async () => ({ iso: new Date().toISOString() }),
    visual_read_clipboard_text: async () => {
      if (!host || !await host.confirmRead("Read up to 64 KB of text from your clipboard into this visual?")) {
        return { ok: false, text: "" };
      }
      return await window.unbiased.visualReadClipboardText();
    },
    visual_pick_text_file: async () => {
      if (!host || !await host.confirmRead("Choose a text, CSV, or JSON file (up to 64 KB) for this visual to read?")) {
        return { ok: false, name: "", text: "" };
      }
      return await window.unbiased.visualPickTextFile();
    },
    visual_copy_text: async (args: Record<string, unknown>) => {
      const value = boundedVisualText(args.text, 4000);
      if (!value) throw new Error("The visual did not provide valid text to copy.");
      if (!host || !await host.confirmWrite(`Copy this text to the clipboard?\n\n${value}`)) return { copied: false };
      await navigator.clipboard.writeText(value);
      return { copied: true };
    },
    visual_save_text: async (args: Record<string, unknown>) => {
      const name = visualExportName(args.name);
      const value = boundedVisualText(args.text, MAX_VISUAL_FILE_BYTES);
      if (!name || !value || new TextEncoder().encode(value).byteLength > MAX_VISUAL_FILE_BYTES) {
        throw new Error("The visual did not provide a valid text export.");
      }
      if (!host || !await host.confirmWrite(`Export up to 64 KB of generated text as ${name}? You will choose the destination.`)) {
        return { saved: false };
      }
      const result = await window.unbiased.visualSaveText(name, value);
      return { saved: result.ok, error: result.error };
    },
  };
  const containsVisualHtml = /\bVisualHtml\s*\(/.test(source);
  useEffect(() => {
    if (streaming || !onReady || /\bVisualHtml\s*\(/.test(source)) return;
    return afterVisibleVisualPaint(document, onReady, surfaceRef.current);
  }, [source, onReady, streaming]);
  useEffect(() => {
    if (!streaming || !onEvent) return;
    return afterVisibleVisualPaint(document, () => onEvent({ kind: "paint", sourceBytes: source.length }), surfaceRef.current);
  }, [source, onEvent, streaming]);
  const content = (
    <div
      ref={surfaceRef}
      className={`iui-openui app-openui-visual${selfFramed ? " app-openui-visual--bare" : ""}`}
      aria-label="Interactive visual"
      style={{
        "--openui-background": "var(--panel)",
        "--openui-foreground": "var(--panel-2)",
        "--openui-text-neutral-primary": "var(--fg-msg)",
        "--openui-text-neutral-secondary": "var(--dim)",
        "--openui-border-default": "var(--border)",
        "--openui-interactive-accent-default": "var(--accent)",
      } as CSSProperties}
    >
      <Renderer response={source} library={appOpenUILibrary} isStreaming={streaming} toolProvider={toolProvider}
        onAction={(event) => host?.onAction(event)} publishObservability={false} />
    </div>
  );
  return (
    <VisualRenderBoundary resetKey={source}>
      {containsVisualHtml ? content : <GeneratedVisualViewport streaming={streaming}>{content}</GeneratedVisualViewport>}
    </VisualRenderBoundary>
  );
}

function ProgressiveOpenUIVisual({ source, streaming }: { source: string; streaming: boolean }) {
  const { onEvent } = useContext(ProgressiveVisualContext);
  const accepted = useRef<{ source: string; selfFramed: boolean } | null>(null);
  const inspected = streaming ? inspectProgressiveOpenUI(source) : inspectOpenUI(source);
  if (inspected.valid) accepted.current = { source, selfFramed: Boolean(inspected.selfFramed) };
  useEffect(() => {
    if (!streaming || inspected.valid || !onEvent || inspected.reason === "no-component") return;
    onEvent({ kind: "rejected", sourceBytes: source.length, reason: inspected.reason });
  }, [source, streaming, inspected.valid, inspected.reason, onEvent]);
  if (!streaming && !inspected.valid) return <VisualFenceStatus />;
  return accepted.current
    ? <OpenUIVisualSurface source={accepted.current.source} selfFramed={accepted.current.selfFramed} streaming={streaming} />
    : <VisualFenceStatus pending />;
}

function VisualFenceStatus({ pending = false }: { pending?: boolean }) {
  return (
    <div className="app-openui-status" role="status" aria-live={pending ? "polite" : "off"}>
      {pending ? "Preparing visual..." : "This visual couldn't be displayed. The rest of the answer is still available."}
    </div>
  );
}

function renderProgram(source: string, streaming: boolean, progressive: boolean): ReactElement {
  if (progressive) return <ProgressiveOpenUIVisual source={source} streaming={streaming} />;
  if (streaming) return <VisualFenceStatus pending />;
  const inspected = inspectOpenUI(source);
  if (!inspected.valid) {
    console.warn("[visual] OpenUI source rejected:", inspected.reason);
    return <VisualFenceStatus />;
  }
  return <OpenUIVisualSurface source={source} selfFramed={Boolean(inspected.selfFramed)} />;
}

export function visualFenceContent(language: string, source: string, streaming: boolean, progressive = false): ReactElement | null {
  if (language === "openui") return renderProgram(source, streaming, progressive);
  if (language === "visual-html") {
    if (streaming) return <VisualFenceStatus pending />;
    if (!isInteractiveVisualSource(source)) return <VisualFenceStatus />;
    return <GeneratedVisualViewport streaming={false}><InteractiveHtmlVisual source={source} /></GeneratedVisualViewport>;
  }
  return null;
}
