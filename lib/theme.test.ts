import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { parseThemePreference, resolveTheme, themeCookie, THEME_COOKIE, themePrefAttribute } from "./theme"

describe("workspace theme", () => {
  it("defaults to light; dark and match-device are explicit choices", () => {
    expect(parseThemePreference("dark")).toBe("dark")
    expect(parseThemePreference("system")).toBe("system")
    for (const value of [null, undefined, "", "light", "DARK", 1]) expect(parseThemePreference(value)).toBe("light")
  })

  it("resolves system from the device and keeps explicit choices", () => {
    expect(resolveTheme("system", true)).toBe("dark")
    expect(resolveTheme("system", false)).toBe("light")
    expect(resolveTheme("light", true)).toBe("light")
    expect(resolveTheme("dark", false)).toBe("dark")
  })

  it("writes a site-wide, same-site cookie and renders no attribute for the light default", () => {
    expect(themeCookie("dark")).toBe(`${THEME_COOKIE}=dark; Path=/; Max-Age=31536000; SameSite=Lax`)
    expect(themePrefAttribute(undefined)).toBeUndefined()
    expect(themePrefAttribute("light")).toBeUndefined()
    expect(themePrefAttribute("<script>")).toBeUndefined()
    expect(themePrefAttribute("dark")).toBe("dark")
    expect(themePrefAttribute("system")).toBe("system")
  })

  it("applies a saved dark choice before hydration only inside the workspace, and with no inline script", () => {
    const tokens = readFileSync(`${process.cwd()}/app/styles/tokens.css`, "utf8")
    expect(tokens).toContain(':root[data-theme-pref="dark"]:not([data-theme]):has([data-theme-scope])')
    const layout = readFileSync(`${process.cwd()}/app/[locale]/owner/[workspaceSlug]/layout.tsx`, "utf8")
    expect(layout).not.toMatch(/<script|dangerouslySetInnerHTML/)
  })
})
