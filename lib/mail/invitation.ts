import "server-only";
import type { Pool } from "pg";

import type { Locale } from "@/lib/locale";

import { findMailAttempt, recordMailAttempt } from "./ledger";
import { sendGated } from "./send-gated";
import { renderInvitationMail } from "./templates";
import type { MailSendStatus, MailTransport } from "./transport";

export function invitationDedupeKey(memberId: string, invitedAt: string): string {
  return `invite:${memberId}:${Date.parse(invitedAt)}`;
}

export interface SendInvitationInput {
  db: Pick<Pool, "query">;
  transport: MailTransport;
  env: Record<string, string | undefined>;
  member: { id: string; email: string; role: "manager" | "viewer"; invitedAt: string };
  workspaceId: string;
  workspaceName: string;
  locale: Locale;
  origin: string;
}

/**
 * Sends the workspace invitation mail at most once per (member, invite time):
 * a prior ledger attempt short-circuits. A ledger-write failure never changes
 * the reported send status; it is logged by category only.
 */
export async function sendInvitation(input: SendInvitationInput): Promise<{ status: MailSendStatus }> {
  const { db, transport, env, member, workspaceId, workspaceName, locale, origin } = input;
  const dedupeKey = invitationDedupeKey(member.id, member.invitedAt);

  const prior = await findMailAttempt(db, dedupeKey);
  if (prior) return { status: prior.status };

  const rendered = renderInvitationMail(locale, {
    workspaceName,
    role: member.role,
    signInUrl: `${origin}/${locale}/owner/sign-in?method=email`,
  });
  const result = await sendGated({
    transport,
    env,
    message: { to: member.email, subject: rendered.subject, text: rendered.text, html: rendered.html, dedupeKey },
  });

  try {
    await recordMailAttempt(db, { dedupeKey, workspaceId, result, entityType: "workspace_member", entityId: member.id });
  } catch {
    console.error("[mail] ledger_failed", { category: "mail_ledger_failed" });
  }
  return { status: result.status };
}
