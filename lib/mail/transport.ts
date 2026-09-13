import "server-only";
import { sendViaResend } from "./resend-driver";

/**
 * Transactional-email port (Phase 2 item 26), explicitly separate from Neon
 * Auth identity mail (lib/identity/composition.ts). "queued" exists in the
 * vocabulary for a future asynchronous driver; this driver's own send()
 * never returns it -- a fetch to Resend resolves to accepted-by-provider or
 * failed, never a pending state. Never call any of this "sent": that word
 * promises delivery this port cannot see.
 */
export const MAIL_SEND_STATUSES = [
  "not_configured",
  "queued",
  "accepted_by_provider",
  "failed",
] as const;
export type MailSendStatus = (typeof MAIL_SEND_STATUSES)[number];

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Stable across retries of the same logical send; the ledger's dedupe key. */
  dedupeKey: string;
}

export interface MailSendResult {
  status: MailSendStatus;
  /** Only meaningful when status is "accepted_by_provider". */
  providerMessageId?: string;
  /** Only meaningful when status is "failed". Never a raw provider secret. */
  error?: string;
}

export interface MailTransport {
  send(message: MailMessage): Promise<MailSendResult>;
}

/** The safe default: reports the honest reason rather than attempting anything. */
const unconfiguredTransport: MailTransport = {
  async send() {
    return { status: "not_configured" };
  },
};

export interface MailTransportConfig {
  resendApiKey?: string;
  fromAddress?: string;
}

export interface MailEnv {
  RESEND_API_KEY?: string;
  REPORT_EMAIL_FROM?: string;
}

function readConfig(env: MailEnv): MailTransportConfig {
  return {
    resendApiKey: env.RESEND_API_KEY?.trim() || undefined,
    fromAddress: env.REPORT_EMAIL_FROM?.trim() || undefined,
  };
}

/**
 * A fresh object per call (never a module-load-time snapshot), so a test or
 * a runtime env change is picked up on the next call. process.env itself
 * isn't used as the default value directly: it satisfies MailEnv only via
 * an index signature, which trips TypeScript's weak-type check on a purely
 * optional interface.
 */
function currentEnv(): MailEnv {
  return { RESEND_API_KEY: process.env.RESEND_API_KEY, REPORT_EMAIL_FROM: process.env.REPORT_EMAIL_FROM };
}

/**
 * Selects the driver from configuration presence alone. Both RESEND_API_KEY
 * and REPORT_EMAIL_FROM ship blank in .env.example, so the unconfigured
 * driver is what every environment gets until DEC-07 is resolved and both
 * are deliberately set.
 */
export function createMailTransport(env: MailEnv = currentEnv()): MailTransport {
  const config = readConfig(env);
  if (!config.resendApiKey || !config.fromAddress) return unconfiguredTransport;
  const { resendApiKey, fromAddress } = config;
  return {
    send: (message) => sendViaResend({ apiKey: resendApiKey, from: fromAddress }, message),
  };
}
