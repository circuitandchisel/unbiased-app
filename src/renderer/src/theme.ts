// Original Unbiased palettes. The existing themeV1 storage/import shape remains supported.
export type ThemeProfileId = "ember" | "chalk" | "tide" | "grove" | "dune" | "vesper";
export type ThemePalette = {
  sidebar: string; panel: string; inset: string; raised: string; border: string; muted: string;
  link: string; success: string; warning: string; error: string; info: string;
  codeComment: string; codeString: string; codeKeyword: string; codeFunction: string; codeNumber: string;
};
export type ThemeConfig = {
  accent: string; surface: string; ink: string; contrast: number;
  fonts: { ui: string; code: string };
  profile?: ThemeProfileId | "custom";
  palette?: ThemePalette;
};
export type ThemeProfile = {
  id: ThemeProfileId; name: string; mode: "light" | "dark"; description: string;
  accent: string; surface: string; ink: string; palette: ThemePalette;
};
export const DEFAULT_FONTS = { ui: "Geist, Inter", code: '"Geist Mono", ui-monospace, "SFMono-Regular"' };
export const THEME_PROFILES: readonly ThemeProfile[] = [
  {
    "id": "ember",
    "name": "Ember",
    "mode": "dark",
    "description": "Unbiased charcoal \u00b7 Signature coral",
    "accent": "#FF563F",
    "surface": "#111111",
    "ink": "#FCFCFC",
    "palette": {
      "sidebar": "#1D1D1D",
      "panel": "#1D1D1D",
      "inset": "#262626",
      "raised": "#262626",
      "border": "#383838",
      "muted": "#B1B1B1",
      "link": "#FF7764",
      "success": "#8BC6A1",
      "warning": "#E4BE7B",
      "error": "#F29797",
      "info": "#8EBDF0",
      "codeComment": "#B1B1B1",
      "codeString": "#8BC6A1",
      "codeKeyword": "#FF563F",
      "codeFunction": "#FF7764",
      "codeNumber": "#E4BE7B"
    }
  },
  {
    "id": "chalk",
    "name": "Chalk",
    "mode": "light",
    "description": "Cool white \u00b7 Graphite \u00b7 Brick coral",
    "accent": "#B83E2D",
    "surface": "#F6F7F9",
    "ink": "#222831",
    "palette": {
      "sidebar": "#EEF0F3",
      "panel": "#FFFFFF",
      "inset": "#E6E9EE",
      "raised": "#E6E9EE",
      "border": "#C3CAD4",
      "muted": "#56616E",
      "link": "#B83E2D",
      "success": "#216E47",
      "warning": "#744D08",
      "error": "#A1323C",
      "info": "#285F9A",
      "codeComment": "#56616E",
      "codeString": "#216E47",
      "codeKeyword": "#B83E2D",
      "codeFunction": "#B83E2D",
      "codeNumber": "#744D08"
    }
  },
  {
    "id": "tide",
    "name": "Tide",
    "mode": "dark",
    "description": "Deep blue \u00b7 Mist text \u00b7 Sea-glass accents",
    "accent": "#73D1D2",
    "surface": "#111B23",
    "ink": "#E3EEF3",
    "palette": {
      "sidebar": "#15232D",
      "panel": "#1B2C37",
      "inset": "#213541",
      "raised": "#213541",
      "border": "#3F5969",
      "muted": "#A4B9C5",
      "link": "#FF7764",
      "success": "#9DCAA5",
      "warning": "#E4BE7B",
      "error": "#F29797",
      "info": "#8EBDF0",
      "codeComment": "#A4B9C5",
      "codeString": "#9DCAA5",
      "codeKeyword": "#73D1D2",
      "codeFunction": "#FF7764",
      "codeNumber": "#E4BE7B"
    }
  },
  {
    "id": "grove",
    "name": "Grove",
    "mode": "dark",
    "description": "Forest slate \u00b7 Soft ivory \u00b7 Sage accents",
    "accent": "#B7CE8A",
    "surface": "#151C19",
    "ink": "#E6EEE4",
    "palette": {
      "sidebar": "#1A2520",
      "panel": "#213028",
      "inset": "#27372D",
      "raised": "#27372D",
      "border": "#4A6051",
      "muted": "#B2C2AE",
      "link": "#FF7764",
      "success": "#8EC8A0",
      "warning": "#E4BE7B",
      "error": "#F29797",
      "info": "#8EBDF0",
      "codeComment": "#B2C2AE",
      "codeString": "#8EC8A0",
      "codeKeyword": "#B7CE8A",
      "codeFunction": "#FF7764",
      "codeNumber": "#E4BE7B"
    }
  },
  {
    "id": "dune",
    "name": "Dune",
    "mode": "light",
    "description": "Warm paper \u00b7 Cocoa text \u00b7 Terracotta accents",
    "accent": "#8B482F",
    "surface": "#F4EEE3",
    "ink": "#352D26",
    "palette": {
      "sidebar": "#EBE0CE",
      "panel": "#FFF9F0",
      "inset": "#E7D7C0",
      "raised": "#E7D7C0",
      "border": "#BEAA91",
      "muted": "#695949",
      "link": "#A03E2D",
      "success": "#32613C",
      "warning": "#744D08",
      "error": "#A1323C",
      "info": "#285F9A",
      "codeComment": "#695949",
      "codeString": "#32613C",
      "codeKeyword": "#8B482F",
      "codeFunction": "#A03E2D",
      "codeNumber": "#744D08"
    }
  },
  {
    "id": "vesper",
    "name": "Vesper",
    "mode": "dark",
    "description": "Plum charcoal \u00b7 Pearl text \u00b7 Lilac accents",
    "accent": "#C9AEEC",
    "surface": "#1A1721",
    "ink": "#F0E9F6",
    "palette": {
      "sidebar": "#211C2B",
      "panel": "#2A2336",
      "inset": "#362D44",
      "raised": "#362D44",
      "border": "#5B4D6B",
      "muted": "#BAACC9",
      "link": "#FF7764",
      "success": "#9ECDB1",
      "warning": "#E4BE7B",
      "error": "#F29797",
      "info": "#8EBDF0",
      "codeComment": "#BAACC9",
      "codeString": "#9ECDB1",
      "codeKeyword": "#C9AEEC",
      "codeFunction": "#FF7764",
      "codeNumber": "#E4BE7B"
    }
  }
];

export function themeForProfile(id: ThemeProfileId, fonts = DEFAULT_FONTS): ThemeConfig {
  const profile = THEME_PROFILES.find(profile => profile.id === id);
  if (!profile) throw new Error("Unknown theme profile");
  return { profile: id, accent: profile.accent, surface: profile.surface, ink: profile.ink, contrast: 50, fonts: { ...fonts }, palette: { ...profile.palette } };
}

export const DEFAULT_THEME = themeForProfile("ember");

export function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixHex(a: string, b: string, t: number): string {
  const first = hexToRgb(a) ?? [17, 17, 17];
  const second = hexToRgb(b) ?? [252, 252, 252];
  return "#" + first.map((value, i) => Math.round(value + (second[i] - value) * Math.max(0, Math.min(t, 1))).toString(16).padStart(2, "0")).join("");
}

function luminance(hex: string): number {
  const [r, g, b] = (hexToRgb(hex) ?? [0, 0, 0]).map(value => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  return (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
}

function bestInkOn(fill: string): string {
  return contrastRatio("#111111", fill) >= contrastRatio("#ffffff", fill) ? "#111111" : "#ffffff";
}

export function themeMode(theme: ThemeConfig): "light" | "dark" {
  return luminance(theme.surface) > luminance(theme.ink) ? "light" : "dark";
}

export function selectedThemeProfile(theme: ThemeConfig): ThemeProfile | null {
  return THEME_PROFILES.find(profile => profile.id === theme.profile && profile.accent === theme.accent && profile.surface === theme.surface && profile.ink === theme.ink && theme.contrast === 50 && (Object.keys(profile.palette) as (keyof ThemePalette)[]).every(key => theme.palette?.[key] === profile.palette[key])) ?? null;
}

/** Font preferences are independent; editing colors makes a custom profile. */
export function customizeTheme(theme: ThemeConfig, patch: Partial<Omit<ThemeConfig, "palette" | "profile">>): ThemeConfig {
  const colorsChanged = patch.accent !== undefined || patch.surface !== undefined || patch.ink !== undefined || patch.contrast !== undefined;
  const deriveSurfaces = patch.surface !== undefined || patch.ink !== undefined || patch.contrast !== undefined;
  return { ...theme, ...patch, fonts: { ...(patch.fonts ?? theme.fonts) }, ...(colorsChanged ? { profile: "custom" as const } : {}), ...(deriveSurfaces ? { palette: undefined } : {}) };
}

export function themeVars(theme: ThemeConfig): Record<string, string> {
  const light = themeMode(theme) === "light";
  const mix = (step: number) => mixHex(theme.surface, theme.ink, Math.min(step * Math.max(theme.contrast, 5) / 50, 1));
  const p = theme.palette;
  return {
    "--bg": theme.surface, "--fg": theme.ink, "--accent": theme.accent, "--accent-fg": bestInkOn(theme.accent),
    "--link": p?.link ?? (light ? "#B83E2D" : "#FF7764"),
    "--nav-bg": p?.sidebar ?? mix(0.05), "--panel": p?.panel ?? mix(0.05), "--panel-2": p?.inset ?? mix(0.09),
    "--chip": p?.inset ?? mix(0.09), "--chip-raised": p?.raised ?? mix(0.17), "--border": p?.border ?? mix(0.095),
    "--dim": p?.muted ?? mixHex(theme.surface, theme.ink, 0.62),
    "--fg-soft": mixHex(theme.surface, theme.ink, 0.88), "--fg-msg": mixHex(theme.surface, theme.ink, 0.94), "--gutter": mix(0.25),
    "--ok": p?.success ?? (light ? "#216E47" : "#8BC6A1"), "--err": p?.error ?? (light ? "#A1323C" : "#F29797"),
    "--amber": p?.warning ?? (light ? "#744D08" : "#E4BE7B"), "--info": p?.info ?? (light ? "#285F9A" : "#8EBDF0"),
    "--violet": light ? "#714292" : "#C9AEEC", "--cyan": light ? "#246D73" : "#73D1D2",
    "--code-bg": p?.panel ?? (light ? mix(0.04) : mixHex(theme.surface, "#000000", 0.3)), "--code-fg": theme.ink,
    "--code-comment": p?.codeComment ?? mix(0.65), "--code-string": p?.codeString ?? (light ? "#216E47" : "#8BC6A1"),
    "--code-keyword": p?.codeKeyword ?? theme.accent, "--code-function": p?.codeFunction ?? (light ? "#285F9A" : "#8EBDF0"),
    "--code-number": p?.codeNumber ?? (light ? "#744D08" : "#E4BE7B"),
    "--accent-tint": light ? "8%" : "14%", "--color-scheme": light ? "light" : "dark",
    "--font-ui": `${theme.fonts.ui}, -apple-system, system-ui, sans-serif`, "--font-code": `${theme.fonts.code}, ui-monospace, Menlo, monospace`,
    colorScheme: light ? "light" : "dark",
  };
}

function decodeTheme(value: unknown): ThemeConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const result: ThemeConfig = { ...DEFAULT_THEME, fonts: { ...DEFAULT_FONTS }, profile: "custom", palette: undefined };
  for (const key of ["accent", "surface", "ink"] as const) {
    if (raw[key] !== undefined) {
      if (typeof raw[key] !== "string" || !hexToRgb(raw[key])) return null;
      result[key] = raw[key].trim();
    }
  }
  if (raw.contrast !== undefined) {
    if (typeof raw.contrast !== "number" || !Number.isFinite(raw.contrast)) return null;
    result.contrast = Math.max(10, Math.min(100, raw.contrast));
  }
  if (raw.fonts !== undefined) {
    if (!raw.fonts || typeof raw.fonts !== "object" || Array.isArray(raw.fonts)) return null;
    for (const key of ["ui", "code"] as const) {
      const font = (raw.fonts as Record<string, unknown>)[key];
      if (font !== undefined) {
        if (typeof font !== "string" || !font.trim() || font.length > 300) return null;
        result.fonts[key] = font;
      }
    }
  }
  if (raw.palette !== undefined) {
    if (!raw.palette || typeof raw.palette !== "object" || Array.isArray(raw.palette)) return null;
    const palette = {} as ThemePalette;
    for (const key of Object.keys(DEFAULT_THEME.palette!) as (keyof ThemePalette)[]) {
      const color = (raw.palette as Record<string, unknown>)[key];
      if (typeof color !== "string" || !hexToRgb(color)) return null;
      palette[key] = color.trim();
    }
    result.palette = palette;
  }
  if (THEME_PROFILES.some(profile => profile.id === raw.profile)) result.profile = raw.profile as ThemeProfileId;
  if (!selectedThemeProfile(result)) result.profile = "custom";
  return result;
}

export function parseThemeImport(text: string): ThemeConfig | null {
  try {
    const parsed = JSON.parse(text.trim().replace(/^(?:codex|unbiased)-theme-v1:/, ""));
    return decodeTheme(parsed?.theme ?? parsed);
  } catch { return null; }
}

export function loadTheme(storage: Pick<Storage, "getItem"> = localStorage): ThemeConfig {
  try { return parseThemeImport(storage.getItem("themeV1") ?? "") ?? themeForProfile("ember"); }
  catch { return themeForProfile("ember"); }
}

export function saveTheme(theme: ThemeConfig, storage: Pick<Storage, "setItem"> = localStorage): void {
  storage.setItem("themeV1", JSON.stringify(theme));
}

export const THEME_CHANGE_EVENT = "unbiased:themechange";

/** Also publish to the document for portals, native controls and canvas renderers. */
export function applyDocumentTheme(theme: ThemeConfig): void {
  const vars = themeVars(theme);
  for (const [key, value] of Object.entries(vars)) {
    if (key.startsWith("--")) document.documentElement.style.setProperty(key, value);
  }
  document.documentElement.style.colorScheme = themeMode(theme);
  document.documentElement.dataset.themeProfile = selectedThemeProfile(theme)?.id ?? "custom";
  document.body.style.background = theme.surface;
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}
