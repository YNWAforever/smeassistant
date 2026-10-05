// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en/owner/select-workspace",
  useSearchParams: () => new URLSearchParams(),
}))

import { emptyStateCopy, SelectWorkspacePage } from "@/components/select-workspace-page"

const LOCALES = ["en", "zh-HK", "zh-TW"] as const

function markup(locale: (typeof LOCALES)[number], oauthClaimEnabled: boolean) {
  const root = document.createElement("div")
  root.innerHTML = renderToStaticMarkup(
    <SelectWorkspacePage locale={locale} cards={[]} email="nobody@example.test" signOutAction={async () => {}} oauthClaimEnabled={oauthClaimEnabled} />,
  )
  return root
}

// FA-03: a memberless signed-in user is told the one real path to a workspace
// and is never offered a path that does not exist.
describe("SelectWorkspacePage empty state", () => {
  for (const locale of LOCALES) {
    for (const oauth of [true, false]) {
      it(`names one owner path and one colleague path, with the scan as the only primary CTA (${locale}, OAuth claim ${oauth ? "on" : "off"})`, () => {
        const root = markup(locale, oauth)
        const text = root.textContent ?? ""
        const copy = emptyStateCopy(locale, oauth)
        expect(text).toContain(copy.lead)
        expect(text).toContain(copy.owner)
        expect(text).toContain(copy.colleague)

        // Only one link out of the empty state, and it starts the claim path.
        const links = Array.from(root.querySelectorAll(".empty-state a")).map((a) => a.getAttribute("href"))
        expect(links).toEqual([`/${locale}/scan`])

        // Retired copy: unlocking never creates a workspace and invitation mail is not built.
        expect(text).not.toContain("等待店主邀請你加入")
        expect(text).not.toContain("wait for an owner to invite you")
        // Retired engineering-language footer.
        expect(text).not.toContain("fail closed")
        expect(text).not.toContain("深層連結")
      })
    }
  }

  it("names the Google control only while the OAuth claim flag is on", () => {
    expect(emptyStateCopy("zh-HK", true).owner).toContain("以 Google 驗證擁有權")
    expect(emptyStateCopy("en", true).owner).toContain("Verify ownership with Google")
    for (const locale of LOCALES) expect(emptyStateCopy(locale, false).owner).not.toMatch(/Google/)
    // With the flag off the owner step names the report's real claim button.
    expect(emptyStateCopy("zh-HK", false).owner).toContain("登入認領此商戶")
    expect(emptyStateCopy("zh-TW", false).owner).toContain("登入認領此店家")
    expect(emptyStateCopy("en", false).owner).toContain("Sign in to claim this business")
  })

  it("keeps the owner-supplied zh-HK wording when the OAuth claim flag is on", () => {
    const copy = emptyStateCopy("zh-HK", true)
    expect(`${copy.lead}${copy.owner}${copy.colleague}`).toBe(
      "你的電郵尚未連結任何工作台。如你是店主：先免費掃描你的商戶，解鎖報告後按「以 Google 驗證擁有權」。如你是同事：請店主在「團隊與權限」加入你的電郵，然後用同一電郵再登入。",
    )
  })
})
