import type { VerificationRepository } from "@/lib/repositories/verification";
import { TEMPLATES, findTemplate } from "@/lib/workspace/templates";
import {
  EMPTY_WEBSITE_CHECKS,
  runWebsiteChecksWithUrl,
  sameSiteHost,
  type WebsiteChecks,
} from "@/lib/website/checks";
import { decideVerification } from "./decide";

export interface VerificationSweepDeps {
  fetch?: typeof fetch;
  /** Injected so tests assert what was written without a database. */
  record: (row: {
    workspaceId: string;
    actionId: string;
    source: "verified";
    evidence: Record<string, unknown>;
  }) => Promise<void>;
}

export interface VerificationSweepResult {
  locationsChecked: number;
  /** Actions the sweep actually reached a decision on. */
  actionsConsidered: number;
  actionsVerified: number;
  /** Actions whose write failed after a `verified` decision. */
  actionsFailed: number;
}

/** Template keys that declare verifyChecks, computed once. */
const VERIFIABLE_KEYS = TEMPLATES.filter((t) => t.verifyChecks?.length).map((t) => t.key);

/**
 * `scan_snapshots.website_checks` is jsonb, so the repository's
 * `WebsiteChecks | null` is a claim Postgres cannot enforce -- a legacy row or
 * a future writer bug could return any shape. `decideVerification` reads
 * `.results.find(...)`, which would throw on a malformed value and take down
 * the whole verification concern for the tick rather than one action.
 *
 * An unreadable prior state means we cannot establish what was failing, which
 * is exactly `not_verifiable`. Coercing to null says that honestly instead of
 * guessing or crashing.
 */
function asChecks(value: unknown): WebsiteChecks | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<WebsiteChecks>;
  return Array.isArray(candidate.results) ? (candidate as WebsiteChecks) : null;
}

/**
 * Confirm that website work an owner exported or marked applied is now live
 * (docs/superpowers/specs/2026-09-16-website-verifier-design.md).
 *
 * Bounded deliberately: this is the product's first scheduled outbound traffic
 * to CUSTOMER infrastructure rather than to a provider it pays. One fetch per
 * location per tick, a hard cap on locations, and every attempt stamped so a
 * permanently broken site is retried daily rather than every five minutes.
 */
export async function runWebsiteVerification(
  repo: VerificationRepository,
  deps: VerificationSweepDeps,
  opts: { now: Date; limit: number },
): Promise<VerificationSweepResult> {
  const empty = { locationsChecked: 0, actionsConsidered: 0, actionsVerified: 0, actionsFailed: 0 };
  const locations = await repo.dueLocations(opts.limit, VERIFIABLE_KEYS);
  if (!locations.length) return empty;

  const actions = await repo.actionsForLocations(
    locations.map((l) => l.location_id),
    VERIFIABLE_KEYS,
  );
  if (!actions.length) return { ...empty, locationsChecked: locations.length };

  // One fetch per location, in parallel. A rejected fetch becomes an empty
  // result, which decideVerification reads as "we could not look" -- never as
  // "it is fixed".
  const fetched = await Promise.allSettled(
    locations.map((location) => runWebsiteChecksWithUrl(location.website_url, { fetch: deps.fetch })),
  );
  // Keyed by location id, never by position: actionsForLocations returns rows
  // in the database's order, not dueLocations', so a positional pairing would
  // silently judge an action against another location's website.
  const byLocation = new Map<string, { url: string; finalUrl: string | null; checks: WebsiteChecks }>();
  locations.forEach((location, index) => {
    const settled = fetched[index];
    const result = settled.status === "fulfilled" ? settled.value : { checks: EMPTY_WEBSITE_CHECKS, finalUrl: null };
    // OFF-SITE LANDING IS NOT EVIDENCE. `!response.ok` is not the only way to
    // reach a page that is not the owner's: a parked "domain for sale" page or
    // a registrar's soft-404 answers 200, and typically carries a <title> and
    // exactly one <h1> -- precisely the checks a `website-basics` action is
    // most often verified on. A `verified` row outranks the owner's own
    // testimony, so landing on a different host must yield no result at all
    // rather than a full one. `www.` is ignored on both sides; a same-host
    // redirect (http->https, a path change) is still the owner's site.
    const offSite = result.finalUrl !== null && !sameSiteHost(result.finalUrl, location.website_url);
    byLocation.set(location.location_id, {
      url: location.website_url,
      finalUrl: offSite ? null : result.finalUrl,
      checks: offSite ? EMPTY_WEBSITE_CHECKS : result.checks,
    });
  });

  const nowIso = opts.now.toISOString();
  // Only what the loop actually reached a decision on -- NOT the full `actions`
  // list. Stamping an action nobody looked at would hide it behind the 24-hour
  // throttle for a day, withholding a confirmation the owner has earned because
  // some unrelated action failed.
  const evaluated: Array<{ id: string; workspace_id: string }> = [];
  let actionsVerified = 0;
  let actionsFailed = 0;
  // The stamp is applied in a finally so that an escaping error still records
  // what was in fact attempted. With the per-action catch below nothing should
  // escape, but the property is worth keeping for free.
  try {
    for (const action of actions) {
      // Isolated per action, like the reclaim concern isolates per job: one
      // action's failed write must not stop the rest of the batch from being
      // looked at, and must not abort a loop whose remaining members would
      // then be stamped without having been evaluated.
      try {
        const template = findTemplate(action.template_key);
        const site = byLocation.get(action.location_id);
        const prior = asChecks(action.prior_checks);
        const decision = decideVerification(template?.verifyChecks ?? [], {
          prior,
          fresh: site?.checks ?? EMPTY_WEBSITE_CHECKS,
        });
        // Pushed BEFORE the write is attempted: we fetched this site and
        // reached a decision, so the attempt happened. If the write then fails,
        // not stamping would make the location due again on the next tick and
        // we would refetch a customer's website every five minutes because our
        // own database is unhealthy.
        evaluated.push({ id: action.id, workspace_id: action.workspace_id });
        if (decision !== "verified") continue;
        const declared = template?.verifyChecks ?? [];
        const priorPass = (key: string) => prior?.results.find((result) => result.key === key)?.pass ?? null;
        // `checks` is what the decision actually turned on -- the declared
        // checks that were FAILING in the prior snapshot -- not every declared
        // key. A check that was already passing justified nothing, and listing
        // it overstates what was confirmed. The fresh results are recorded
        // beside the prior ones because the verdict is a comparison of the
        // two: without the fresh half, the row asserts a conclusion whose
        // evidence cannot be re-derived from it.
        const decisive = declared.filter((key) => priorPass(key) === false);
        await deps.record({
          workspaceId: action.workspace_id,
          actionId: action.id,
          source: "verified",
          evidence: {
            checked_at: nowIso,
            checks: decisive,
            declared_checks: declared,
            url: site?.url ?? null,
            final_url: site?.finalUrl ?? null,
            prior_results: declared.map((key) => ({ key, pass: priorPass(key) })),
            fresh_results: declared.map((key) => ({
              key,
              pass: site?.checks.results.find((result) => result.key === key)?.pass ?? null,
            })),
          },
        });
        actionsVerified += 1;
      } catch (cause) {
        actionsFailed += 1;
        console.error("[verify/website-sweep] action not recorded", {
          category: "website_verification_action_failed",
          actionId: action.id,
          message: cause instanceof Error ? cause.message : "unknown",
        });
      }
    }
    return { locationsChecked: locations.length, actionsConsidered: evaluated.length, actionsVerified, actionsFailed };
  } finally {
    await repo.markChecked(evaluated, nowIso);
  }
}
