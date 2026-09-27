/**
 * Pure decision logic for the mail outbox (docs/superpowers/specs/2026-09-27-
 * mail-outbox-design.md): which mail kinds a finished scan can produce, and
 * whether a given recipient's mail is queued or held and why. No DB, no env
 * reads -- callers (the completion writer, the delivery tick) supply every
 * fact this module needs.
 */
import type { MailAvailability } from "./availability";

/** Mirrors mail_outbox_kind_check in neon/migrations/0010_mail_outbox.sql. */
export const MAIL_KINDS = ["rescan_complete", "regression_alert"] as const;
export type MailKind = (typeof MAIL_KINDS)[number];

/** Mirrors mail_outbox_hold_reason_check in neon/migrations/0010_mail_outbox.sql. */
export const HOLD_REASONS = [
  "mail_unapproved",
  "kind_disabled",
  "opted_out",
  "no_address",
  "not_allowlisted",
  "not_member",
] as const;
export type HoldReason = (typeof HOLD_REASONS)[number];

export interface ScanJobForMail {
  status: string;
}

export interface ScanDiffForMail {
  comparable: boolean;
  regressed_findings: string[];
}

/**
 * Which mail kinds a finished scan could produce, before per-recipient
 * decisions (decideRecipient) narrow it further. A scan that hasn't reached
 * a terminal done|partial state, or that has no diff row at all (no earlier
 * comparable job existed to diff against), produces no mail. Once there is a
 * diff, `rescan_complete` always fires -- a member who asked to hear about
 * rescans wants to know one finished even when nothing regressed or the
 * comparison itself was withheld. `regression_alert` is stricter: the diff
 * must be comparable (§3.5.3) and must actually list a regressed finding,
 * because an incomparable diff's regressed_findings is not evidence of
 * anything and decayed-only findings are time drift, not a regression.
 */
export function mailKindsForScan(job: ScanJobForMail, diff: ScanDiffForMail | null): MailKind[] {
  if (job.status !== "done" && job.status !== "partial") return [];
  if (!diff) return [];

  const kinds: MailKind[] = ["rescan_complete"];
  if (diff.comparable && diff.regressed_findings.length > 0) {
    kinds.push("regression_alert");
  }
  return kinds;
}

/** Everything decideRecipient needs to know about one member for one mail kind. */
export interface RecipientFacts {
  /** workspace_members.accepted_at is not null for this member. */
  accepted: boolean;
  /** The workspace-level notify_rescan_complete / notify_regression_alert toggle for this kind. */
  kindAllowed: boolean;
  /** The member's own mail_rescan_complete / mail_regression_alert opt-in for this kind. */
  optedIn: boolean;
  address: string | null;
}

export interface RecipientDecisionContext {
  availability: MailAvailability;
  allowlist: Set<string> | null;
}

export type RecipientDecision = { state: "queued" } | { state: "held"; reason: HoldReason };

/**
 * Decision order (global-constraints.md, binding): mail_unapproved ->
 * not_member -> kind_disabled -> opted_out -> no_address -> not_allowlisted
 * -> queue. The order matters only when more than one reason would apply --
 * it guarantees the first reason a caller sees is *the* reason, not an
 * arbitrary one among several that happen to be true.
 */
export function decideRecipient(
  facts: RecipientFacts,
  ctx: RecipientDecisionContext,
): RecipientDecision {
  if (!ctx.availability.open) return { state: "held", reason: "mail_unapproved" };
  if (!facts.accepted) return { state: "held", reason: "not_member" };
  if (!facts.kindAllowed) return { state: "held", reason: "kind_disabled" };
  if (!facts.optedIn) return { state: "held", reason: "opted_out" };
  if (!facts.address) return { state: "held", reason: "no_address" };

  if (ctx.allowlist && !ctx.allowlist.has(facts.address.trim().toLowerCase())) {
    return { state: "held", reason: "not_allowlisted" };
  }

  return { state: "queued" };
}

export const MAX_ATTEMPTS = 5;
export const LEASE_MINUTES = 5;
export const BATCH_SIZE = 10;
export const EXPIRY_HOURS = 24;

const RETRY_DELAY_MINUTES_BY_ATTEMPT: Readonly<Record<number, number>> = {
  1: 5,
  2: 15,
  3: 60,
  4: 240,
};

/**
 * Minutes to wait before the next attempt, keyed by the attempt number that
 * just failed. `null` at attempt >= MAX_ATTEMPTS means there is no next
 * attempt -- the row goes `dead` instead of `retry`.
 */
export function retryDelayMinutes(attempt: number): number | null {
  return RETRY_DELAY_MINUTES_BY_ATTEMPT[attempt] ?? null;
}
