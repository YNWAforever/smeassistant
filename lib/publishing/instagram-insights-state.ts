import "server-only";

import { instagramInsightsEnabled } from "@/lib/publishing/flag";
import { INSTAGRAM_INSIGHTS_SCOPES } from "@/lib/publishing/instagram-connection";
import { instagramConnectionRepository, parseInstagramAccountRef } from "@/lib/repositories/instagram-connection";
import { instagramInsightsRepository, type InstagramInsightScope } from "@/lib/repositories/instagram-insights";

/**
 * What the Results page needs to show Instagram insights (P20.3): the stored
 * observations, their windows and observed times, and whether the account is
 * still connected with the insights scope. Plain data only: no token, no
 * account id, no Graph response.
 *
 * `value: null` is an unavailable metric and always carries
 * `unavailableReason`; the UI must render "Unavailable" with that reason, never
 * zero (guardrails 1 and 2). `observedAt` is the newest observation, or null
 * before the first pull.
 */
export type InstagramInsightsValue = {
  scope: InstagramInsightScope;
  mediaRef: string | null;
  metric: string;
  periodEnd: string | null;
  value: number | null;
  factType: "Observed";
  unavailableReason: string | null;
  observedAt: string;
};

export type InstagramInsightsPanel = {
  enabled: boolean;
  connectionActive: boolean;
  observedAt: string | null;
  values: InstagramInsightsValue[];
};

/** Null when the flag is off or a read fails: the page never fails because of this panel. */
export async function loadInstagramInsightsPanel(input: {
  workspaceId: string;
  enabled?: boolean;
}): Promise<InstagramInsightsPanel | null> {
  if (!(input.enabled ?? instagramInsightsEnabled())) return null;

  try {
    const rows = await instagramInsightsRepository().listLatest(input.workspaceId);
    const connection = await instagramConnectionRepository().activeConnection(input.workspaceId);
    const connectionActive = connection !== null
      && parseInstagramAccountRef(connection.accountRef) !== null
      && INSTAGRAM_INSIGHTS_SCOPES.every((scope) => connection.scopes.includes(scope));

    const values: InstagramInsightsValue[] = rows.map((row) => ({
      scope: row.scope,
      mediaRef: row.mediaRef,
      metric: row.metric,
      periodEnd: row.periodEnd,
      value: row.value,
      factType: "Observed",
      unavailableReason: row.unavailableReason,
      observedAt: row.observedAt,
    }));
    const observedAt = values.reduce<string | null>((latest, value) => (latest && Date.parse(latest) >= Date.parse(value.observedAt) ? latest : value.observedAt), null);
    return { enabled: true, connectionActive, observedAt, values };
  } catch {
    console.error("[owner/results] instagram insights unavailable", { category: "instagram_insights_panel_unavailable" });
    return null;
  }
}
