import { useEffect, useState, type CSSProperties } from "react";
import { Check } from "lucide-react";
import { selectedThemeProfile, THEME_PROFILES, themeForProfile, type ThemeConfig } from "./theme";
import "./theme-profiles.css";

export function ThemeProfiles({ theme, onChange }: { theme: ThemeConfig; onChange: (theme: ThemeConfig) => void }) {
  const selected = selectedThemeProfile(theme);
  return <div className="u-theme-profiles">
    <div className="u-theme-profile-grid" role="group" aria-label="Theme profiles">
      {THEME_PROFILES.map(profile => <button
        key={profile.id} type="button" className="u-theme-profile" aria-label={`${profile.name}, ${profile.mode} theme`}
        aria-pressed={selected?.id === profile.id} onClick={() => onChange(themeForProfile(profile.id, theme.fonts))}
      >
        <span className="u-theme-profile-label"><span>{profile.name}</span><span className="u-theme-profile-mode">{profile.mode === "dark" ? "Dark" : "Light"}{selected?.id === profile.id && <Check size={13} aria-hidden="true" />}</span></span>
        <span className="u-theme-profile-sample" aria-hidden="true" style={{
          "--sample-bg": profile.surface, "--sample-sidebar": profile.palette.sidebar, "--sample-panel": profile.palette.panel,
          "--sample-raised": profile.palette.inset, "--sample-text": profile.ink, "--sample-accent": profile.accent, "--sample-border": profile.palette.border,
        } as CSSProperties}>
          <span className="u-theme-sample-sidebar"><i /><i /><i /></span>
          <span className="u-theme-sample-chat"><i /><i /><i /><span className="u-theme-sample-composer" /></span>
        </span>
      </button>)}
    </div>
    <div className="u-theme-profile-description" aria-live="polite"><strong>{selected?.name ?? "Custom theme"}</strong><span>{selected?.description ?? "Your custom colors and typography"}</span></div>
  </div>;
}

/** Keep incomplete hex edits local so saved themes always contain valid colors. */
export function ThemeColorRow({ label, value, set, rowStyle, inputStyle }: {
  label: string; value: string; set: (value: string) => void;
  rowStyle: CSSProperties; inputStyle: CSSProperties;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const valid = /^#[0-9a-f]{6}$/i.test(draft);
  return <div style={rowStyle}>
    <span>{label}</span>
    <span style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-end" }}>
      <input type="color" value={value} onChange={e => set(e.target.value)} aria-label={`${label} colour`}
        style={{ width: 26, height: 26, border: "1px solid var(--border)", borderRadius: 7, background: "transparent", padding: 2, cursor: "pointer", flexShrink: 0 }} />
      <input value={draft} aria-label={`${label} hex color`} aria-invalid={!valid} spellCheck={false}
        onChange={e => { const next = e.target.value; setDraft(next); if (/^#[0-9a-f]{6}$/i.test(next)) set(next); }}
        onBlur={() => { if (!valid) setDraft(value); }}
        style={{ ...inputStyle, flex: "0 0 110px", maxWidth: 110 }} />
    </span>
  </div>;
}
