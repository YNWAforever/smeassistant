import { describe, expect, it } from "vitest";

import { renderScanMail } from "./templates";

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
