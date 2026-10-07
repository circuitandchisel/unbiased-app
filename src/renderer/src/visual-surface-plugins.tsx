import { type CSSProperties, type ReactElement } from "react";
import { z } from "zod";
import { Catalog, CommonSchemas, MessageProcessor } from "@a2ui/web_core/v0_9";
import { A2uiSurface, AudioPlayer, Button, Card, CheckBox, ChoicePicker, Column, createComponentImplementation, DateTimeInput, Divider, Icon, Image, List, Modal, Row, Slider, Tabs, Text, TextField, Video, type ReactComponentImplementation } from "@a2ui/react/v0_9";
import { parseVisualMessages, VISUAL_CATALOG_ID, type VisualMessage } from "./a2ui-payload";
import { Whiteboard } from "./whiteboard";
import { whiteboardSchema } from "./whiteboard-model";

const WhiteboardComponent = createComponentImplementation({
  name: "Whiteboard",
  schema: whiteboardSchema,
}, ({ props }) => <Whiteboard title={props.title} initialShapes={props.shapes} />);

const BarChart = createComponentImplementation({
  name: "BarChart",
  schema: z.object({
    title: CommonSchemas.DynamicString.optional(),
    bars: z.array(z.object({
      label: CommonSchemas.DynamicString,
      value: CommonSchemas.DynamicNumber,
    })).min(1).max(8),
  }),
}, ({ props }) => {
  const bars = props.bars.map((bar) => ({ label: String(bar.label ?? ""), value: Number(bar.value) || 0 }));
  const maximum = Math.max(1, ...bars.map((bar) => Math.max(0, bar.value)));
  return (
    <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
      {props.title && <strong style={{ fontSize: 14 }}>{props.title}</strong>}
      {bars.map((bar, index) => (
        <div key={index} style={{ display: "grid", gridTemplateColumns: "minmax(80px, 1fr) minmax(100px, 3fr) auto", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ overflowWrap: "anywhere" }}>{bar.label}</span>
          <div role="meter" aria-label={bar.label} aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={Math.max(0, bar.value)} style={{ height: 12, borderRadius: 3, background: "var(--panel-2)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, bar.value) / maximum * 100)}%`, background: "var(--accent)", transition: "width 120ms ease" }} />
          </div>
          <span style={{ color: "var(--fg-msg)", fontVariantNumeric: "tabular-nums" }}>{bar.value}</span>
        </div>
      ))}
    </div>
  );
});

const visualCatalog = new Catalog(VISUAL_CATALOG_ID, "0.9", [
  Text, Image, Icon, Video, AudioPlayer, Row, Column, List, Card, Tabs, Divider,
  Modal, Button, TextField, CheckBox, ChoicePicker, Slider, DateTimeInput, BarChart, WhiteboardComponent,
]);

function createVisualSurfaceState(messages: VisualMessage[]) {
  const processor = new MessageProcessor<ReactComponentImplementation>([visualCatalog]);
  try {
    processor.processMessages(messages);
    const first = messages[0].createSurface as { surfaceId: string };
    const surface = processor.model.getSurface(first.surfaceId);
    if (surface) return { processor, surface };
  } catch {
    // Leave invalid model output for the visual-fence fallback.
  }
  processor.dispose();
  return null;
}

type VisualState = NonNullable<ReturnType<typeof createVisualSurfaceState>>;

function A2uiVisualSurface({ state }: { state: VisualState }) {
  return (
    <div
      aria-label="Interactive visual"
      style={{
        margin: "16px 0 20px", width: "100%", maxWidth: "100%", minWidth: 0,
        boxSizing: "border-box", overflowX: "clip", overflowY: "visible",
        fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.5,
        "--a2ui-color-primary": "var(--accent)",
        "--a2ui-color-on-primary": "var(--accent-fg)",
        "--a2ui-color-on-background": "var(--fg-msg)",
        "--a2ui-color-surface": "var(--panel)",
        "--a2ui-color-on-surface": "var(--fg-msg)",
        "--a2ui-color-border": "var(--border)",
        "--a2ui-color-input": "var(--panel-2)",
        "--a2ui-color-on-input": "var(--fg)",
        "--a2ui-color-on-secondary": "var(--fg)",
        "--a2ui-color-secondary": "var(--chip)",
        "--a2ui-color-secondary-hover": "var(--chip-raised)",
        "--a2ui-color-primary-hover": "var(--accent)",
        "--a2ui-color-border-hover": "var(--fg-soft)",
        "--a2ui-text-caption-color": "var(--dim)",
        "--a2ui-font-family-title": "var(--font-ui)",
        "--a2ui-font-size-2xl": "24px", "--a2ui-font-size-xl": "20px",
        "--a2ui-font-size-l": "17px", "--a2ui-font-size-m": "14px",
        "--a2ui-font-size-s": "13px", "--a2ui-font-size-xs": "12px",
        "--a2ui-spacing-xs": "4px", "--a2ui-spacing-s": "6px",
        "--a2ui-spacing-m": "8px", "--a2ui-spacing-l": "12px",
        "--a2ui-border-radius": "8px", "--a2ui-card-border-radius": "28px",
        "--a2ui-textfield-border-radius": "6px",
        "--a2ui-choicepicker-chip-border-radius": "6px",
        "--a2ui-card-border": "1px solid var(--border)",
        "--a2ui-card-box-shadow": "0 14px 36px rgba(0, 0, 0, 0.28)", "--a2ui-card-margin": "0",
        "--a2ui-tabs-header-background-active": "var(--chip)",
        "--a2ui-tabs-content-padding": "0",
        "--a2ui-label-font-weight": "500", "--a2ui-button-margin": "0",
      } as CSSProperties}
    >
      <A2uiSurface surface={state.surface} />
    </div>
  );
}

type VisualPlugin = {
  language: string;
  render: (source: string) => ReactElement | null;
};

const plugins: VisualPlugin[] = [
  {
    language: "a2ui",
    render(source) {
      const messages = parseVisualMessages(source);
      if (!messages) return null;
      const state = createVisualSurfaceState(messages);
      return state ? <A2uiVisualSurface state={state} /> : null;
    },
  },
];

export function visualSurfaceForFence(language: string, source: string) {
  const plugin = plugins.find((item) => item.language === language);
  return plugin?.render(source) ?? null;
}

export function visualFenceContent(language: string, source: string, streaming: boolean) {
  const visual = visualSurfaceForFence(language, source);
  if (visual || language !== "a2ui") return visual;
  return (
    <div
      role="status"
      aria-live={streaming ? "polite" : "off"}
      style={{
        margin: "16px 0 20px", padding: "24px", minHeight: 96,
        boxSizing: "border-box", border: "1px solid var(--border)",
        borderRadius: 28, background: "var(--panel)",
        boxShadow: "0 14px 36px rgba(0, 0, 0, 0.28)",
        color: "var(--dim)", fontFamily: "var(--font-ui)", fontSize: 14,
      }}
    >
      {streaming ? "Preparing visual..." : "Could not display this visual."}
    </div>
  );
}
