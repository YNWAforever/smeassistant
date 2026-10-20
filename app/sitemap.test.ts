import { describe, expect, it } from "vitest"
import { servedLocales } from "@sme-scanner/region"

import sitemap from "@/app/sitemap"

describe("sitemap", () => {
  const entries = sitemap()

  it("lists every public path once per served locale", () => {
    const urls = entries.map((entry) => new URL(entry.url).pathname)
    for (const locale of servedLocales) {
      expect(urls).toContain(`/${locale}`)
      expect(urls).toContain(`/${locale}/pricing`)
    }
    expect(new Set(urls).size).toBe(urls.length)
  })

  it("gives each entry every language version and an x-default", () => {
    for (const entry of entries) {
      const languages = entry.alternates?.languages as Record<string, string>
      expect(Object.keys(languages).sort()).toEqual([...servedLocales, "x-default"].sort())
      expect(Object.values(languages)).toContain(entry.url)
      expect(new URL(languages["x-default"]).pathname.startsWith(`/${servedLocales[0]}`)).toBe(true)
    }
  })

  it("never lists owner or report pages", () => {
    expect(entries.some((entry) => /\/owner\/|\/r\//.test(entry.url))).toBe(false)
  })
})
