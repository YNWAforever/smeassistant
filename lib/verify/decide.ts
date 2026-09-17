import type { WebsiteCheckKey, WebsiteChecks } from "@/lib/website/checks";

/**
 * Does a fresh fetch of the owner's site evidence that this action's work
 * landed? (docs/superpowers/specs/2026-09-16-website-verifier-design.md)
 *
 * Pure on purpose: this rule decides what the product is allowed to claim it
 * confirmed, and it must be testable without a database or a network.
 *
 * - `verified`        every check that was FAILING at the action's source
 *                     snapshot now passes.
 * - `not_yet`         try again tomorrow.
 * - `not_verifiable`  this action can never be verified from its website: the
 *                     answer is permanent, not "not right now".
 *
 * Known limitation: `not_verifiable` is permanent for the action but is NOT
 * remembered. The sweep stamps `verification_checked_at`, the 24-hour throttle
 * expires, and the same action is selected and re-derived on the next cycle,
 * indefinitely. The repository query filters out actions whose template
 * declares no checks and actions with no source snapshot, but it cannot filter
 * out "every declared check was already passing at the source snapshot" --
 * that needs the template table and JSON inspection inside the SQL. This is
 * acceptable at present scale because the fetch is shared per location and the
 * batch is capped, so such an action costs a slot rather than a request. If it
 * ever matters, the fix is to record the permanence, not to re-derive it.
 */
export type VerificationDecision = "verified" | "not_yet" | "not_verifiable";

function resultFor(checks: WebsiteChecks | null, key: WebsiteCheckKey): boolean | null {
  const hit = checks?.results.find((result) => result.key === key);
  return hit ? hit.pass : null;
}

export function decideVerification(
  verifyChecks: readonly WebsiteCheckKey[],
  // `prior` and `fresh` are the same type, so taking them positionally would
  // let a caller swap them and invert every decision while still compiling.
  // Naming them at the call site is the whole defence.
  { prior, fresh }: { prior: WebsiteChecks | null; fresh: WebsiteChecks },
): VerificationDecision {
  // A cheap early-out only. Nothing downstream depends on it: with no declared
  // keys `relevant` is empty too, and the final return handles that.
  if (!verifyChecks.length || !prior) return "not_verifiable";

  // Only the checks that were actually broken. A template declares every check
  // that could evidence it, but an action usually exists because one of them
  // failed -- judging it on all of them would both withhold verification over a
  // check that was never the problem and, for a wholly-passing prior, confirm
  // work nobody did.
  const relevant: WebsiteCheckKey[] = [];
  for (const key of verifyChecks) {
    const before = resultFor(prior, key);
    // null means the prior scan never evaluated it, so we cannot say it was
    // failing, so we must not later claim it was fixed.
    if (before === false) relevant.push(key);
  }
  for (const key of relevant) {
    // Per-key, never a check on `fresh.evaluated`: a fetch that returned only
    // some of the checks must not verify the ones it never looked at. A fetch
    // that failed outright yields evaluated: 0 and no results, so every lookup
    // is null -- "we could not look", not "it is fixed".
    if (resultFor(fresh, key) !== true) return "not_yet";
  }
  // The length check lives here, after the loop, rather than as a guard before
  // it, so that an empty relevant set and a "verified" result cannot co-occur
  // by construction: a vacuous loop must not mean success.
  return relevant.length ? "verified" : "not_verifiable";
}
