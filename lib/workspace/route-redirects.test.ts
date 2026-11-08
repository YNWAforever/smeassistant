import { describe, expect, it } from "vitest"

import { resolveWorkspaceRedirect } from "./route-redirects"

const base = "/zh-HK/owner/kam-man-house"
const on = { OFFER_PROMOTIONS_ENABLED: "true" }
const off = {}

describe("resolveWorkspaceRedirect", () => {
  it.each([
    ["/create", "", "/actions/new"],
    ["/calendar", "", "/actions?view=due"],
    ["/assets", "", "/business/assets"],
    ["/settings/brand", "", "/business/profile"],
    ["/settings/integrations", "", "/business/integrations"],
    ["/settings/billing", "", "/settings/plan"],
    ["/activity", "", "/settings/activity"],
    ["/more", "", "/settings"],
  ])("moves %s", (from, search, to) => {
    expect(resolveWorkspaceRedirect(`${base}${from}`, search, off)).toBe(`${base}${to}`)
  })

  it("keeps every query parameter, including location and return markers", () => {
    expect(resolveWorkspaceRedirect(`${base}/settings/billing`, "?checkout=success&location=all", off)).toBe(`${base}/settings/plan?checkout=success&location=all`)
    expect(resolveWorkspaceRedirect(`${base}/settings/integrations`, "?google=connected", off)).toBe(`${base}/business/integrations?google=connected`)
    expect(resolveWorkspaceRedirect(`${base}/calendar`, "?location=tin-hau", off)).toBe(`${base}/actions?location=tin-hau&view=due`)
  })

  it("does not overwrite a view the link already chose", () => {
    expect(resolveWorkspaceRedirect(`${base}/calendar`, "?view=list", off)).toBe(`${base}/actions?view=list`)
  })

  it("moves Offers only while its flag is on, so the page stays a 404 when off", () => {
    expect(resolveWorkspaceRedirect(`${base}/offers`, "?location=all", on)).toBe(`${base}/actions/new?location=all&mode=offer`)
    expect(resolveWorkspaceRedirect(`${base}/offers`, "", off)).toBeNull()
  })

  it("leaves current routes, deeper paths, owner pages and non-workspace paths alone", () => {
    for (const path of [base, `${base}/actions`, `${base}/actions/abc`, `${base}/insights`, `${base}/settings/team`, `${base}/settings/notifications`, `${base}/assets/abc/preview`, `${base}/packs/p1`, "/zh-HK/owner/select-workspace", "/zh-HK/owner/onboarding", "/zh-HK/owner/sign-in", "/zh-HK/scan", "/xx/owner/ws/create"]) {
      expect(resolveWorkspaceRedirect(path, "", on)).toBeNull()
    }
  })
})
