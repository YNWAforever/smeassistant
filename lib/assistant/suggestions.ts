import type { Membership } from "@/lib/auth";
import { localized } from "@/lib/domain";
import type { AssistantContext, AssistantSuggestion } from "@/lib/pocket-assistant/contracts";
import type { LiveAssistantRepository } from "@/lib/repositories/artifacts";
import { buildActionOverview } from "@/lib/workspace/overview";

import { AssistantAccessError } from "./errors";
import { buildSuggestions, type SignalRows } from "./signals";

/**
 * Reads the rows `buildSuggestions` decides from (P4.3). Everything here is a
 * read: it writes nothing and calls no model.
 */
export type SignalRepository = Pick<
  LiveAssistantRepository,
  "assistantLocations" | "assistantActions" | "assistantWaitingVersions" | "assistantGoogleConnection"
>;

const OPEN_STATES = ["recommended", "needs_input", "ready", "in_progress"] as const;

export async function loadSignalRows(db: SignalRepository, workspaceId: string, locationId: string | null): Promise<SignalRows> {
  const [locations, actionRows, waiting, google] = await Promise.all([
    db.assistantLocations(workspaceId),
    db.assistantActions(workspaceId, { locationId, states: [...OPEN_STATES] }),
    db.assistantWaitingVersions(workspaceId, locationId),
    db.assistantGoogleConnection(workspaceId),
  ]);
  // Same overview construction as `overviewOf` in live.ts: no run or version context is needed here.
  const actions = actionRows.map((row) => {
    const location = locations.find((l) => l.id === row.location_id) ?? null;
    return buildActionOverview(row, {
      location: location ? { id: location.id, slug: location.slug, name: localized(location.name, location.name) } : null,
      latestRun: null,
      latestVersion: null,
    });
  });
  return {
    actions,
    waitingVersions: waiting.map((v) => ({
      id: v.id,
      actionId: v.action_id,
      versionNo: v.version_no,
      approvalState: v.approval_state,
      createdAt: v.created_at,
      locationId: v.location_id,
    })),
    google: google?.status ?? null,
  };
}

export async function loadSuggestions(input: {
  db: SignalRepository & Pick<LiveAssistantRepository, "actionScope" | "versionScope">;
  membership: Membership;
  context: AssistantContext;
}): Promise<AssistantSuggestion[]> {
  const { db, membership, context } = input;
  const workspaceId = context.workspaceId;
  const locations = await db.assistantLocations(workspaceId);
  if (context.locationId && !locations.some((l) => l.id === context.locationId)) throw new AssistantAccessError("not_found");
  const locationId = context.locationId ?? locations.find((l) => l.is_primary)?.id ?? locations[0]?.id ?? null;

  if (context.actionId) {
    const scope = await db.actionScope(context.actionId);
    if (!scope || scope.workspaceId !== workspaceId) throw new AssistantAccessError("not_found");
  }
  if (context.versionId) {
    const scope = await db.versionScope(context.versionId);
    if (!scope || scope.workspaceId !== workspaceId || (context.actionId && scope.actionId !== context.actionId)) {
      throw new AssistantAccessError("not_found");
    }
  }

  const rows = await loadSignalRows(db, workspaceId, locationId);
  return buildSuggestions({
    membership,
    locationId: locationId ?? undefined,
    focusedActionId: context.actionId,
    focusedVersionId: context.versionId,
    rows,
  });
}
