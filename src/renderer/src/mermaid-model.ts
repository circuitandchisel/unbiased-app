import { z } from "zod/v4";

export const MAX_MERMAID_LENGTH = 16_000;

export const mermaidDiagramSchema = z.object({
  diagram: z.string().trim().min(1).max(MAX_MERMAID_LENGTH),
  title: z.string().max(120).optional(),
}).strict();
