import type { VerificationRepository } from "@/lib/repositories/verification";
import { TEMPLATES, findTemplate } from "@/lib/workspace/templates";
import { EMPTY_WEBSITE_CHECKS, runWebsiteChecks, type WebsiteChecks } from "@/lib/website/checks";
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
  actionsVerified: number;
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
  const locations = await repo.dueLocations(opts.limit, VERIFIABLE_KEYS);
  if (!locations.length) return { locationsChecked: 0, actionsVerified: 0 };

  const actions = await repo.actionsForLocations(
    locations.map((l) => l.location_id),
    VERIFIABLE_KEYS,
  );
  if (!actions.length) return { locationsChecked: locations.length, actionsVerified: 0 };

  // One fetch per location, in parallel. A rejected fetch becomes an empty
  // result, which decideVerification reads as "we could not look" -- never as
  // "it is fixed".
  const fetched = await Promise.allSettled(
    locations.map((location) => runWebsiteChecks(location.website_url, { fetch: deps.fetch })),
  );
  // Keyed by location id, never by position: actionsForLocations returns rows
  // in the database's order, not dueLocations', so a positional pairing would
  // silently judge an action against another location's website.
  const byLocation = new Map<string, { url: string; checks: WebsiteChecks }>();
  locations.forEach((location, index) => {
    const settled = fetched[index];
    byLocation.set(location.location_id, {
      url: location.website_url,
      checks: settled.status === "fulfilled" ? settled.value : EMPTY_WEBSITE_CHECKS,
    });
  });

  const nowIso = opts.now.toISOString();
  // Stamped for every action looked at, verified or not, and in a finally so a
  // failing write still records the attempt: the stamp records the attempt, not
  // the outcome. An action fetched but not stamped is retried in five minutes
  // instead of a day -- that is the hammering failure mode.
  try {
    let actionsVerified = 0;
    for (const action of actions) {
      const template = findTemplate(action.template_key);
      const site = byLocation.get(action.location_id);
      const prior = asChecks(action.prior_checks);
      const decision = decideVerification(template?.verifyChecks ?? [], {
        prior,
        fresh: site?.checks ?? EMPTY_WEBSITE_CHECKS,
      });
      if (decision !== "verified") continue;
      await deps.record({
        workspaceId: action.workspace_id,
        actionId: action.id,
        source: "verified",
        evidence: {
          checked_at: nowIso,
          checks: template?.verifyChecks ?? [],
          url: site?.url ?? null,
          prior_results: (template?.verifyChecks ?? []).map((key) => ({
            key,
            pass: prior?.results.find((result) => result.key === key)?.pass ?? null,
          })),
        },
      });
      actionsVerified += 1;
    }
    return { locationsChecked: locations.length, actionsVerified };
  } finally {
    await repo.markChecked(
      actions.map((action) => ({ id: action.id, workspace_id: action.workspace_id })),
      nowIso,
    );
  }
}
