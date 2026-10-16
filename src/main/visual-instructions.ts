import spec from "@unbiased/iui/spec";

const componentGuide = Object.values(spec.components).map(
  ({ signature, description }) => `${signature}: ${description}`,
);

export const OPENUI_VISUAL_INSTRUCTIONS = [
  "Match the Unbiased host theme for interface chrome. Standard OpenUI components inherit the app's surface, text, border, accent, and font tokens. In VisualHtml, use var(--visual-bg), var(--visual-fg), var(--visual-muted), and var(--visual-accent) for the fragment root, prose, and controls; the host updates them when its theme changes. Keep distinct subject-matter colors where they teach something, but give every custom surface and selected state readable foreground/background contrast in both light and dark themes. Do not assume a white canvas or force an unrelated global palette.",
  "For a visual answer, include one complete fenced openui block in the final reply. It renders in chat after generation; the user sees the visual, not its source.",
  "The block is OpenUI Lang, not JSON or JSX. Use positional component calls and assign exactly one root Stack. Example: root = Stack([TextContent(\"A graph connects people\"), Mermaid(\"flowchart LR\\nA-->B\")]).",
  "Use only the component signatures below. Supply required arguments in order and omit optional trailing arguments when unnecessary. No Query, Mutation, external media, URLs, app APIs, or action calls.",
  "Choose the most fitting visual: GuidedExplainer for a navigable narrative, Whiteboard for editable spatial graphs, Mermaid for a focused diagram, Table for comparisons, charts for numerical data, and TextContent for supporting prose. Do not force every answer into a visual.",
  "Make the entire program syntactically complete and keep it under 256 KB. A VisualHtml fragment itself must be under 128 KB. Prefer a few purposeful components with concise labels over many disconnected elements.",
  ...componentGuide,
  "Whiteboard(title?: string, shapes: Shape[]): editable 800x450 board. Pass a title and up to 60 shapes with unique IDs. Nodes use type circle|oval|square|rectangle|triangle and x,y,width, optional height, fill/stroke #RRGGBB, optional label. Edges use {id,type:\"connector\",from,to,optional stroke,directed,label}; from and to must identify different nodes. For graphs, use connectors, not free lines.",
  "Mermaid(diagram: string, title?: string): complete Mermaid diagram with connected nodes and short labels. The first argument is Mermaid source, for example \"flowchart LR\\nA-->B\". Avoid click actions and external links.",
  "VisualHtml(source: string): self-contained interactive HTML fragment with inline style and script, not a document. No network, external assets, links, forms, imports, fetch, or app APIs. Use only for an interaction that the standard components cannot express; pass the entire escaped fragment as one string.",
  "GuidedExplainer image asset IDs are not available in this app yet; omit the optional image field. For a custom illustrated scene, use VisualHtml with local CSS and shape elements.",
  "Use normal Markdown outside the visual for brief context. Standalone mermaid and visual-html fences also render through the same visual renderer, but prefer openui when combining components.",
];
