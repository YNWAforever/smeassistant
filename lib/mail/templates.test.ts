import { describe, expect, it } from "vitest";

import { renderInvitationMail, renderRecoveryMail, renderScanMail } from "./templates";
import type { Locale } from "@/lib/locale";

const BASE_INPUT = {
  businessName: "Kam Man House",
  regressedCount: null as number | null,
  workspaceUrl: "https://app.example.com/en/owner/kam-man-house",
  unsubscribeUrl: "https://app.example.com/api/mail/unsubscribe?t=abc",
};

describe("renderScanMail", () => {
  it("renders rescan_complete/en exactly", () => {
    const mail = renderScanMail("rescan_complete", "en", BASE_INPUT);
    expect(mail.subject).toBe("Rescan complete: Kam Man House");
    expect(mail.text).toBe(
      "Your latest scan of Kam Man House has finished. Open your workspace to see the refreshed evidence and actions: https://app.example.com/en/owner/kam-man-house\n\n" +
        "You're receiving this because you turned on rescan emails for this workspace. Stop these emails: https://app.example.com/api/mail/unsubscribe?t=abc",
    );
  });

  it("renders rescan_complete/zh-HK exactly", () => {
    const mail = renderScanMail("rescan_complete", "zh-HK", BASE_INPUT);
    expect(mail.subject).toBe("重新掃描完成：Kam Man House");
    expect(mail.text).toBe(
      "Kam Man House 的最新掃描已完成。開啟工作台查看更新後的證據及行動：https://app.example.com/en/owner/kam-man-house\n\n" +
        "你收到此電郵，是因為你在此工作台開啟了重新掃描電郵。停止接收：https://app.example.com/api/mail/unsubscribe?t=abc",
    );
  });

  it("renders rescan_complete/zh-TW exactly", () => {
    const mail = renderScanMail("rescan_complete", "zh-TW", BASE_INPUT);
    expect(mail.subject).toBe("重新掃描完成：Kam Man House");
    expect(mail.text).toBe(
      "Kam Man House 的最新掃描已完成。開啟工作台查看更新後的證據與行動：https://app.example.com/en/owner/kam-man-house\n\n" +
        "你收到這封電子郵件，是因為你在這個工作台開啟了重新掃描通知。停止接收：https://app.example.com/api/mail/unsubscribe?t=abc",
    );
  });

  it("renders regression_alert/en exactly with the regressed count", () => {
    const mail = renderScanMail("regression_alert", "en", { ...BASE_INPUT, regressedCount: 2 });
    expect(mail.subject).toBe("New issues found: Kam Man House");
    expect(mail.text).toBe(
      "The latest comparable scan of Kam Man House found 2 issue(s) that were not there last time. Open your workspace to see what changed: https://app.example.com/en/owner/kam-man-house\n\n" +
        "You're receiving this because you turned on regression alerts for this workspace. Stop these emails: https://app.example.com/api/mail/unsubscribe?t=abc",
    );
  });

  it("renders regression_alert/zh-HK exactly with the regressed count", () => {
    const mail = renderScanMail("regression_alert", "zh-HK", { ...BASE_INPUT, regressedCount: 2 });
    expect(mail.subject).toBe("發現新問題：Kam Man House");
    expect(mail.text).toBe(
      "Kam Man House 最新一次可比較掃描發現 2 項上次沒有的問題。開啟工作台查看變化：https://app.example.com/en/owner/kam-man-house\n\n" +
        "你收到此電郵，是因為你在此工作台開啟了退步提示。停止接收：https://app.example.com/api/mail/unsubscribe?t=abc",
    );
  });

  it("renders regression_alert/zh-TW exactly with the regressed count", () => {
    const mail = renderScanMail("regression_alert", "zh-TW", { ...BASE_INPUT, regressedCount: 2 });
    expect(mail.subject).toBe("發現新問題：Kam Man House");
    expect(mail.text).toBe(
      "Kam Man House 最新一次可比較掃描發現 2 項上次沒有的問題。開啟工作台查看變化：https://app.example.com/en/owner/kam-man-house\n\n" +
        "你收到這封電子郵件，是因為你在這個工作台開啟了退步提醒。停止接收：https://app.example.com/api/mail/unsubscribe?t=abc",
    );
  });

  it("HTML-escapes an interpolated business name in html, but not in text", () => {
    const mail = renderScanMail("rescan_complete", "en", {
      ...BASE_INPUT,
      businessName: `<b>&"x"</b>`,
    });
    expect(mail.text).toContain(`<b>&"x"</b>`);
    expect(mail.html).not.toContain(`<b>&"x"</b>`);
    expect(mail.html).toContain("&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;");
  });

  it("renders workspaceUrl and unsubscribeUrl as anchors in html", () => {
    const mail = renderScanMail("rescan_complete", "en", BASE_INPUT);
    expect(mail.html).toContain(`<a href="${BASE_INPUT.workspaceUrl}">${BASE_INPUT.workspaceUrl}</a>`);
    expect(mail.html).toContain(`<a href="${BASE_INPUT.unsubscribeUrl}">${BASE_INPUT.unsubscribeUrl}</a>`);
  });

  it("never renders the word 'delivered' anywhere, in any kind/locale", () => {
    const kinds = ["rescan_complete", "regression_alert"] as const;
    const locales = ["en", "zh-HK", "zh-TW"] as const;
    for (const kind of kinds) {
      for (const locale of locales) {
        const mail = renderScanMail(kind, locale, { ...BASE_INPUT, regressedCount: 3 });
        expect(mail.subject.toLowerCase()).not.toContain("delivered");
        expect(mail.text.toLowerCase()).not.toContain("delivered");
        expect(mail.html.toLowerCase()).not.toContain("delivered");
      }
    }
  });
});

const LOCALES: Locale[] = ["en", "zh-HK", "zh-TW"];
const SIGN_IN_URL = "https://app.example.com/auth/callback?token_hash=abcDEF123_-abcDEF123_-abcDEF123_-abcDEF123";
const RECOVER_URL = "https://app.example.com/api/report-access/recover?t=abcDEF123_-abcDEF123_-abcDEF123_-abcDEF123";

describe("renderInvitationMail", () => {
  it.each(LOCALES)("includes workspace name and sign-in URL (%s)", (locale) => {
    const mail = renderInvitationMail(locale, {
      workspaceName: "Kam Man House",
      role: "manager",
      signInUrl: SIGN_IN_URL,
    });
    expect(mail.subject).toContain("Kam Man House");
    expect(mail.text).toContain("Kam Man House");
    expect(mail.text).toContain(SIGN_IN_URL);
    expect(mail.html).toContain(`<a href="${SIGN_IN_URL}">`);
  });

  it.each(LOCALES)("escapes the workspace name in html (%s)", (locale) => {
    const mail = renderInvitationMail(locale, {
      workspaceName: "<b>Evil</b>",
      role: "viewer",
      signInUrl: SIGN_IN_URL,
    });
    expect(mail.html).not.toContain("<b>");
    expect(mail.html).toContain("&lt;b&gt;Evil&lt;/b&gt;");
  });

  it.each(LOCALES)("carries no long token-like run outside the URL (%s)", (locale) => {
    const mail = renderInvitationMail(locale, {
      workspaceName: "Kam Man House",
      role: "viewer",
      signInUrl: SIGN_IN_URL,
    });
    expect(mail.text.replace(SIGN_IN_URL, "")).not.toMatch(/[A-Za-z0-9_-]{32,}/);
  });

  it("localizes the role word", () => {
    const input = { workspaceName: "W", signInUrl: SIGN_IN_URL };
    expect(renderInvitationMail("en", { ...input, role: "manager" }).text).toContain("as manager");
    expect(renderInvitationMail("zh-HK", { ...input, role: "viewer" }).text).toContain("檢視者");
    expect(renderInvitationMail("zh-TW", { ...input, role: "manager" }).text).toContain("經理");
  });
});

describe("renderRecoveryMail", () => {
  it.each([
    ["en", "once", "60 minutes"],
    ["zh-HK", "一次", "60 分鐘"],
    ["zh-TW", "一次", "60 分鐘"],
  ] as const)("states single use and expiry (%s)", (locale, once, sixty) => {
    const mail = renderRecoveryMail(locale, { businessName: "Kam Man House", recoverUrl: RECOVER_URL });
    expect(mail.subject).toContain("Kam Man House");
    expect(mail.text).toContain(RECOVER_URL);
    expect(mail.text).toContain(once);
    expect(mail.text).toContain(sixty);
    expect(mail.html).toContain(`<a href="${RECOVER_URL}">`);
  });
});
