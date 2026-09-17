import 'server-only';
import type { Pool } from 'pg';
import { getPool } from '../db/client';
import type { WebsiteChecks } from '../website/checks';

export interface VerifiableLocation {
  location_id: string;
  website_url: string;
}

export interface VerifiableAction {
  id: string;
  workspace_id: string;
  location_id: string;
  template_key: string;
  prior_checks: WebsiteChecks | null;
}

export interface VerificationRepository {
  /**
   * Distinct locations with at least one eligible action, ordered so that
   * a location with any never-checked eligible action always wins over one
   * where every eligible action has already been checked -- regardless of
   * how recently the checked ones were checked. Within each of those two
   * groups, oldest-checked (or all-null) first, so nothing starves.
   *
   * This is NOT simply `min(verification_checked_at) ASC NULLS FIRST`: SQL
   * aggregates ignore NULL inputs, so `min()` over a location with one
   * never-checked action and one checked action returns the checked
   * timestamp, not NULL -- the NULLS FIRST clause never fires for that row,
   * and it can sort behind a fully-checked location whose oldest check is
   * older still. `bool_or(verification_checked_at IS NULL)` is what actually
   * detects "this location still has unchecked work"; `min()` is only the
   * tiebreaker once that is decided.
   *
   * `templateKeys` is the set that declares `verifyChecks`, passed in by the
   * caller: keeping domain tables out of the SQL layer is why
   * applications.ts reads the way it does.
   */
  dueLocations(limit: number, templateKeys: string[]): Promise<VerifiableLocation[]>;
  /** Every eligible action for these locations, with its source snapshot's checks. */
  actionsForLocations(locationIds: string[], templateKeys: string[]): Promise<VerifiableAction[]>;
  /**
   * Stamp the attempt, whatever its outcome. Takes (id, workspace_id) pairs,
   * not bare ids: this file's neighbour applications.ts never trusts an id
   * alone to imply a tenant, and here the pairing also guards against a
   * caller accidentally handing back an id from a different sweep pass.
   */
  markChecked(actions: Array<{ id: string; workspace_id: string }>, nowIso: string): Promise<void>;
}

/**
 * Eligibility, shared by both selection queries so they cannot drift:
 *
 * - the template can be verified at all (the caller passes the key list)
 * - the location has a website to fetch
 * - the action has a source snapshot to read a prior result from
 * - the owner ENGAGED: exported an approved version, or has a live assertion.
 *   The four-event model's third event is "provider verifies APPLIED" --
 *   without engagement there is no claim to corroborate, and a third party's
 *   change to the site would be recorded as the owner's applied work.
 * - it is not already verified (append-only evidence, not a site monitor)
 * - the 24h throttle has expired
 *
 * Positional contract: this fragment references `$1` for `templateKeys`.
 * Any query that embeds it must bind `templateKeys` as its first parameter
 * -- `actionsForLocations` binds location ids as `$2` for exactly this
 * reason, rather than the more natural `$1`, so both callers can share this
 * text unmodified.
 */
const ELIGIBLE = `
  a.template_key = ANY($1::text[])
  AND l.website_url IS NOT NULL AND btrim(l.website_url) <> ''
  AND a.source_snapshot_id IS NOT NULL
  AND (a.verification_checked_at IS NULL OR a.verification_checked_at < now() - interval '24 hours')
  AND NOT EXISTS (
    SELECT 1 FROM action_applications p
    WHERE p.action_id = a.id AND p.workspace_id = a.workspace_id
      AND p.source = 'verified' AND p.retracted_at IS NULL)
  AND (
    EXISTS (
      SELECT 1 FROM output_versions v
      WHERE v.action_id = a.id AND v.workspace_id = a.workspace_id
        AND v.first_exported_at IS NOT NULL)
    OR EXISTS (
      SELECT 1 FROM action_applications p
      WHERE p.action_id = a.id AND p.workspace_id = a.workspace_id
        AND p.source = 'owner_asserted' AND p.retracted_at IS NULL)
  )`;

export function verificationRepository(client?: Pick<Pool, 'query'>): VerificationRepository {
  const db = () => client ?? getPool();
  return {
    async dueLocations(limit, templateKeys) {
      if (!templateKeys.length) return [];
      return (await db().query<VerifiableLocation>(
        `SELECT a.location_id, l.website_url
         FROM actions a JOIN locations l ON l.id = a.location_id AND l.workspace_id = a.workspace_id
         WHERE ${ELIGIBLE}
         GROUP BY a.location_id, l.website_url
         ORDER BY bool_or(a.verification_checked_at IS NULL) DESC,
                  min(a.verification_checked_at) ASC NULLS FIRST,
                  a.location_id
         LIMIT $2`,
        [templateKeys, limit],
      )).rows;
    },
    async actionsForLocations(locationIds, templateKeys) {
      if (!locationIds.length || !templateKeys.length) return [];
      return (await db().query<VerifiableAction>(
        `SELECT a.id, a.workspace_id, a.location_id, a.template_key, s.website_checks AS prior_checks
         FROM actions a
         JOIN locations l ON l.id = a.location_id AND l.workspace_id = a.workspace_id
         JOIN scan_snapshots s ON s.id = a.source_snapshot_id AND s.workspace_id = a.workspace_id
         WHERE a.location_id = ANY($2::uuid[]) AND ${ELIGIBLE}`,
        [templateKeys, locationIds],
      )).rows;
    },
    async markChecked(actions, nowIso) {
      if (!actions.length) return;
      // A join against a VALUES list, not `id = ANY($1)`: an id alone does
      // not imply a tenant in this codebase, so the workspace_id the caller
      // read the action under must match the row being stamped.
      await db().query(
        `UPDATE actions a SET verification_checked_at = $2
         FROM (SELECT * FROM unnest($1::uuid[], $3::uuid[]) AS t(id, workspace_id)) pairs
         WHERE a.id = pairs.id AND a.workspace_id = pairs.workspace_id`,
        [actions.map((a) => a.id), nowIso, actions.map((a) => a.workspace_id)],
      );
    },
  };
}
