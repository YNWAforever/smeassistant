import "server-only";

import {
  InstagramGraphError,
  getAccountInsights,
  getMediaInsights,
  listRecentMedia,
  type InstagramInsightPoint,
  type InstagramRecentMedia,
} from "@/lib/oauth/instagram-graph";
import { INSTAGRAM_INSIGHTS_SCOPES, withInstagramAccessToken, InstagramConnectionError } from "@/lib/publishing/instagram-connection";
import {
  instagramInsightsRepository,
  type InstagramInsightInsert,
  type InstagramInsightScope,
} from "@/lib/repositories/instagram-insights";

/**
 * The on-demand Instagram insights pull (Phase 20 P20.3).
 *
 * Reads the connected account's last 7 days of daily account metrics and the
 * newest five media items' lifetime metrics, then stores one row per metric
 * per window/media. A metric Meta did not return (or refused) becomes a row
 * with `value: null` and an explicit reason, never a zero. The connection is
 * read and refreshed through the same sealed-token helper as publishing, with
 * the insights scope pair (`instagram_basic` + `instagram_manage_insights`).
 *
 * Failure contract: a missing/expired connection is `ok: false` and writes
 * nothing; every other Graph refusal is recorded as unavailable rows so the
 * page can show why. An `unauthorized` from the token helper is rethrown so it
 * can refresh once and expire the row, exactly like publishing.
 */
export const INSTAGRAM_ACCOUNT_METRICS = ["impressions", "reach", "profile_views"] as const;
export const INSTAGRAM_MEDIA_METRICS = ["impressions", "reach", "likes", "comments", "shares", "saved"] as const;
export const INSTAGRAM_INSIGHT_WINDOW_DAYS = 7;
export const INSTAGRAM_INSIGHTS_RECENT_MEDIA = 5;
/** Retention chosen in the plan (§9 decision 6): observations older than a year are removed on the next pull. */
export const INSTAGRAM_INSIGHTS_RETENTION_DAYS = 365;

export type InstagramInsightsUnavailableReason = "missing_permission" | "not_supported" | "provider_error" | "no_data";

export type PullInstagramInsightsResult =
  | {
      ok: true;
      accountRef: string;
      inserted: number;
      unavailable: number;
      observedAt: string;
      mediaScanned: number;
      /** Why the media list itself could not be read, when it could not. */
      mediaUnavailable: InstagramInsightsUnavailableReason | null;
    }
  | { ok: false; reason: "connection_missing" | "connection_expired" };

type GraphDeps = {
  getAccountInsights?: typeof getAccountInsights;
  getMediaInsights?: typeof getMediaInsights;
  listRecentMedia?: typeof listRecentMedia;
};

export type PullInstagramInsightsDeps = {
  repository?: {
    insertMany(workspaceId: string, rows: InstagramInsightInsert[]): Promise<number>;
    deleteOlderThan?(workspaceId: string, cutoffIso: string): Promise<number>;
  };
  graph?: GraphDeps;
  withToken?: typeof withInstagramAccessToken;
  now?: () => number;
};

/** A Graph refusal as the owner-facing unavailable reason; never the raw message. */
function unavailableReason(error: unknown): InstagramInsightsUnavailableReason {
  if (error instanceof InstagramGraphError) {
    if (error.code === "forbidden") return "missing_permission";
    if (error.code === "invalid_request" || error.code === "not_found") return "not_supported";
  }
  return "provider_error";
}

const unavailableRow = (
  accountRef: string,
  scope: InstagramInsightScope,
  mediaRef: string | null,
  metric: string,
  reason: InstagramInsightsUnavailableReason,
): InstagramInsightInsert => ({
  accountRef,
  scope,
  mediaRef,
  metric,
  periodStart: null,
  periodEnd: null,
  value: null,
  unavailableReason: reason,
});

/** One row per returned point; a null point value is stored as unavailable `no_data`. */
function pointRows(accountRef: string, scope: InstagramInsightScope, mediaRef: string | null, metric: string, points: InstagramInsightPoint[]): InstagramInsightInsert[] {
  if (points.length === 0) return [unavailableRow(accountRef, scope, mediaRef, metric, "no_data")];
  return points.map((point) => ({
    accountRef,
    scope,
    mediaRef,
    metric,
    periodStart: null,
    periodEnd: point.endTime,
    value: point.value,
    unavailableReason: point.value === null ? "no_data" : null,
  }));
}

export async function pullInstagramInsights(
  input: { workspaceId: string },
  deps: PullInstagramInsightsDeps = {},
): Promise<PullInstagramInsightsResult> {
  const repository = deps.repository ?? instagramInsightsRepository();
  const graph = {
    getAccountInsights: deps.graph?.getAccountInsights ?? getAccountInsights,
    getMediaInsights: deps.graph?.getMediaInsights ?? getMediaInsights,
    listRecentMedia: deps.graph?.listRecentMedia ?? listRecentMedia,
  };
  const withToken = deps.withToken ?? withInstagramAccessToken;
  const now = deps.now ?? Date.now;

  try {
    return await withToken(
      input.workspaceId,
      async (accessToken, account): Promise<PullInstagramInsightsResult> => {
        const observedAt = new Date(now()).toISOString();
        const rows: InstagramInsightInsert[] = [];

        // Account metrics: daily points over the last week.
        try {
          const points = await graph.getAccountInsights(accessToken, account.id, {
            metrics: INSTAGRAM_ACCOUNT_METRICS,
            period: "day",
            since: Math.floor(now() / 1000) - INSTAGRAM_INSIGHT_WINDOW_DAYS * 24 * 60 * 60,
            until: Math.floor(now() / 1000),
          });
          for (const metric of INSTAGRAM_ACCOUNT_METRICS) {
            rows.push(...pointRows(account.id, "account", null, metric, points.filter((point) => point.metric === metric)));
          }
        } catch (error) {
          if (error instanceof InstagramGraphError && error.code === "unauthorized") throw error;
          const reason = unavailableReason(error);
          for (const metric of INSTAGRAM_ACCOUNT_METRICS) rows.push(unavailableRow(account.id, "account", null, metric, reason));
        }

        // Per-media metrics: the newest few items; one row per metric per item.
        let mediaScanned = 0;
        let mediaUnavailable: InstagramInsightsUnavailableReason | null = null;
        let media: InstagramRecentMedia[] = [];
        try {
          media = await graph.listRecentMedia(accessToken, account.id, { limit: INSTAGRAM_INSIGHTS_RECENT_MEDIA });
          mediaScanned = media.length;
        } catch (error) {
          if (error instanceof InstagramGraphError && error.code === "unauthorized") throw error;
          mediaUnavailable = unavailableReason(error);
        }
        for (const item of media) {
          try {
            const points = await graph.getMediaInsights(accessToken, item.id, INSTAGRAM_MEDIA_METRICS);
            for (const metric of INSTAGRAM_MEDIA_METRICS) {
              rows.push(...pointRows(account.id, "media", item.id, metric, points.filter((point) => point.metric === metric)));
            }
          } catch (error) {
            if (error instanceof InstagramGraphError && error.code === "unauthorized") throw error;
            const reason = unavailableReason(error);
            for (const metric of INSTAGRAM_MEDIA_METRICS) rows.push(unavailableRow(account.id, "media", item.id, metric, reason));
          }
        }

        const inserted = await repository.insertMany(input.workspaceId, rows);
        // Retention (P20.4): no scheduler, so each pull prunes this workspace's
        // observations older than the decided 12 months. A failed prune never
        // fails the pull; the stored observations stay readable.
        try {
          const cutoff = new Date(now() - INSTAGRAM_INSIGHTS_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
          await repository.deleteOlderThan?.(input.workspaceId, cutoff);
        } catch {
          console.error("[instagram-insights] retention prune failed", { category: "instagram_insights_retention_failed" });
        }
        return {
          ok: true,
          accountRef: account.id,
          inserted,
          unavailable: rows.filter((row) => row.value === null).length,
          observedAt,
          mediaScanned,
          mediaUnavailable,
        };
      },
      { requiredScopes: INSTAGRAM_INSIGHTS_SCOPES },
    );
  } catch (error) {
    if (error instanceof InstagramConnectionError) return { ok: false, reason: error.code };
    throw error;
  }
}
