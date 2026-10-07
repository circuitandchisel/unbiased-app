import { type CSSProperties, type ReactElement } from "react";
import { z } from "zod";
import { Catalog, CommonSchemas, MessageProcessor } from "@a2ui/web_core/v0_9";
import { A2uiSurface, Card, Column, createComponentImplementation, Divider, Row, Slider, Text, type ReactComponentImplementation } from "@a2ui/react/v0_9";
import { parseVisualMessages, VISUAL_CATALOG_ID, type VisualMessage } from "./a2ui-payload";

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

const visualCatalog = new Catalog(VISUAL_CATALOG_ID, "0.9", [Text, Column, Row, Card, Divider, Slider, BarChart]);

export function createVisualSurfaceState(messages: VisualMessage[]) {
  const processor = new MessageProcessor<ReactComponentImplementation>([visualCatalog]);
  try {
    processor.processMessages(messages);
    const first = messages[0].createSurface as { surfaceId: string };
    const surface = processor.model.getSurface(first.surfaceId);
    if (surface) return { processor, surface };
  } catch {
    // Keep invalid model output visible through the ordinary code-block path.
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
        background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8,
        padding: 16, margin: "12px 0", maxWidth: "100%", overflow: "auto",
        fontFamily: "inherit", fontSize: 14, lineHeight: 1.5,
        "--a2ui-color-primary": "var(--accent)",
        "--a2ui-color-on-background": "var(--fg-msg)",
        "--a2ui-color-surface": "var(--panel)",
        "--a2ui-color-border": "var(--border)",
        "--a2ui-font-size-m": "14px", "--a2ui-font-size-s": "13px",
        "--a2ui-spacing-m": "8px", "--a2ui-spacing-l": "12px",
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
