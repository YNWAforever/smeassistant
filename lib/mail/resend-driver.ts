import "server-only";
import type { MailMessage, MailSendResult } from "./transport";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const REQUEST_TIMEOUT_MS = 10_000;

export interface ResendConfig {
  apiKey: string;
  from: string;
}

/**
 * Talks to Resend's REST API directly (no SDK dependency added for a driver
 * that is not yet wired to any live caller). Never throws: every outcome,
 * including a network failure, resolves to a MailSendResult so a caller can
 * always record what happened.
 */
export async function sendViaResend(
  config: ResendConfig,
  message: MailMessage,
): Promise<MailSendResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        // Resend's own idempotency key, keyed on the ledger's dedupe key: a
        // retried send of the *same logical attempt* (e.g. a client-side
        // retry after a timeout whose response never arrived) cannot create
        // a second provider-side message.
        "Idempotency-Key": message.dedupeKey,
      },
      body: JSON.stringify({
        from: config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.headers ? { headers: message.headers } : {}),
      }),
      signal: controller.signal,
    });
  } catch (cause) {
    const reason = cause instanceof Error && cause.name === "AbortError" ? "timed_out" : "network_error";
    return { status: "failed", error: reason };
  } finally {
    clearTimeout(timeout);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  // Category code only, never the provider's free-text message: last_error
  // is stored in mail_outbox and surfaced on operator failure lists, and
  // global-constraints.md forbids logging or persisting provider response
  // text (it can carry the recipient's address back verbatim).
  if (!response.ok) {
    return { status: "failed", error: `provider_http_${response.status}` };
  }
  const providerMessageId =
    body && typeof body === "object" && "id" in body && typeof body.id === "string" ? body.id : undefined;
  if (!providerMessageId) return { status: "failed", error: "provider_response_missing_id" };
  return { status: "accepted_by_provider", providerMessageId };
}
