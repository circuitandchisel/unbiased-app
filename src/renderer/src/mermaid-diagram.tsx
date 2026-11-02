import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Scan, ZoomIn, ZoomOut } from "lucide-react";
import { MAX_MERMAID_LENGTH } from "./mermaid-model";
import { DEFAULT_THEME, THEME_CHANGE_EVENT, themeVars } from "./theme";

let initializedTheme: string | null = null;
let nextRenderId = 0;
let renderQueue: Promise<void> = Promise.resolve();

function renderDiagram(diagram: string, fontFamily: string, colors: Record<string, string>): Promise<string> {
  const task = renderQueue.then(async () => {
    const { default: mermaid } = await import("mermaid");
    const themeKey = JSON.stringify([fontFamily, colors]);
    if (initializedTheme !== themeKey) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        suppressErrorRendering: true,
        maxTextSize: MAX_MERMAID_LENGTH,
        maxEdges: 200,
        flowchart: { inheritDir: true },
        theme: "base",
        fontFamily,
        themeVariables: {
          darkMode: colors["--color-scheme"] === "dark",
          background: colors["--bg"], primaryColor: colors["--panel"], primaryTextColor: colors["--fg"],
          primaryBorderColor: colors["--accent"], secondaryColor: colors["--panel-2"], tertiaryColor: colors["--nav-bg"],
          lineColor: colors["--dim"], textColor: colors["--fg"], clusterBkg: colors["--panel-2"],
          clusterBorder: colors["--border"], edgeLabelBackground: colors["--panel"],
        },
      });
      initializedTheme = themeKey;
    }
    return (await mermaid.render(`unbiased-mermaid-${++nextRenderId}`, diagram)).svg;
  });
  renderQueue = task.then(() => undefined, () => undefined);
  return task;
}

type RenderState = { diagram: string; svg?: string; failed?: boolean };

export function fitMermaidWidth(containerWidth: number, viewportHeight: number, diagramWidth: number, diagramHeight: number): number {
  const availableWidth = Math.max(1, containerWidth - 52);
  const availableHeight = Math.max(1, Math.min(viewportHeight * 0.7, 700) - 52);
  return Math.floor(Math.min(availableWidth, availableHeight * diagramWidth / diagramHeight, diagramWidth * 1.4));
}

export function MermaidDiagram({ diagram, title, embedded = false }: { diagram: string; title?: string; embedded?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<RenderState>({ diagram });
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState<number | null>(null);
  const [themeRevision, setThemeRevision] = useState(0);
  useEffect(() => {
    const update = () => setThemeRevision(value => value + 1);
    window.addEventListener(THEME_CHANGE_EVENT, update);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, update);
  }, []);
  useEffect(() => {
    let active = true;
    setState({ diagram });
    if (!diagram.trim() || diagram.length > MAX_MERMAID_LENGTH) {
      setState({ diagram, failed: true });
      return () => { active = false; };
    }
    const fontFamily = containerRef.current ? getComputedStyle(containerRef.current).fontFamily : "system-ui, sans-serif";
    const computed = containerRef.current ? getComputedStyle(containerRef.current) : null;
    const defaults = themeVars(DEFAULT_THEME);
    const tokens = ["--color-scheme", "--bg", "--panel", "--fg", "--accent", "--panel-2", "--nav-bg", "--dim", "--border"];
    const colors = Object.fromEntries(tokens.map(token => [token, computed?.getPropertyValue(token).trim() || defaults[token]]));
    void renderDiagram(diagram, fontFamily, colors).then(
      (svg) => { if (active) setState({ diagram, svg }); },
      (error) => {
        if (active) {
          console.warn("[visual] Mermaid rendering failed:", error instanceof Error ? error.message : "unknown error");
          setState({ diagram, failed: true });
        }
      },
    );
    return () => { active = false; };
  }, [diagram, themeRevision]);

  const current = state.diagram === diagram ? state : { diagram };
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const svg = viewport?.querySelector("svg");
    if (!viewport || !svg) return;
    const viewBox = svg.viewBox.baseVal;
    if (!viewBox.width || !viewBox.height) return;
    const fit = () => {
      const width = fitMermaidWidth(viewport.clientWidth, window.innerHeight, viewBox.width, viewBox.height);
      setFitWidth((previous) => previous === width ? previous : width);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(viewport);
    window.addEventListener("resize", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [current.svg]);

  return (
    <div ref={containerRef} className={`mermaid-diagram${embedded ? " mermaid-diagram--embedded" : ""}`} aria-label={title ?? "Mermaid diagram"}>
      {!embedded && <div className="mermaid-diagram__header">
        <span className="mermaid-diagram__title">{title ?? "Diagram"}</span>
        {current.svg && <div className="mermaid-diagram__tools">
          <button type="button" title="Zoom out" aria-label="Zoom out" disabled={zoom <= 0.6} onClick={() => setZoom((value) => Math.max(0.6, Math.round((value - 0.2) * 10) / 10))}><ZoomOut size={17} /></button>
          <button type="button" title="Fit diagram" aria-label="Fit diagram" disabled={zoom === 1} onClick={() => setZoom(1)}><Scan size={17} /></button>
          <button type="button" title="Zoom in" aria-label="Zoom in" disabled={zoom >= 2} onClick={() => setZoom((value) => Math.min(2, Math.round((value + 0.2) * 10) / 10))}><ZoomIn size={17} /></button>
        </div>}
      </div>}
      {embedded && title && <div className="mermaid-diagram__embedded-title">{title}</div>}
      {current.svg
        ? <div ref={viewportRef} className="mermaid-diagram__viewport">
            <div className="mermaid-diagram__drawing" style={{ "--diagram-width": fitWidth ? `${fitWidth * zoom}px` : "100%" } as CSSProperties} dangerouslySetInnerHTML={{ __html: current.svg }} />
          </div>
        : <div className="mermaid-diagram__state" role="status">
            {current.failed ? "Could not display this diagram." : "Preparing diagram..."}
          </div>}
    </div>
  );
}
