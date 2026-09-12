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
      },
      body: JSON.stringify({
        from: config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
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
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body && typeof body.message === "string"
        ? body.message
        : `provider_http_${response.status}`;
    return { status: "failed", error: message };
  }
  const providerMessageId =
    body && typeof body === "object" && "id" in body && typeof body.id === "string" ? body.id : undefined;
  if (!providerMessageId) return { status: "failed", error: "provider_response_missing_id" };
  return { status: "accepted_by_provider", providerMessageId };
}
