import { z } from "zod";

const coordinate = z.number().finite().min(0).max(800);
const size = z.number().finite().min(0).max(800);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const whiteboardShapeSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
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

export const whiteboardSchema = z.object({
  title: z.string().max(100).optional(),
  shapes: z.array(whiteboardShapeSchema).max(60).refine(
    (shapes) => new Set(shapes.map((shape) => shape.id)).size === shapes.length,
    "Shape IDs must be unique",
  ),
}).strict();

export type WhiteboardShape = z.infer<typeof whiteboardShapeSchema>;
