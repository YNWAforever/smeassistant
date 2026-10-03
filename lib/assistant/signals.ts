import type { Membership } from "@/lib/auth";
import type { AssistantSuggestion } from "@/lib/pocket-assistant/contracts";
import type { ActionOverview } from "@/lib/workspace/overview";
import { isOfferTemplate, templateByKey, type TemplateKey } from "@/lib/workspace/templates";

/**
 * Which questions the sheet offers on its own (P4.3, spec section 2). Pure: it
 * decides from rows the caller already read and emits ids and titles only, never
 * evidence detail or provided input values. It imports `Membership` as a type
 * only, so it stays free of server code.
 */
export type GoogleStatus = "active" | "expired" | "revoked" | "error" | null;

export type WaitingVersion = {
  id: string;
  actionId: string;
  versionNo: number;
  approvalState: "draft" | "changes_requested";
  createdAt: string;
  locationId: string | null;
};

export type SignalRows = {
  /** In the order `assistantActions` returns: highest priority first. */
  actions: ActionOverview[];
  waitingVersions: WaitingVersion[];
  google: GoogleStatus;
};

const MAX_SUGGESTIONS = 3;

/**
 * The same rule as `inLocationScope` in `lib/auth`, restated so this module has
 * no runtime dependency on it (a test pins the two together): only managers
 * with a non-null scope are restricted, and a workspace-wide row is always in scope.
 */
function inScope(actor: Pick<Membership, "role" | "locationScope">, locationId: string | null): boolean {
  if (locationId === null) return true;
  if (actor.role !== "manager") return true;
  if (actor.locationScope === null) return true;
  return actor.locationScope.includes(locationId);
}

/** Whether the member may use the controls a next step links to: not a viewer, and in scope. */
export function canAct(actor: Pick<Membership, "role" | "locationScope">, locationId: string | null): boolean {
  return actor.role !== "viewer" && inScope(actor, locationId);
}

function isOffer(action: ActionOverview): boolean {
  try {
    return isOfferTemplate(templateByKey(action.templateKey as TemplateKey));
  } catch {
    // A row naming a template this build no longer declares is not an offer.
    return false;
  }
}

/** Inputs the owner still has to give. Offer actions are excluded: their only input is the server-satisfied `offer_id`. */
export function missingInputKeys(action: ActionOverview): string[] {
  if (action.actionState !== "needs_input" || isOffer(action)) return [];
  return action.missingInputs.filter((key) => key !== "offer_id");
}

function oldestFirst(a: WaitingVersion, b: WaitingVersion): number {
  return Date.parse(a.createdAt) - Date.parse(b.createdAt) || 0;
}

export function buildSuggestions(input: {
  membership: Membership;
  locationId?: string;
  focusedActionId?: string;
  focusedVersionId?: string;
  rows: SignalRows;
}): AssistantSuggestion[] {
  const { membership, rows } = input;
  const base = (): { workspaceId: string; locationId?: string } =>
    input.locationId ? { workspaceId: membership.workspaceId, locationId: input.locationId } : { workspaceId: membership.workspaceId };
  const titleOf = (actionId: string) => rows.actions.find((a) => a.id === actionId)?.title;
  const out: AssistantSuggestion[] = [];

  // 1. Missing inputs: the focused action, else the highest priority one.
  const needing = rows.actions.filter((a) => inScope(membership, a.location.id) && missingInputKeys(a).length > 0);
  const needy = needing.find((a) => a.id === input.focusedActionId) ?? needing[0];
  if (needy) {
    out.push({
      id: `missing_inputs:${needy.id}`,
      kind: "missing_inputs",
      intentId: "explain_missing_inputs",
      label: { actionTitle: needy.title },
      context: { ...base(), actionId: needy.id },
      ...(canAct(membership, needy.location.id) ? { nextStep: { kind: "provide_inputs" as const, actionId: needy.id } } : {}),
    });
  }

  // 2. A version waiting for review: the focused version, else a version of the
  // focused action, else the oldest.
  const waiting = rows.waitingVersions.filter((v) => inScope(membership, v.locationId)).sort(oldestFirst);
  const pick =
    waiting.find((v) => v.id === input.focusedVersionId) ??
    waiting.find((v) => v.actionId === input.focusedActionId) ??
    waiting[0];
  if (pick) {
    const title = titleOf(pick.actionId);
    out.push({
      id: `review_version:${pick.id}`,
      kind: "review_version",
      intentId: "where_to_continue",
      label: title ? { actionTitle: title } : {},
      context: { ...base(), actionId: pick.actionId, versionId: pick.id },
      ...(canAct(membership, pick.locationId) ? { nextStep: { kind: "review_version" as const, actionId: pick.actionId, versionId: pick.id } } : {}),
    });
  }

  // 3. Google needs attention. Integrations settings are owner-only.
  if (membership.role === "owner" && (rows.google === null || rows.google === "expired" || rows.google === "revoked" || rows.google === "error")) {
    out.push({
      id: `google:${rows.google ?? "none"}`,
      kind: "google",
      intentId: "where_to_continue",
      label: {},
      context: base(),
      nextStep: { kind: "open_integrations" },
    });
  }

  return out.slice(0, MAX_SUGGESTIONS);
}
