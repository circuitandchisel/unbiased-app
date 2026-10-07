import { z } from "zod";

export const MAX_MERMAID_LENGTH = 16_000;

export const mermaidDiagramSchema = z.object({
  title: z.string().max(120).optional(),
  diagram: z.string().trim().min(1).max(MAX_MERMAID_LENGTH),
}).strict();
