export const SERVER_TOOL_NAMES = ["web_search", "image_generation"] as const;
export type ServerToolName = typeof SERVER_TOOL_NAMES[number];
export type ServerToolCapabilities = Record<ServerToolName, boolean>;
export const NO_SERVER_TOOLS: ServerToolCapabilities = { web_search: false, image_generation: false };

export function serverToolCapabilities(value: unknown): ServerToolCapabilities {
  const tools = value && typeof value === "object" ? (value as { tools?: Record<string, { allowed?: unknown }> }).tools : undefined;
  return { web_search: tools?.web_search?.allowed === true, image_generation: tools?.image_generation?.allowed === true };
}

export function serverToolDirective(tool: ServerToolName): string {
  return tool === "web_search"
    ? "The user selected Web Search for this request. Use the web_search server tool for current information and cite its sources. Do not substitute local browser tools or claim to search without a successful tool result."
    : "The user selected Create image for this request. Use the image_generation server tool with a complete description of the requested image. Its result is attached to this chat automatically; do not substitute an HTML visual or claim generation without a successful result.";
}
