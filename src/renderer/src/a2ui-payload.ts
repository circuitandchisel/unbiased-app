import { jsonrepair } from "jsonrepair";
import { mermaidDiagramSchema } from "./mermaid-model";
import { fitMinorWhiteboardOverflow, whiteboardSchema } from "./whiteboard-model";

export const VISUAL_CATALOG_ID = "https://unbiased.ai/a2ui/visual-v1";

export type VisualMessage = Record<string, unknown>;
export type VisualParseFailure =
  "too-large" | "invalid-json" | "invalid-envelope" | "unsafe-content" |
  "unsupported-component" | "invalid-component" | "missing-root";
export type VisualParseResult =
  | { messages: VisualMessage[]; failure?: never }
  | { messages?: never; failure: VisualParseFailure };

const COMPONENTS = new Set([
  "Text", "Image", "Icon", "Video", "AudioPlayer", "Row", "Column", "List",
  "Card", "Tabs", "Divider", "Modal", "Button", "TextField", "CheckBox",
  "ChoicePicker", "Slider", "DateTimeInput", "BarChart", "Whiteboard", "Mermaid",
]);
const OPERATIONS = new Set(["createSurface", "updateComponents", "updateDataModel"]);
const FORBIDDEN_KEYS = new Set(["action", "functionCall", "call", "url", "src", "href", "inlineCatalogs"]);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasForbiddenKeys(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenKeys);
  if (!record(value)) return false;
  return Object.entries(value).some(([key, child]) => FORBIDDEN_KEYS.has(key) || hasForbiddenKeys(child));
}

/** Only a bounded, single-surface subset of A2UI is accepted from model text. */
export function inspectVisualMessages(source: string): VisualParseResult {
  const fail = (failure: VisualParseFailure): VisualParseResult => ({ failure });
  if (source.length > 32_768) return fail("too-large");
  let payload: unknown;
  try {
    payload = JSON.parse(source);
  } catch {
    try {
      const repaired = jsonrepair(source);
      if (repaired.length > 40_000) return fail("too-large");
      payload = JSON.parse(repaired);
    } catch {
      return fail("invalid-json");
    }
  }
  if (!Array.isArray(payload) || payload.length < 2 || payload.length > 16) return fail("invalid-envelope");
  if (hasForbiddenKeys(payload)) return fail("unsafe-content");

  let surfaceId: string | null = null;
  let componentCount = 0;
  let hasComponents = false;
  let hasRoot = false;
  const definedIds = new Set<string>();
  const referencedIds: string[] = [];
  for (const [index, message] of payload.entries()) {
    if (!record(message) || message.version !== "v0.9") return fail("invalid-envelope");
    const operations = Object.keys(message).filter((key) => key !== "version");
    if (operations.length !== 1 || !OPERATIONS.has(operations[0])) return fail("invalid-envelope");
    const operation = operations[0];
    const body = message[operation];
    if (!record(body) || typeof body.surfaceId !== "string" || body.surfaceId.length > 64) return fail("invalid-envelope");
    if (index === 0) {
      if (operation !== "createSurface" || body.catalogId !== VISUAL_CATALOG_ID) return fail("invalid-envelope");
      surfaceId = body.surfaceId;
      if (Object.keys(body).some((key) => !["surfaceId", "catalogId"].includes(key))) return fail("invalid-envelope");
    } else if (operation === "createSurface" || body.surfaceId !== surfaceId) {
      return fail("invalid-envelope");
    }
    if (operation === "updateComponents") {
      if (!Array.isArray(body.components) || body.components.length === 0) return fail("invalid-component");
      componentCount += body.components.length;
      if (componentCount > 40) return fail("too-large");
      const ids = new Set(body.components.filter(record).map((component) => component.id));
      const cardContents: Record<string, unknown>[] = [];
      for (const component of body.components) {
        if (!record(component) || typeof component.id !== "string" || component.id.length > 64) return fail("invalid-component");
        definedIds.add(component.id);
        if (!COMPONENTS.has(String(component.component))) return fail("unsupported-component");
        if (component.component === "Icon" && record(component.name)) return fail("invalid-component");
        if (component.component === "Whiteboard") {
          const board = whiteboardSchema.safeParse(fitMinorWhiteboardOverflow({ title: component.title, shapes: component.shapes }));
          if (!board.success) return fail("invalid-component");
          component.shapes = board.data.shapes;
        }
        if (component.component === "Mermaid" && !mermaidDiagramSchema.safeParse({ title: component.title, diagram: component.diagram }).success) return fail("invalid-component");
        if (component.component === "Text" && "value" in component) {
          if ("text" in component) return fail("invalid-component");
          component.text = component.value;
          delete component.value;
        }
        if (component.id === "root") hasRoot = true;
        if (component.component === "Card" && "children" in component) {
          if ("child" in component || !Array.isArray(component.children) || component.children.length === 0 ||
              component.children.length > 40 ||
              component.children.some((child) => typeof child !== "string" || child.length > 64)) return fail("invalid-component");
          const children = component.children as string[];
          delete component.children;
          if (children.length === 1) {
            component.child = children[0];
          } else {
            referencedIds.push(...children);
            if (++componentCount > 40) return fail("too-large");
            let id = `cardContent${componentCount}`;
            while (ids.has(id)) id += "_";
            ids.add(id);
            definedIds.add(id);
            component.child = id;
            cardContents.push({ id, component: "Column", children });
          }
        }
        if (typeof component.child === "string") referencedIds.push(component.child);
        if (Array.isArray(component.children)) {
          referencedIds.push(...component.children.filter((child): child is string => typeof child === "string"));
        }
      }
      body.components.push(...cardContents);
      hasComponents = true;
    }
  }
  if (!hasComponents || !hasRoot) return fail("missing-root");
  if (referencedIds.some((id) => !definedIds.has(id))) return fail("invalid-component");
  return { messages: payload as VisualMessage[] };
}

export function parseVisualMessages(source: string): VisualMessage[] | null {
  return inspectVisualMessages(source).messages ?? null;
}
