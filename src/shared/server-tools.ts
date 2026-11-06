export const SERVER_TOOL_NAMES = ["web_search", "image_generation"] as const;
export type ServerToolName = typeof SERVER_TOOL_NAMES[number];
export type ServerToolCapabilities = Record<ServerToolName, boolean>;
export const NO_SERVER_TOOLS: ServerToolCapabilities = { web_search: false, image_generation: false };

/** Match Chat's authenticated whoami / subscription-or-organization-grant gate. */
export function serverToolCapabilities(value: unknown): ServerToolCapabilities {
  const identity = value as {
    ok?: unknown; accessStatus?: unknown; accountType?: unknown; keyName?: unknown;
    organization?: { id?: unknown; name?: unknown }; workload?: { id?: unknown; name?: unknown };
    chatEligibility?: { allowed?: unknown; reason?: unknown };
  } | null;
  const text = (field: unknown): boolean => typeof field === "string" && field.trim().length > 0;
  const validIdentity = identity?.ok === true && identity.accessStatus === "granted"
    && text(identity.organization?.id) && text(identity.organization?.name)
    && text(identity.workload?.id) && text(identity.workload?.name) && text(identity.keyName);
  const entitlement = identity?.chatEligibility;
  const allowed = validIdentity && entitlement?.allowed === true
    && (entitlement.reason === "organization_grant"
      || (identity?.accountType === "personal" && entitlement.reason === "eligible"));
  return { web_search: allowed, image_generation: allowed };
}

export function serverToolDirective(tool: ServerToolName): string {
  return tool === "web_search"
    ? "The user selected Web Search for this request. Use the web_search server tool for current information and cite its sources. Do not substitute local browser tools or claim to search without a successful tool result."
    : "The user selected Create image for this request. Use the image_generation server tool with a complete description of the requested image. Its result is attached to this chat automatically; do not substitute an HTML visual or claim generation without a successful result.";
}
