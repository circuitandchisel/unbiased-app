import { useEffect, useRef, useState } from "react";
import { Arrow, Circle, Ellipse, Layer, Line, Rect, RegularPolygon, Stage, Text } from "react-konva";
import { ArrowRight, Circle as CircleIcon, Download, Ellipse as EllipseIcon, Minus, MousePointer2, RectangleHorizontal, Square, Trash2, Triangle } from "lucide-react";
import type Konva from "konva";
import type { WhiteboardShape } from "./whiteboard-model";

const BOARD_WIDTH = 800;
const BOARD_HEIGHT = 450;
const COLORS = ["#5da5e8", "#f49a56", "#45c9a5", "#e66577", "#f0c36b", "#e9edf2"];
type ShapeType = WhiteboardShape["type"];

function Shape({ shape, selected, onSelect, onMove }: {
  shape: WhiteboardShape;
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
}) {
  const common = {
    x: shape.x, y: shape.y, draggable: true,
    fill: shape.fill ?? COLORS[0], stroke: selected ? "#ffffff" : (shape.stroke ?? "#d0d6df"),
    strokeWidth: selected ? 3 : 2,
    onClick: onSelect, onTap: onSelect,
    onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => onMove(event.target.x(), event.target.y()),
  };
  const height = shape.height ?? shape.width;
  const isLine = shape.type === "line" || shape.type === "arrow";
  let node;
  switch (shape.type) {
    case "circle": node = <Circle {...common} x={shape.x + shape.width / 2} y={shape.y + shape.width / 2} radius={shape.width / 2} onDragEnd={(event) => onMove(event.target.x() - shape.width / 2, event.target.y() - shape.width / 2)} />; break;
    case "oval": node = <Ellipse {...common} x={shape.x + shape.width / 2} y={shape.y + height / 2} radiusX={shape.width / 2} radiusY={height / 2} onDragEnd={(event) => onMove(event.target.x() - shape.width / 2, event.target.y() - height / 2)} />; break;
    case "triangle": node = <RegularPolygon {...common} x={shape.x + shape.width / 2} y={shape.y + height / 2} sides={3} radius={shape.width / 2} rotation={0} onDragEnd={(event) => onMove(event.target.x() - shape.width / 2, event.target.y() - height / 2)} />; break;
    case "square": node = <Rect {...common} width={shape.width} height={shape.width} cornerRadius={2} />; break;
    case "rectangle": node = <Rect {...common} width={shape.width} height={height} cornerRadius={2} />; break;
    case "line": node = <Line {...common} points={[0, 0, shape.width, height]} fill={undefined} hitStrokeWidth={18} />; break;
    case "arrow": node = <Arrow {...common} points={[0, 0, shape.width, height]} fill={shape.stroke ?? COLORS[0]} pointerLength={12} pointerWidth={12} hitStrokeWidth={18} />; break;
  }
  return <>
    {node}
    {!isLine && shape.label && <Text x={shape.x + 4} y={shape.y + height / 2 - 10} width={shape.width - 8} text={shape.label} fontSize={16} fontFamily="sans-serif" align="center" fill="#ffffff" listening={false} />}
  </>;
}

export function Whiteboard({ title, initialShapes }: { title?: string; initialShapes: WhiteboardShape[] }) {
  const [shapes, setShapes] = useState(initialShapes);
  const [selected, setSelected] = useState<string | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(BOARD_WIDTH);
  const container = useRef<HTMLDivElement>(null);
  const stage = useRef<Konva.Stage>(null);
  const nextId = useRef(0);

  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width;
      if (nextWidth) setWidth(Math.min(BOARD_WIDTH, nextWidth));
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  function add(type: ShapeType) {
    if (shapes.length >= 60) return;
    let id: string;
    do { id = `local-${++nextId.current}`; } while (shapes.some((shape) => shape.id === id));
    setShapes((current) => [...current, {
      id, type, x: 110 + (current.length % 6) * 35, y: 100 + (current.length % 5) * 28,
      width: type === "line" || type === "arrow" ? 130 : 90,
      height: type === "rectangle" || type === "oval" ? 60 : type === "line" || type === "arrow" ? 40 : undefined,
      fill: color, stroke: color,
    }]);
    setSelected(id);
  }

  function download() {
    const uri = stage.current?.toDataURL({ pixelRatio: 2 });
    if (!uri) return;
    const link = document.createElement("a");
    link.href = uri;
    link.download = "whiteboard.png";
    link.click();
  }

  const tools: { type: ShapeType; icon: typeof CircleIcon; name: string }[] = [
    { type: "circle", icon: CircleIcon, name: "Circle" },
    { type: "oval", icon: EllipseIcon, name: "Oval" },
    { type: "square", icon: Square, name: "Square" },
    { type: "rectangle", icon: RectangleHorizontal, name: "Rectangle" },
    { type: "triangle", icon: Triangle, name: "Triangle" },
    { type: "line", icon: Minus, name: "Line" },
    { type: "arrow", icon: ArrowRight, name: "Arrow" },
  ];
  const scale = width / BOARD_WIDTH;
  const buttonStyle = { width: 30, height: 30, display: "inline-grid", placeItems: "center", border: 0, borderRadius: 4, color: "var(--fg-msg)", background: "transparent", cursor: "pointer" };

  return <div aria-label={title ?? "Whiteboard"} style={{ width: "100%", maxWidth: BOARD_WIDTH, minWidth: 0, border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", background: "var(--panel)" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "6px 8px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
      {title && <strong style={{ marginRight: 12, fontSize: 13, fontWeight: 600 }}>{title}</strong>}
      <button title="Select and move" aria-label="Select and move" style={buttonStyle} onClick={() => setSelected(null)}><MousePointer2 size={16} /></button>
      {tools.map(({ type, icon: Icon, name }) => <button key={type} title={`Add ${name.toLowerCase()}`} aria-label={`Add ${name.toLowerCase()}`} disabled={shapes.length >= 60} style={{ ...buttonStyle, opacity: shapes.length >= 60 ? 0.4 : 1 }} onClick={() => add(type)}><Icon size={16} /></button>)}
      <span style={{ width: 1, height: 18, background: "var(--border)", margin: "0 5px" }} />
      {COLORS.map((swatch) => <button key={swatch} title={`Set color ${swatch}`} aria-label={`Set color ${swatch}`} onClick={() => {
        setColor(swatch);
        if (selected) setShapes((current) => current.map((shape) => shape.id === selected ? { ...shape, fill: swatch, stroke: swatch } : shape));
      }} style={{ width: 19, height: 19, borderRadius: "50%", background: swatch, border: color === swatch ? "2px solid var(--fg-msg)" : "2px solid transparent", cursor: "pointer" }} />)}
      <span style={{ flex: 1 }} />
      <button title="Delete selected shape" aria-label="Delete selected shape" disabled={!selected} style={{ ...buttonStyle, opacity: selected ? 1 : 0.4 }} onClick={() => { setShapes((current) => current.filter((shape) => shape.id !== selected)); setSelected(null); }}><Trash2 size={16} /></button>
      <button title="Download PNG" aria-label="Download PNG" style={buttonStyle} onClick={download}><Download size={16} /></button>
    </div>
    <div ref={container} style={{ width: "100%", aspectRatio: `${BOARD_WIDTH} / ${BOARD_HEIGHT}`, background: "#171b20" }}>
      <Stage ref={stage} width={width} height={BOARD_HEIGHT * scale} scaleX={scale} scaleY={scale} onMouseDown={(event) => { if (event.target === event.target.getStage()) setSelected(null); }}>
        <Layer>
          <Rect width={BOARD_WIDTH} height={BOARD_HEIGHT} fill="#171b20" listening={false} />
          {shapes.map((shape) => <Shape key={shape.id} shape={shape} selected={selected === shape.id} onSelect={() => setSelected(shape.id)} onMove={(x, y) => setShapes((current) => current.map((item) => item.id === shape.id ? { ...item, x: Math.max(0, Math.min(BOARD_WIDTH - item.width, x)), y: Math.max(0, Math.min(BOARD_HEIGHT - (item.height ?? item.width), y)) } : item))} />)}
        </Layer>
      </Stage>
    </div>
  </div>;
}
