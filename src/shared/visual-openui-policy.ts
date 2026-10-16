export const OPENUI_QUERY_TOOLS = ["visual_current_time", "visual_read_clipboard_text", "visual_pick_text_file"] as const;
export const OPENUI_MUTATION_TOOLS = ["visual_copy_text", "visual_save_text"] as const;

export const MAX_VISUAL_FILE_BYTES = 64 * 1024;

export function visualExportName(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 80 || !/^[\w .()-]+\.(?:txt|csv|json)$/i.test(value) ||
      value.trim() !== value || value.startsWith(".")) return null;
  return value;
}

export function approvedVisualUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function boundedVisualText(value: unknown, limit = 2000): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= limit ? value : null;
}

export function approvedVisualImage(value: unknown): boolean {
  return typeof value === "string" && value.length <= 180_000 &&
    /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/]+={0,2}$/i.test(value);
}
