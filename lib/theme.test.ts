import { describe, expect, it } from "vitest"

import { parseThemePreference, resolveTheme, themeBootScript, THEME_STORAGE_KEY } from "./theme"

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

  it("boot script reads the same storage key and survives blocked storage", () => {
    expect(themeBootScript).toContain(JSON.stringify(THEME_STORAGE_KEY))
    const html = { dataset: {} as Record<string, string> }
    const run = new Function("localStorage", "window", "document", themeBootScript)
    run({ getItem: () => { throw new Error("blocked") } }, { matchMedia: () => ({ matches: true }) }, { documentElement: html })
    expect(html.dataset.theme).toBe("light")
    run({ getItem: () => null }, { matchMedia: () => ({ matches: true }) }, { documentElement: html })
    expect(html.dataset.theme).toBe("light")
    run({ getItem: () => "system" }, { matchMedia: () => ({ matches: true }) }, { documentElement: html })
    expect(html.dataset.theme).toBe("dark")
    run({ getItem: () => "dark" }, { matchMedia: () => ({ matches: false }) }, { documentElement: html })
    expect(html.dataset.theme).toBe("dark")
  })
})
