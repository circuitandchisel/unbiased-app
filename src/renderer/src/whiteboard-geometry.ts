import type { DrawableShape } from "./whiteboard-model";

/** Endpoints meet the visible perimeter instead of passing through node labels. */
export function connectorPoints(from: DrawableShape, to: DrawableShape): [number, number, number, number] | null {
  const fromHeight = from.type === "square" ? from.width : (from.height ?? from.width);
  const toHeight = to.type === "square" ? to.width : (to.height ?? to.width);
  const ax = from.x + from.width / 2;
  const ay = from.y + fromHeight / 2;
  const bx = to.x + to.width / 2;
  const by = to.y + toHeight / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return null;
  const ux = dx / distance;
  const uy = dy / distance;

  function reach(shape: DrawableShape, height: number) {
    if (shape.type === "square" || shape.type === "rectangle") {
      return Math.min(
        Math.abs(ux) < 0.001 ? Infinity : shape.width / (2 * Math.abs(ux)),
        Math.abs(uy) < 0.001 ? Infinity : height / (2 * Math.abs(uy)),
      );
    }
    const rx = shape.width / 2;
    const ry = height / 2;
    return 1 / Math.hypot(ux / rx, uy / ry);
  }

  const start = Math.min(distance / 2, reach(from, fromHeight) + 2);
  const end = Math.min(distance / 2, reach(to, toHeight) + 2);
  return [ax + ux * start, ay + uy * start, bx - ux * end, by - uy * end];
}
