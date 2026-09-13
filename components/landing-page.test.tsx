// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en",
  useSearchParams: () => new URLSearchParams(),
}))

import { LandingPage } from "@/components/landing-page"

function markup(locale: "en" | "zh-HK" | "zh-TW" = "en") {
  const root = document.createElement("div")
  root.innerHTML = renderToStaticMarkup(<LandingPage locale={locale} market="hk" />)
  return root
}

/**
 * P2.5 item 8: three outcome examples, each linking into the scan with an
 * `intent` matching a real action template. Copy must be the real
 * copy[locale].workspace.templates strings -- never invented text -- and the
 * link must carry both `market` and `intent`.
 */
describe("LandingPage outcome examples (item 8)", () => {
  it("renders the three outcome cards with the real template copy and an intent-carrying scan link", () => {
    const root = markup("en")
    const section = root.querySelector(".outcome-examples-section")
    expect(section).not.toBeNull()
    expect(section?.textContent).toContain("Reply to unanswered Google reviews")
    expect(section?.textContent).toContain("Add clear FAQ answers for search and AI")
    expect(section?.textContent).toContain("Complete the Google Business Profile basics")
    const links = Array.from(section?.querySelectorAll("a") ?? []).map((a) => a.getAttribute("href"))
    expect(links).toContain("/en/scan?market=hk&intent=review-response")
    expect(links).toContain("/en/scan?market=hk&intent=visibility-content")
    expect(links).toContain("/en/scan?market=hk&intent=gbp-profile-fix")
  })

  it("renders in zh-HK and zh-TW without falling back to English", () => {
    const zhHK = markup("zh-HK")
    expect(zhHK.querySelector(".outcome-examples-section")?.textContent).toContain("回覆未回覆的 Google 評論")
    const zhTW = markup("zh-TW")
    expect(zhTW.querySelector(".outcome-examples-section")?.textContent).toContain("回覆未回覆的 Google 評論")
  })
})
