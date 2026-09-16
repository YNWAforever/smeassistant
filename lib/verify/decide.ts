import type { WebsiteCheckKey, WebsiteChecks } from "@/lib/website/checks";

/**
 * Does a fresh fetch of the owner's site evidence that this action's work
 * landed? (docs/superpowers/specs/2026-09-16-website-verifier-design.md)
 *
 * Pure on purpose: this rule decides what the product is allowed to claim it
 * confirmed, and it must be testable without a database or a network.
 *
 * - `verified`       every check that was FAILING at the action's source
 *                    snapshot now passes.
 * - `not_yet`        try again tomorrow.
 * - `not_applicable` can never change for this action; the sweep stops asking.
 */
export type VerificationDecision = "verified" | "not_yet" | "not_applicable";

function resultFor(checks: WebsiteChecks | null, key: WebsiteCheckKey): boolean | null {
  const hit = checks?.results.find((result) => result.key === key);
  return hit ? hit.pass : null;
}

export function decideVerification(
  verifyChecks: readonly WebsiteCheckKey[],
  prior: WebsiteChecks | null,
  fresh: WebsiteChecks,
): VerificationDecision {
  // Not an early-exit optimisation. With no declared keys `relevant` below is
  // empty too, so this is belt-and-braces for the same hazard the guard after
  // the loop's input guards against: an empty relevant set must never reach the
  // loop, or a site nobody could reach falls through to "verified".
  if (!verifyChecks.length || !prior) return "not_applicable";

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
  // Load-bearing, despite reading like a redundant early exit. It is what keeps
  // the loop below non-vacuous: remove it and an action with nothing to verify
  // runs a zero-iteration loop and falls straight through to "verified", so a
  // website we never even fetched would be reported to the merchant as
  // confirmed live. That is the worst thing this function can do.
  if (!relevant.length) return "not_applicable";

  for (const key of relevant) {
    // Per-key, never a check on `fresh.evaluated`: a fetch that returned only
    // some of the checks must not verify the ones it never looked at. A fetch
    // that failed outright yields evaluated: 0 and no results, so every lookup
    // is null -- "we could not look", not "it is fixed".
    if (resultFor(fresh, key) !== true) return "not_yet";
  }
  return "verified";
}
