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
const LINK_KEYS = new Set(["workspaceUrl", "unsubscribeUrl", "signInUrl", "recoverUrl"]);

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

function renderCopy(copy: MailCopy, values: Record<string, string>): RenderedMail {
  const bodyText = fillTemplate(copy.body, values, "text");
  const footerText = fillTemplate(copy.footer, values, "text");
  const bodyHtml = fillTemplate(copy.body, values, "html");
  const footerHtml = fillTemplate(copy.footer, values, "html");

  return {
    subject: fillTemplate(copy.subject, values, "text"),
    text: `${bodyText}

${footerText}`,
    html: `<p>${bodyHtml}</p><p>${footerHtml}</p>`,
  };
}

/**
 * Renders one scan-mail kind in one locale. `html` HTML-escapes every
 * interpolated value and renders `workspaceUrl`/`unsubscribeUrl` as anchors;
 * `text` is the raw interpolation, `body` + a blank line + `footer`.
 */
export function renderScanMail(kind: MailKind, locale: Locale, input: ScanMailInput): RenderedMail {
  return renderCopy(COPY[kind][locale], {
    business: input.businessName,
    count: String(input.regressedCount ?? 0),
    workspaceUrl: input.workspaceUrl,
    unsubscribeUrl: input.unsubscribeUrl,
  });
}

export interface InvitationMailInput {
  workspaceName: string;
  role: "manager" | "viewer";
  signInUrl: string;
}

export interface RecoveryMailInput {
  businessName: string;
  recoverUrl: string;
}

const INVITATION_COPY: Record<Locale, MailCopy> = {
  en: {
    subject: "You're invited to {workspace}",
    body: "You've been invited to join {workspace} as {role}. Sign in with this email address to accept: {signInUrl}",
    footer: "If you weren't expecting this, you can ignore this email.",
  },
  "zh-HK": {
    subject: "你獲邀加入 {workspace}",
    body: "你獲邀以{role}身份加入 {workspace}。請用此電郵地址登入以接受邀請：{signInUrl}",
    footer: "如你沒有預期收到此邀請，可略過此電郵。",
  },
  "zh-TW": {
    subject: "你受邀加入 {workspace}",
    body: "你受邀以{role}身分加入 {workspace}。請用這個電子郵件地址登入以接受邀請：{signInUrl}",
    footer: "如果你沒有預期收到這封邀請，可以忽略此信。",
  },
};

const ROLE_WORDS: Record<Locale, Record<InvitationMailInput["role"], string>> = {
  en: { manager: "manager", viewer: "viewer" },
  "zh-HK": { manager: "經理", viewer: "檢視者" },
  "zh-TW": { manager: "經理", viewer: "檢視者" },
};

const RECOVERY_COPY: Record<Locale, MailCopy> = {
  en: {
    subject: "Your link to the {business} report",
    body: "Open your report again: {recoverUrl} — this link works once and expires in 60 minutes.",
    footer: "If you didn't ask for this, ignore this email; nothing changes.",
  },
  "zh-HK": {
    subject: "{business} 報告的連結",
    body: "重新開啟你的報告：{recoverUrl}。連結只可使用一次，60 分鐘內有效。",
    footer: "如你沒有提出此要求，請略過此電郵，一切不會改變。",
  },
  "zh-TW": {
    subject: "{business} 報告的連結",
    body: "重新開啟你的報告：{recoverUrl}。連結只能使用一次，60 分鐘內有效。",
    footer: "如果你沒有提出這個要求，請忽略此信，一切不會改變。",
  },
};

export function renderInvitationMail(locale: Locale, input: InvitationMailInput): RenderedMail {
  return renderCopy(INVITATION_COPY[locale], {
    workspace: input.workspaceName,
    role: ROLE_WORDS[locale][input.role],
    signInUrl: input.signInUrl,
  });
}

export function renderRecoveryMail(locale: Locale, input: RecoveryMailInput): RenderedMail {
  return renderCopy(RECOVERY_COPY[locale], {
    business: input.businessName,
    recoverUrl: input.recoverUrl,
  });
}
