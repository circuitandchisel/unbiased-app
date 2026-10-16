import { SequenceSlideOpenUI } from "@unbiased/iui/openui";
import { z } from "zod/v4";

export const focusedSequenceSchema = z.object({
  title: z.string().trim().min(1).max(100),
  slides: z.array(SequenceSlideOpenUI.ref).min(2).max(12),
}).strict();

type Element = { type?: string; typeName?: string; props?: Record<string, unknown> };

export function focusedSequenceIssue(value: unknown): string | null {
  const props = value as { title?: unknown; slides?: unknown };
  if (!props || typeof props.title !== "string" || !props.title.trim() || !Array.isArray(props.slides) ||
      props.slides.length < 2 || props.slides.length > 12) return "FocusedSequence needs a title and 2-12 SequenceSlide entries.";
  let previousScene = "";
  let previousText = "";
  for (const [index, slide] of props.slides.entries()) {
    if (!slide || slide.typeName !== "SequenceSlide" || typeof slide.props?.title !== "string" || !Array.isArray(slide.props.children)) {
      return `FocusedSequence stage ${index + 1} needs a titled SequenceSlide.`;
    }
    const children = slide.props.children as Element[];
    const scene = children.find((child) => child.typeName === "PaletteScene" || child.typeName === "Scene");
    const explanation = children.find((child) => child.typeName === "TextContent");
    if (!scene || !explanation) return `FocusedSequence stage ${index + 1} needs a Scene or PaletteScene and TextContent.`;
    const sceneSignature = JSON.stringify(scene.props);
    const textSignature = JSON.stringify(explanation.props);
    if (index && sceneSignature === previousScene) return `FocusedSequence stage ${index + 1} repeats the previous illustration.`;
    if (index && textSignature === previousText) return `FocusedSequence stage ${index + 1} repeats the previous explanation.`;
    previousScene = sceneSignature;
    previousText = textSignature;
  }
  return null;
}
