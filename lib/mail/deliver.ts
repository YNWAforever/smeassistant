import "server-only";

import { pauseState, logPauseRefusal } from "@/lib/budgets/pause";
import type { Locale } from "@/lib/locale";
import type { ClaimedRow, MailOutboxRepository } from "@/lib/repositories/mail-outbox";

import { mailAvailability, parseRecipientAllowlist } from "./availability";
import { BATCH_SIZE, EXPIRY_HOURS, decideRecipient, retryDelayMinutes } from "./decide";
import { renderScanMail } from "./templates";
import type { MailMessage, MailTransport } from "./transport";
import { UNSUBSCRIBE_TTL_MS, signUnsubscribeToken } from "./unsubscribe-token";

/**
 * The cron tick's mail-delivery step (docs/superpowers/specs/2026-09-27-
 * mail-outbox-design.md §4). Claims up to BATCH_SIZE due rows, re-checks
 * every fact that could have changed since enqueue (Review Focus 1: a member
 * who unsubscribed or was removed between enqueue and this tick must never
 * be sent to), and sends what is still eligible through the injected
 * transport. Never throws for an individual row's own outcome -- a bad send
 * finishes that row `retry`/`dead`/`held`, it does not fail the tick.
 */
export interface DeliverMailDeps {
  repo: MailOutboxRepository;
  transport: MailTransport;
  env?: Record<string, string | undefined>;
  now?: () => Date;
}

export interface DeliverMailSummary {
  sent: number;
  retried: number;
  held: number;
  dead: number;
  expired: number;
  paused: boolean;
}

/** Mirrors the shape enqueueScanMail (./enqueue.ts) writes into mail_outbox.payload. */
interface ScanMailPayload {
  businessName: string;
  regressedCount: number | null;
  workspacePath: string | null;
}

function payloadOf(row: ClaimedRow): ScanMailPayload {
  const payload = row.payload as Partial<ScanMailPayload> | null;
  return {
    businessName: typeof payload?.businessName === "string" ? payload.businessName : "",
    regressedCount: typeof payload?.regressedCount === "number" ? payload.regressedCount : null,
    workspacePath: typeof payload?.workspacePath === "string" ? payload.workspacePath : null,
  };
}

function isExpired(row: ClaimedRow, now: Date): boolean {
  return now.getTime() - row.created_at.getTime() > EXPIRY_HOURS * 60 * 60 * 1000;
}

/**
 * A `finish` that returns false means this row's lease was reclaimed by
 * another tick between our claim and our attempt to finish it (Review Focus
 * 4) -- the new holder's own result is authoritative, so this outcome is
 * simply dropped: not counted as sent/retried/held/dead/expired, and logged
 * by category + row id only, never the address this row carries.
 */
function logLeaseLost(id: string): void {
  console.warn("[mail] lease_lost", { category: "mail_lease_lost", id });
}

async function deliverOne(
  row: ClaimedRow,
  ctx: { repo: MailOutboxRepository; transport: MailTransport; env: Record<string, string | undefined>; now: Date },
  summary: DeliverMailSummary,
): Promise<void> {
  const { repo, transport, env, now } = ctx;

  if (isExpired(row, now)) {
    const finished = await repo.finish(row.id, row.lease_token, { state: "expired" });
    if (finished) summary.expired += 1;
    else logLeaseLost(row.id);
    return;
  }

  // Re-decide from facts read *now*, not the facts enqueue saw: a member can
  // unsubscribe or be removed at any point between enqueue and this tick.
  const facts = await repo.sendFacts(row);
  const decision = decideRecipient(facts, {
    availability: mailAvailability(env),
    allowlist: parseRecipientAllowlist(env.MAIL_RECIPIENT_ALLOWLIST),
  });

  if (decision.state === "held") {
    const finished = await repo.finish(row.id, row.lease_token, { state: "held", reason: decision.reason });
    if (finished) summary.held += 1;
    else logLeaseLost(row.id);
    return;
  }

  // decideRecipient only returns "queued" once facts.address is non-null
  // (the no_address check runs first), but that invariant lives in another
  // module -- guard here rather than asserting it away.
  const address = facts.address;
  if (!address) {
    const finished = await repo.finish(row.id, row.lease_token, { state: "held", reason: "no_address" });
    if (finished) summary.held += 1;
    else logLeaseLost(row.id);
    return;
  }

  // mailAvailability(env).open is guaranteed true here (decideRecipient would
  // otherwise have held mail_unapproved above), so APP_ORIGIN and
  // MAIL_UNSUBSCRIBE_SECRET are both non-blank and the secret is long enough.
  const appOrigin = env.APP_ORIGIN!.trim();
  const payload = payloadOf(row);
  const token = signUnsubscribeToken(
    { userId: row.user_id, workspaceId: row.workspace_id, kind: row.kind, expiresAt: now.getTime() + UNSUBSCRIBE_TTL_MS },
    env.MAIL_UNSUBSCRIBE_SECRET!.trim(),
  );
  const workspaceUrl = payload.workspacePath ? `${appOrigin}${payload.workspacePath}` : appOrigin;
  const unsubscribeUrl = `${appOrigin}/${row.locale}/unsubscribe?token=${token}`;

  const rendered = renderScanMail(row.kind, row.locale as Locale, {
    businessName: payload.businessName,
    regressedCount: payload.regressedCount,
    workspaceUrl,
    unsubscribeUrl,
  });

  const message: MailMessage = {
    to: address,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    dedupeKey: row.id,
    headers: {
      "List-Unsubscribe": `<${appOrigin}/api/mail/unsubscribe?token=${token}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };

  const result = await transport.send(message);

  if (result.status === "not_configured") {
    const finished = await repo.finish(row.id, row.lease_token, { state: "held", reason: "mail_unapproved" });
    if (finished) summary.held += 1;
    else logLeaseLost(row.id);
    return;
  }

  // "queued" exists in the transport's vocabulary for a future asynchronous
  // driver; treated as accepted only when it actually carries a provider id,
  // exactly like "accepted_by_provider" -- otherwise there is nothing to
  // retry a delivery lookup with later, so it is a failure like any other.
  if ((result.status === "accepted_by_provider" || result.status === "queued") && result.providerMessageId) {
    const finished = await repo.finish(row.id, row.lease_token, {
      state: "sent",
      providerMessageId: result.providerMessageId,
      toAddress: address,
    });
    if (finished) summary.sent += 1;
    else logLeaseLost(row.id);
    return;
  }

  const error =
    result.status === "queued" && !result.providerMessageId
      ? "provider_response_missing_id"
      : (result.error ?? "unknown_error");
  const delayMinutes = retryDelayMinutes(row.attempts);
  if (delayMinutes === null) {
    const finished = await repo.finish(row.id, row.lease_token, { state: "dead", error });
    if (finished) summary.dead += 1;
    else logLeaseLost(row.id);
    return;
  }

  const nextAttemptAt = new Date(now.getTime() + delayMinutes * 60_000);
  const finished = await repo.finish(row.id, row.lease_token, { state: "retry", nextAttemptAt, error });
  if (finished) summary.retried += 1;
  else logLeaseLost(row.id);
}

export async function deliverMail(deps: DeliverMailDeps): Promise<DeliverMailSummary> {
  const env = deps.env ?? process.env;
  const summary: DeliverMailSummary = { sent: 0, retried: 0, held: 0, dead: 0, expired: 0, paused: false };

  if (pauseState(env).mail) {
    logPauseRefusal("mail_send");
    summary.paused = true;
    return summary;
  }

  const now = (deps.now ?? (() => new Date()))();
  const rows = await deps.repo.claimDue(now, BATCH_SIZE);
  for (const row of rows) {
    await deliverOne(row, { repo: deps.repo, transport: deps.transport, env, now }, summary);
  }
  return summary;
}
