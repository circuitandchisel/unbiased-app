import type { CSSProperties } from "react";

const fallback = {
  "--panel": "#202020",
  "--panel-2": "#292929",
  "--border": "#383838",
  "--fg-msg": "#e5e5e5",
  "--dim": "#aaaaaa",
  "--accent": "#ff5546",
};

export function visualApprovalTheme(host: Element | null): CSSProperties {
  const computed = host ? getComputedStyle(host) : null;
  const vars = Object.fromEntries(Object.entries(fallback).map(([key, value]) =>
    [key, computed?.getPropertyValue(key).trim() || value]));
  return { ...vars, fontFamily: computed?.fontFamily || "system-ui, sans-serif" } as CSSProperties;
}
