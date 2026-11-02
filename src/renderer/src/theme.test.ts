import assert from "node:assert/strict";
import test from "node:test";
import { contrastRatio, customizeTheme, DEFAULT_THEME, loadTheme, mixHex, parseThemeImport, saveTheme, selectedThemeProfile, THEME_PROFILES, themeForProfile, themeMode, themeVars } from "./theme";

test("six original profiles cover light/dark and keep text, links and statuses readable", () => {
  assert.deepEqual(THEME_PROFILES.map(profile => profile.id), ["ember", "chalk", "tide", "grove", "dune", "vesper"]);
  for (const profile of THEME_PROFILES) {
    const theme = themeForProfile(profile.id);
    const vars = themeVars(theme);
    assert.equal(themeMode(theme), profile.mode);
    assert.equal(selectedThemeProfile(theme)?.id, profile.id);
    for (const fg of ["--fg", "--dim", "--link", "--ok", "--err", "--amber", "--info"]) {
      for (const bg of ["--bg", "--panel", "--panel-2", "--nav-bg", "--chip-raised"]) {
        assert.ok(contrastRatio(vars[fg], vars[bg]) >= 4.5, `${profile.id}: ${fg} on ${bg}`);
      }
    }
    for (const token of ["--code-fg", "--code-comment", "--code-string", "--code-keyword", "--code-function", "--code-number"]) {
      assert.ok(contrastRatio(vars[token], vars["--code-bg"]) >= 4.5, `${profile.id}: ${token}`);
    }
    assert.ok(contrastRatio(vars["--accent"], mixHex(theme.surface, theme.accent, profile.mode === "dark" ? 0.14 : 0.08)) >= 4.5, `${profile.id}: primary pill`);
    assert.ok(contrastRatio(vars["--accent"], vars["--accent-fg"]) >= 4.5, `${profile.id}: filled accent`);
  }
});

test("legacy themeV1 colors, fonts and contrast survive loading and saving", () => {
  const legacy = { accent: "#DDAA44", surface: "#202530", ink: "#ECEFF4", contrast: 41, fonts: { ui: "system-ui", code: "Menlo" } };
  const values = new Map<string, string>([["themeV1", JSON.stringify(legacy)]]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const loaded = loadTheme(storage);
  for (const key of ["accent", "surface", "ink", "contrast", "fonts"] as const) assert.deepEqual(loaded[key], legacy[key]);
  assert.equal(selectedThemeProfile(loaded), null);
  saveTheme(loaded, storage);
  assert.deepEqual(loadTheme(storage), loaded);
});

test("profile selection preserves font preferences and persists its full palette", () => {
  const fonts = { ui: "Custom UI", code: "Custom Mono" };
  const theme = themeForProfile("dune", fonts);
  assert.deepEqual(theme.fonts, fonts);
  const restored = parseThemeImport(JSON.stringify(theme));
  assert.deepEqual(restored, theme);
  assert.equal(selectedThemeProfile(restored!)?.id, "dune");
  theme.palette!.panel = "#000000";
  assert.notEqual(themeForProfile("dune").palette!.panel, theme.palette!.panel, "editing a copy must not mutate presets");
});

test("customization cannot leave a misleading selected profile or stale surface palette", () => {
  const preset = themeForProfile("tide");
  const fontChange = customizeTheme(preset, { fonts: { ...preset.fonts, code: "Menlo" } });
  assert.equal(selectedThemeProfile(fontChange)?.id, "tide");
  const accentChange = customizeTheme(preset, { accent: "#CC88FF" });
  assert.equal(selectedThemeProfile(accentChange), null);
  assert.deepEqual(accentChange.palette, preset.palette);
  const surfaceChange = customizeTheme(preset, { surface: "#F7F7F7", ink: "#222222" });
  assert.equal(surfaceChange.palette, undefined);
  assert.equal(themeMode(surfaceChange), "light");
  assert.equal(themeVars(surfaceChange)["--bg"], "#F7F7F7");
  assert.equal(customizeTheme(preset, { contrast: 60 }).palette, undefined);
});

test("existing Codex imports still work; malformed saved/imported values fail safely", () => {
  const legacy = { theme: { accent: "#445566", surface: "#FFFFFF", ink: "#111111", contrast: 300 } };
  const imported = parseThemeImport("codex-theme-v1:" + JSON.stringify(legacy));
  assert.equal(imported?.accent, "#445566");
  assert.equal(imported?.contrast, 100);
  assert.equal(themeMode(imported!), "light");
  for (const invalid of ["null", "[]", "bad", '{"accent":"url(bad)"}', '{"contrast":"high"}', '{"fonts":null}', '{"palette":{}}']) {
    assert.equal(parseThemeImport(invalid), null);
    assert.deepEqual(loadTheme({ getItem: () => invalid }), DEFAULT_THEME);
  }
  const stale = parseThemeImport(JSON.stringify({ ...themeForProfile("chalk"), surface: "#111111" }));
  assert.equal(selectedThemeProfile(stale!), null);
  assert.deepEqual(loadTheme({ getItem: () => { throw new Error("unavailable"); } }), DEFAULT_THEME);
});
