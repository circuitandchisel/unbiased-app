import { Component, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { createLibrary, createParser, defineComponent, Renderer } from "@openuidev/react-lang";
import { iuiOpenUILibrary } from "@unbiased/iui/openui";
import { guidedExplainerSchema } from "@unbiased/iui";
import { z } from "zod/v4";
import { isInteractiveVisualSource, MAX_INTERACTIVE_VISUAL_LENGTH } from "../../shared/interactive-visual";
import { InteractiveHtmlVisual } from "./interactive-html-visual";
import { MermaidDiagram } from "./mermaid-diagram";
import { mermaidDiagramSchema, MAX_MERMAID_LENGTH } from "./mermaid-model";
import { Whiteboard } from "./whiteboard";
import { whiteboardSchema } from "./whiteboard-model";

const WhiteboardComponent = defineComponent({
  name: "Whiteboard",
  description: "Editable spatial diagram on an 800x450 board. Use labeled shapes and connector edges for graphs. Shapes are bounded, and connector IDs must refer to distinct nodes.",
  props: whiteboardSchema,
  component: ({ props }) => <Whiteboard title={props.title} initialShapes={props.shapes} />,
});

const MermaidComponent = defineComponent({
  name: "Mermaid",
  description: "A focused Mermaid diagram. Give it complete Mermaid syntax with short labels and connected nodes. No click actions or external links.",
  props: mermaidDiagramSchema,
  component: ({ props }) => <MermaidDiagram title={props.title} diagram={props.diagram} embedded />,
});

const visualHtmlSchema = z.object({
  source: z.string().min(1).max(MAX_INTERACTIVE_VISUAL_LENGTH).refine(isInteractiveVisualSource),
}).strict();

const VisualHtmlComponent = defineComponent({
  name: "VisualHtml",
  description: "A bespoke interactive illustration. Pass a self-contained HTML fragment with inline style and script; no full document, network, external assets, links, forms, imports, fetch, or app APIs. The host renders it in a sandboxed frame.",
  props: visualHtmlSchema,
  component: ({ props }) => <InteractiveHtmlVisual source={props.source} />,
});

export const appOpenUILibrary = createLibrary({
  root: "Stack",
  components: [
    ...Object.values(iuiOpenUILibrary.components),
    WhiteboardComponent,
    MermaidComponent,
    VisualHtmlComponent,
  ],
});

const parser = createParser(appOpenUILibrary.toJSONSchema(), "Stack");
const knownComponents = new Set(Object.keys(appOpenUILibrary.components));
const MAX_PROGRAM_LENGTH = 256_000;
const MAX_COMPONENTS = 40;
const UNSAFE_URL = /(?:https?:\/\/|file:\/\/|javascript:|data:)/i;

type Element = { type: "element"; typeName: string; props: Record<string, unknown> };

function inspectTree(value: unknown, depth: number, state: { count: number }): boolean {
  if (depth > 12) return false;
  if (typeof value === "string") return !UNSAFE_URL.test(value);
  if (Array.isArray(value)) return value.every((item) => inspectTree(item, depth + 1, state));
  if (!value || typeof value !== "object") return true;
  const item = value as Record<string, unknown>;
  if (item.type === "element") {
    const element = item as Element;
    if (!knownComponents.has(element.typeName) || ++state.count > MAX_COMPONENTS) return false;
    if (element.typeName === "GuidedExplainer" && !guidedExplainerSchema.safeParse(element.props).success) return false;
    if (element.typeName === "Whiteboard" && !whiteboardSchema.safeParse(element.props).success) return false;
    if (element.typeName === "Mermaid" && !mermaidDiagramSchema.safeParse(element.props).success) return false;
    if (element.typeName === "VisualHtml") {
      if (!visualHtmlSchema.safeParse(element.props).success) return false;
      return Object.entries(element.props).every(([key, child]) => key === "source" || inspectTree(child, depth + 1, state));
    }
  }
  return Object.values(item).every((child) => inspectTree(child, depth + 1, state));
}

export function inspectOpenUI(source: string): { valid: boolean; reason?: string; selfFramed?: boolean } {
  if (!source.trim() || source.length > MAX_PROGRAM_LENGTH) return { valid: false, reason: "size" };
  try {
    const result = parser.parse(source);
    if (!result.root || result.root.typeName !== "Stack" || result.meta.incomplete ||
        result.meta.errors.length || result.meta.unresolved.length || result.meta.statementCount > MAX_COMPONENTS ||
        result.queryStatements.length || result.mutationStatements.length) {
      return { valid: false, reason: "parse" };
    }
    const state = { count: 0 };
    if (!inspectTree(result.root, 0, state)) return { valid: false, reason: "content" };
    const children = result.root.props.children;
    const first = Array.isArray(children) ? children[0] as Element | undefined : undefined;
    const selfFramed = Array.isArray(children) && children.length === 1 && first?.type === "element" &&
      ["GuidedExplainer", "Whiteboard", "VisualHtml"].includes(first.typeName);
    return { valid: true, selfFramed };
  } catch {
    return { valid: false, reason: "parse" };
  }
}

class VisualRenderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

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

function OpenUIVisualSurface({ source, selfFramed }: { source: string; selfFramed: boolean }) {
  return (
    <VisualRenderBoundary key={source}>
      <div
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
        <Renderer response={source} library={appOpenUILibrary} isStreaming={false} toolProvider={null} publishObservability={false} />
      </div>
    </VisualRenderBoundary>
  );
}

function VisualFenceStatus({ pending = false }: { pending?: boolean }) {
  return (
    <div className="app-openui-status" role="status" aria-live={pending ? "polite" : "off"}>
      {pending ? "Preparing visual..." : "This visual couldn't be displayed. The rest of the answer is still available."}
    </div>
  );
}

function renderProgram(source: string, streaming: boolean): ReactElement {
  if (streaming) return <VisualFenceStatus pending />;
  const inspected = inspectOpenUI(source);
  if (!inspected.valid) {
    console.warn("[visual] OpenUI source rejected:", inspected.reason);
    return <VisualFenceStatus />;
  }
  return <OpenUIVisualSurface source={source} selfFramed={Boolean(inspected.selfFramed)} />;
}

export function visualFenceContent(language: string, source: string, streaming: boolean): ReactElement | null {
  if (language === "openui") return renderProgram(source, streaming);
  if (language === "mermaid") {
    if (streaming) return <VisualFenceStatus pending />;
    if (!mermaidDiagramSchema.safeParse({ diagram: source }).success || source.length > MAX_MERMAID_LENGTH) return <VisualFenceStatus />;
    return renderProgram(`root = Stack([Mermaid(${JSON.stringify(source)})])`, false);
  }
  if (language === "visual-html") {
    if (streaming) return <VisualFenceStatus pending />;
    if (!isInteractiveVisualSource(source)) return <VisualFenceStatus />;
    return renderProgram(`root = Stack([VisualHtml(${JSON.stringify(source)})])`, false);
  }
  return null;
}
