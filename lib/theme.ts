/**
 * Workspace colour theme (CLAUDE.md 2026-10-19: dark mode is workspace-only,
 * following the device with a light/dark/system switch). The preference is a
 * per-browser convenience in localStorage; nothing is stored server-side.
 * Public pages never set `html[data-theme]`, so they always render light.
 */
export const THEME_STORAGE_KEY = "kinnso-theme"

export const themePreferences = ["system", "light", "dark"] as const
export type ThemePreference = (typeof themePreferences)[number]
export type ResolvedTheme = "light" | "dark"

export function parseThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system"
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === "system") return prefersDark ? "dark" : "light"
  return preference
}

/**
 * Runs before first paint on a full workspace load so a dark-mode owner never
 * sees a light flash. Storage can throw (private mode, blocked site data); the
 * device setting is then used.
 */
export const themeBootScript = `(function(){try{var p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});}catch(e){p=null}var d=p==="dark"||(p!=="light"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";})();`
