import { z } from "zod";

const coordinate = z.number().finite().min(0).max(800);
const size = z.number().finite().min(0).max(800);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const shapeId = z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/);

const drawableShapeSchema = z.object({
  id: shapeId,
  type: z.enum(["circle", "oval", "square", "rectangle", "triangle", "line", "arrow"]),
  x: coordinate,
  y: z.number().finite().min(0).max(450),
  width: size,
  height: size.optional(),
  fill: color.optional(),
  stroke: color.optional(),
  label: z.string().max(80).optional(),
}).strict().refine((shape) => {
  const isLine = shape.type === "line" || shape.type === "arrow";
  return isLine
    ? shape.width > 0 || (shape.height ?? 0) > 0
    : shape.width >= 4 && (shape.height === undefined || shape.height >= 4);
}, "Shape must have a visible size").refine(
  (shape) => shape.x + shape.width <= 800 && shape.y + (shape.height ?? (shape.type === "line" || shape.type === "arrow" ? 0 : shape.width)) <= 450,
  "Shape must fit within the board",
);

const connectorShapeSchema = z.object({
  id: shapeId,
  type: z.literal("connector"),
  from: shapeId,
  to: shapeId,
  stroke: color.optional(),
  directed: z.boolean().optional(),
  label: z.string().max(80).optional(),
}).strict();

export const whiteboardShapeSchema = z.union([drawableShapeSchema, connectorShapeSchema]);

export const whiteboardSchema = z.object({
  title: z.string().max(100).optional(),
  shapes: z.array(whiteboardShapeSchema).max(60),
}).strict().superRefine((board, context) => {
  const ids = new Set<string>();
  const nodes = new Set(board.shapes.filter((shape) => !["connector", "line", "arrow"].includes(shape.type)).map((shape) => shape.id));
  for (const [index, shape] of board.shapes.entries()) {
    if (ids.has(shape.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["shapes", index, "id"], message: "Shape IDs must be unique" });
    ids.add(shape.id);
    if (shape.type === "connector" && (shape.from === shape.to || !nodes.has(shape.from) || !nodes.has(shape.to))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["shapes", index], message: "Connector must join two different nodes" });
    }
  }
});

const EDGE_TOLERANCE = 16;

/** Nudge near-edge model geometry onto the board before strict validation. */
export function fitMinorWhiteboardOverflow(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const board = value as Record<string, unknown>;
  if (!Array.isArray(board.shapes)) return value;
  return {
    ...board,
    shapes: board.shapes.map((item: unknown) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const shape = item as Record<string, unknown>;
      if (shape.type === "connector" || typeof shape.x !== "number" || typeof shape.y !== "number" ||
          typeof shape.width !== "number" || !Number.isFinite(shape.x) || !Number.isFinite(shape.y) ||
          !Number.isFinite(shape.width)) return item;
      const height = typeof shape.height === "number" ? shape.height
        : shape.type === "line" || shape.type === "arrow" ? 0 : shape.width;
      if (!Number.isFinite(height)) return item;
      const overflowX = shape.x + shape.width - 800;
      const overflowY = shape.y + height - 450;
      return {
        ...shape,
        x: overflowX > 0 && overflowX <= EDGE_TOLERANCE ? shape.x - overflowX : shape.x,
        y: overflowY > 0 && overflowY <= EDGE_TOLERANCE ? shape.y - overflowY : shape.y,
      };
    }),
  };
}

export type WhiteboardShape = z.infer<typeof whiteboardShapeSchema>;
export type DrawableShape = Exclude<WhiteboardShape, { type: "connector" }>;
export type ConnectorShape = Extract<WhiteboardShape, { type: "connector" }>;
