export const VISUAL_CATALOG_ID = "https://unbiased.ai/a2ui/visual-v1";

export type VisualMessage = Record<string, unknown>;

const COMPONENTS = new Set(["Text", "Column", "Row", "Card", "Divider", "Slider", "BarChart"]);
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
export function parseVisualMessages(source: string): VisualMessage[] | null {
  if (source.length > 32_768) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(source);
  } catch {
    return null;
  }
  if (!Array.isArray(payload) || payload.length < 2 || payload.length > 16 || hasForbiddenKeys(payload)) return null;

  let surfaceId: string | null = null;
  let componentCount = 0;
  let hasComponents = false;
  let hasRoot = false;
  for (const [index, message] of payload.entries()) {
    if (!record(message) || message.version !== "v0.9") return null;
    const operations = Object.keys(message).filter((key) => key !== "version");
    if (operations.length !== 1 || !OPERATIONS.has(operations[0])) return null;
    const operation = operations[0];
    const body = message[operation];
    if (!record(body) || typeof body.surfaceId !== "string" || body.surfaceId.length > 64) return null;
    if (index === 0) {
      if (operation !== "createSurface" || body.catalogId !== VISUAL_CATALOG_ID) return null;
      surfaceId = body.surfaceId;
      if (Object.keys(body).some((key) => !["surfaceId", "catalogId"].includes(key))) return null;
    } else if (operation === "createSurface" || body.surfaceId !== surfaceId) {
      return null;
    }
    if (operation === "updateComponents") {
      if (!Array.isArray(body.components) || body.components.length === 0) return null;
      componentCount += body.components.length;
      if (componentCount > 40) return null;
      const ids = new Set(body.components.filter(record).map((component) => component.id));
      const cardContents: Record<string, unknown>[] = [];
      for (const component of body.components) {
        if (!record(component) || typeof component.id !== "string" || component.id.length > 64 ||
            !COMPONENTS.has(String(component.component))) return null;
        if (component.id === "root") hasRoot = true;
        if (component.component === "Card" && "children" in component) {
          if ("child" in component || !Array.isArray(component.children) || component.children.length === 0 ||
              component.children.length > 40 ||
              component.children.some((child) => typeof child !== "string" || child.length > 64)) return null;
          const children = component.children as string[];
          delete component.children;
          if (children.length === 1) {
            component.child = children[0];
          } else {
            if (++componentCount > 40) return null;
            let id = `cardContent${componentCount}`;
            while (ids.has(id)) id += "_";
            ids.add(id);
            component.child = id;
            cardContents.push({ id, component: "Column", children });
          }
        }
      }
      body.components.push(...cardContents);
      hasComponents = true;
    }
  }
  return hasComponents && hasRoot ? payload as VisualMessage[] : null;
}
