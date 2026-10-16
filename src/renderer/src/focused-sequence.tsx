import { useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { defineComponent, useRenderNode } from "@openuidev/react-lang";
import { focusedSequenceSchema } from "../../shared/focused-sequence";

export const FocusedSequenceComponent = defineComponent({
  name: "FocusedSequence",
  description: "One illustrated procedural stage at a time, with a compact counter and Back/Next controls. Use 2-12 SequenceSlide values and include a scene in each slide.",
  props: focusedSequenceSchema,
  component: ({ props }) => {
    const [index, setIndex] = useState(0);
    const renderNode = useRenderNode();
    const slide = props.slides[Math.min(index, props.slides.length - 1)];
    if (!slide) return null;

    return (
      <section className="app-focused-sequence" aria-label={props.title} data-openui-focused-sequence data-openui-slide-count={props.slides.length}>
        <header className="app-focused-sequence__header">
          <div>
            <h2>{props.title}</h2>
            <p>{slide.props.title}</p>
          </div>
          <span aria-live="polite">{index + 1} / {props.slides.length}</span>
        </header>
        <div className="app-focused-sequence__stage" aria-live="polite" data-openui-stage={index + 1}>
          {slide.props.children.map((child, childIndex) => <div key={childIndex}>{renderNode(child)}</div>)}
        </div>
        <footer className="app-focused-sequence__controls">
          <button type="button" disabled={index === 0} onClick={() => setIndex((value) => value - 1)}>
            <ArrowLeft size={16} aria-hidden="true" /> Back
          </button>
          <button type="button" data-openui-next disabled={index === props.slides.length - 1} onClick={() => setIndex((value) => value + 1)}>
            Next <ArrowRight size={16} aria-hidden="true" />
          </button>
        </footer>
      </section>
    );
  },
});
