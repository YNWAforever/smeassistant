import { describe, expect, it } from "vitest"

import { parseThemePreference, resolveTheme, themeBootScript, THEME_STORAGE_KEY } from "./theme"

describe("workspace theme", () => {
  it("accepts only light or dark as an explicit choice; anything else follows the device", () => {
    expect(parseThemePreference("light")).toBe("light")
    expect(parseThemePreference("dark")).toBe("dark")
    for (const value of [null, undefined, "", "system", "DARK", 1]) expect(parseThemePreference(value)).toBe("system")
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
    expect(html.dataset.theme).toBe("dark")
    run({ getItem: () => "light" }, { matchMedia: () => ({ matches: true }) }, { documentElement: html })
    expect(html.dataset.theme).toBe("light")
  })
})
