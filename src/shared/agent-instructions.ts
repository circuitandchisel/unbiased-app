export type AgentInstructions = {
  path: string;
  content: string;
  revision: string | null;
};

export type SaveAgentInstructions = { content: string; expectedRevision: string | null };
export type AgentInstructionsSaveResult =
  | { ok: true; document: AgentInstructions }
  | { ok: false; conflict: boolean; error: string };

export const AGENT_INSTRUCTIONS_MAX_BYTES = 64 * 1024;
