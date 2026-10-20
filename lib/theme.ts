/**
 * Workspace colour theme (CLAUDE.md 2026-10-19: dark mode is workspace-only;
 * decided 2026-10-20: light by default, with a light/dark/match-device
 * switch). The choice is a per-browser convenience kept in a cookie so the
 * server can render it before first paint, with no inline script and no
 * hydration mismatch:
 *
 * - the root layout renders the saved choice as `html[data-theme-pref]`;
 * - tokens.css applies dark only while a workspace marker
 *   (`[data-theme-scope]`) is on the page, so public pages stay light;
 * - after hydration WorkspaceTheme sets the resolved `html[data-theme]`,
 *   which wins, and removes it on the way out of the workspace.
 *
 * "Match device" is resolved on the client, so a device in dark mode sees
 * the light theme until hydration on a full page load.
 */
export const THEME_COOKIE = "kinnso-theme"

export const themePreferences = ["system", "light", "dark"] as const
export type ThemePreference = (typeof themePreferences)[number]
export type ResolvedTheme = "light" | "dark"

export function parseThemePreference(value: unknown): ThemePreference {
  return value === "dark" || value === "system" ? value : "light"
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === "system") return prefersDark ? "dark" : "light"
  return preference
}

/** The cookie the switch writes: one year, whole site, never sent cross-site. */
export function themeCookie(preference: ThemePreference): string {
  return `${THEME_COOKIE}=${preference}; Path=/; Max-Age=31536000; SameSite=Lax`
}

/** `html[data-theme-pref]` for the root layout; light (the default) renders no attribute. */
export function themePrefAttribute(cookieValue: string | undefined): Exclude<ThemePreference, "light"> | undefined {
  const preference = parseThemePreference(cookieValue)
  return preference === "light" ? undefined : preference
}
