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

export type WhiteboardShape = z.infer<typeof whiteboardShapeSchema>;
export type DrawableShape = Exclude<WhiteboardShape, { type: "connector" }>;
export type ConnectorShape = Extract<WhiteboardShape, { type: "connector" }>;
