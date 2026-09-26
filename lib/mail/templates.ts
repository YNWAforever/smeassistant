// Trilingual event-mail copy (docs/superpowers/specs/2026-09-27-mail-outbox-
// design.md). Exact strings live in the plan brief; this module only fills
// placeholders and produces both a plain-text and an HTML body from the same
// copy. Pure: no DB, no env reads -- workspaceUrl and unsubscribeUrl arrive
// already absolute, this module only interpolates and escapes them.
import type { Locale } from "@/lib/locale";

import type { MailKind } from "./decide";

export interface ScanMailInput {
  businessName: string;
  regressedCount: number | null;
  workspaceUrl: string;
  unsubscribeUrl: string;
}

export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
}

interface MailCopy {
  subject: string;
  body: string;
  footer: string;
}

// Placeholder tokens below are literal `{business}` / `{count}` /
// `{workspaceUrl}` / `{unsubscribeUrl}` markers filled by fillTemplate.
const COPY: Record<MailKind, Record<Locale, MailCopy>> = {
  rescan_complete: {
    en: {
      subject: "Rescan complete: {business}",
      body: "Your latest scan of {business} has finished. Open your workspace to see the refreshed evidence and actions: {workspaceUrl}",
      footer:
        "You're receiving this because you turned on rescan emails for this workspace. Stop these emails: {unsubscribeUrl}",
    },
    "zh-HK": {
      subject: "重新掃描完成：{business}",
      body: "{business} 的最新掃描已完成。開啟工作台查看更新後的證據及行動：{workspaceUrl}",
      footer: "你收到此電郵，是因為你在此工作台開啟了重新掃描電郵。停止接收：{unsubscribeUrl}",
    },
    "zh-TW": {
      subject: "重新掃描完成：{business}",
      body: "{business} 的最新掃描已完成。開啟工作台查看更新後的證據與行動：{workspaceUrl}",
      footer: "你收到這封電子郵件，是因為你在這個工作台開啟了重新掃描通知。停止接收：{unsubscribeUrl}",
    },
  },
  regression_alert: {
    en: {
      subject: "New issues found: {business}",
      body: "The latest comparable scan of {business} found {count} issue(s) that were not there last time. Open your workspace to see what changed: {workspaceUrl}",
      footer:
        "You're receiving this because you turned on regression alerts for this workspace. Stop these emails: {unsubscribeUrl}",
    },
    "zh-HK": {
      subject: "發現新問題：{business}",
      body: "{business} 最新一次可比較掃描發現 {count} 項上次沒有的問題。開啟工作台查看變化：{workspaceUrl}",
      footer: "你收到此電郵，是因為你在此工作台開啟了退步提示。停止接收：{unsubscribeUrl}",
    },
    "zh-TW": {
      subject: "發現新問題：{business}",
      body: "{business} 最新一次可比較掃描發現 {count} 項上次沒有的問題。開啟工作台查看變化：{workspaceUrl}",
      footer: "你收到這封電子郵件，是因為你在這個工作台開啟了退步提醒。停止接收：{unsubscribeUrl}",
    },
  },
};

/** Keys whose value is a URL, rendered as `<a href>` in HTML instead of escaped text. */
const LINK_KEYS = new Set(["workspaceUrl", "unsubscribeUrl"]);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fillTemplate(
  template: string,
  values: Record<string, string>,
  mode: "text" | "html",
): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const raw = values[key] ?? "";
    if (mode === "text") return raw;

    const escaped = escapeHtml(raw);
    return LINK_KEYS.has(key) ? `<a href="${escaped}">${escaped}</a>` : escaped;
  });
}

/**
 * Renders one scan-mail kind in one locale. `html` HTML-escapes every
 * interpolated value and renders `workspaceUrl`/`unsubscribeUrl` as anchors;
 * `text` is the raw interpolation, `body` + a blank line + `footer`.
 */
export function renderScanMail(kind: MailKind, locale: Locale, input: ScanMailInput): RenderedMail {
  const copy = COPY[kind][locale];
  const values: Record<string, string> = {
    business: input.businessName,
    count: String(input.regressedCount ?? 0),
    workspaceUrl: input.workspaceUrl,
    unsubscribeUrl: input.unsubscribeUrl,
  };

  const subject = fillTemplate(copy.subject, values, "text");
  const bodyText = fillTemplate(copy.body, values, "text");
  const footerText = fillTemplate(copy.footer, values, "text");

  const bodyHtml = fillTemplate(copy.body, values, "html");
  const footerHtml = fillTemplate(copy.footer, values, "html");

  return {
    subject,
    text: `${bodyText}\n\n${footerText}`,
    html: `<p>${bodyHtml}</p><p>${footerHtml}</p>`,
  };
}
