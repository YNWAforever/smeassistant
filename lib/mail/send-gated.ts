import "server-only";

import { mailAvailability, parseRecipientAllowlist } from "./availability";
import type { MailMessage, MailSendResult, MailTransport } from "./transport";

/**
 * The one door for mail that is sent directly rather than through the outbox
 * (invitations, report recovery): applies the same availability + recipient
 * allowlist rules as lib/mail/deliver.ts, then hands off to the transport.
 * Never logs the address -- only a category.
 */
export async function sendGated(input: {
  transport: MailTransport;
  env: Record<string, string | undefined>;
  message: MailMessage;
}): Promise<MailSendResult> {
  const { transport, env, message } = input;
  if (!mailAvailability(env).open) {
    return { status: "not_configured", error: "mail_closed" };
  }
  const allowlist = parseRecipientAllowlist(env.MAIL_RECIPIENT_ALLOWLIST);
  if (allowlist && !allowlist.has(message.to.trim().toLowerCase())) {
    return { status: "not_configured", error: "not_allowlisted" };
  }
  try {
    return await transport.send(message);
  } catch {
    console.error("[mail] transport_threw", { category: "mail_transport_threw" });
    return { status: "failed", error: "transport_threw" };
  }
}
