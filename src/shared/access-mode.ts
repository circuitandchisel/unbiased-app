export type AccessMode = "ask" | "auto" | "full";

export function isAccessMode(value: unknown): value is AccessMode {
  return value === "ask" || value === "auto" || value === "full";
}

export type AccessModesSnapshot = { defaultMode: AccessMode; threads: Record<string, AccessMode> };
