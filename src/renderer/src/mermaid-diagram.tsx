import { useEffect, useState } from "react";
import { MAX_MERMAID_LENGTH } from "./mermaid-model";

let initialized = false;
let nextRenderId = 0;
let renderQueue: Promise<void> = Promise.resolve();

function renderDiagram(diagram: string): Promise<string> {
  const task = renderQueue.then(async () => {
    const { default: mermaid } = await import("mermaid");
    if (!initialized) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        suppressErrorRendering: true,
        maxTextSize: MAX_MERMAID_LENGTH,
        maxEdges: 200,
        theme: "base",
        fontFamily: "var(--font-ui)",
        themeVariables: {
          darkMode: true,
          background: "#191d22",
          primaryColor: "#263e42",
          primaryTextColor: "#f4f6f8",
          primaryBorderColor: "#70bfb2",
          secondaryColor: "#3b303a",
          tertiaryColor: "#242c34",
          lineColor: "#a8b8c7",
          textColor: "#f4f6f8",
          clusterBkg: "#20272f",
          clusterBorder: "#536373",
          edgeLabelBackground: "#27313b",
        },
      });
      initialized = true;
    }
    return (await mermaid.render(`unbiased-mermaid-${++nextRenderId}`, diagram)).svg;
  });
  renderQueue = task.then(() => undefined, () => undefined);
  return task;
}

type RenderState = { diagram: string; svg?: string; failed?: boolean };

export function MermaidDiagram({ diagram, title, embedded = false }: { diagram: string; title?: string; embedded?: boolean }) {
  const [state, setState] = useState<RenderState>({ diagram });
  useEffect(() => {
    let active = true;
    setState({ diagram });
    if (!diagram.trim() || diagram.length > MAX_MERMAID_LENGTH) {
      setState({ diagram, failed: true });
      return () => { active = false; };
    }
    void renderDiagram(diagram).then(
      (svg) => { if (active) setState({ diagram, svg }); },
      () => { if (active) setState({ diagram, failed: true }); },
    );
    return () => { active = false; };
  }, [diagram]);

  const current = state.diagram === diagram ? state : { diagram };
  return (
    <div className={`mermaid-diagram${embedded ? " mermaid-diagram--embedded" : ""}`} aria-label={title ?? "Mermaid diagram"}>
      {title && <div className="mermaid-diagram__title">{title}</div>}
      {current.svg
        ? <div className="mermaid-diagram__drawing" dangerouslySetInnerHTML={{ __html: current.svg }} />
        : <div className="mermaid-diagram__state" role="status">
            {current.failed ? "Could not display this diagram." : "Preparing diagram..."}
          </div>}
    </div>
  );
}
