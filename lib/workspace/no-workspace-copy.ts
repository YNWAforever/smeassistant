import type { Locale } from "@/lib/locale"

/**
 * FA-03 / FA-13: the one real path to a workspace for a signed-in user with no
 * accepted membership. Shared by the select-workspace empty state and the
 * sign-in no-access card, so both say the same thing.
 *
 * An owner gets there by claiming a report; a colleague by being added under
 * Team & roles. Unlocking alone never creates a workspace, and invitation mail
 * is not built, so neither is offered. The owner step names the control that
 * actually renders: "Verify ownership with Google" only exists while the OAuth
 * claim flag is on; otherwise the claim continues through Fimmick assignment.
 */
export type NoWorkspaceCopy = { lead: string; owner: string; colleague: string; scanCta: string }

export function noWorkspaceCopy(locale: Locale, oauthClaimEnabled: boolean): NoWorkspaceCopy {
  if (locale === "zh-TW") {
    return {
      lead: "您的電子郵件尚未連結任何工作台。",
      owner: oauthClaimEnabled
        ? "如果您是店家負責人：先免費掃描您的店家，解鎖報告後按「以 Google 驗證擁有權」。"
        : "如果您是店家負責人：先免費掃描您的店家，解鎖報告後按「登入認領此店家」，再依指示請 Fimmick 核實並指派。",
      colleague: "如果您是同事：請店家負責人在「團隊與權限」加入您的電子郵件，然後用同一個電子郵件重新登入。",
      scanCta: "先免費掃描",
    }
  }
  if (locale === "en") {
    return {
      lead: "Your email isn’t linked to a workspace yet.",
      owner: oauthClaimEnabled
        ? "If you own the business: run a free scan, unlock the report, then choose “Verify ownership with Google”."
        : "If you own the business: run a free scan, unlock the report, choose “Sign in to claim this business”, then follow the steps to have Fimmick verify and assign it.",
      colleague: "If you’re a colleague: ask the owner to add your email under “Team & roles”, then sign in again with that same email.",
      scanCta: "Start with a free scan",
    }
  }
  return {
    lead: "你的電郵尚未連結任何工作台。",
    owner: oauthClaimEnabled
      ? "如你是店主：先免費掃描你的商戶，解鎖報告後按「以 Google 驗證擁有權」。"
      : "如你是店主：先免費掃描你的商戶，解鎖報告後按「登入認領此商戶」，再按指示請 Fimmick 核實並指派。",
    colleague: "如你是同事：請店主在「團隊與權限」加入你的電郵，然後用同一電郵再登入。",
    scanCta: "先免費掃描",
  }
}
