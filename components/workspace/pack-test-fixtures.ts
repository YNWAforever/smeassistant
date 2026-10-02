import type { ActionState, ApprovalState, DeliveryState, RunState } from "@/lib/domain"
import { buildActionOverview, type ActionOverview, type ActionRow } from "@/lib/workspace/overview"
import { buildPackOverview, STARTER_PACK, type PackOverview, type StarterItemKey, type WorkPack } from "@/lib/workspace/packs-model"

/** Test-only builders for the pack components (never imported by application code). */
const lt = (s: string) => ({ en: s, "zh-HK": s, "zh-TW": s })

export interface ItemSpec {
  actionState?: ActionState
  run?: RunState
  version?: { approval: ApprovalState; delivery?: DeliveryState }
}

export function actionFor(id: string, templateKey: StarterItemKey, spec: ItemSpec = {}): ActionOverview {
  const row: ActionRow = {
    id,
    workspace_id: "ws-1",
    location_id: null,
    template_key: templateKey,
    source: "owner_objective",
    source_finding_keys: [],
    title: lt(`Title of ${templateKey}`),
    summary: lt("summary"),
    evidence: { factType: "Recommended", source: "Visibility starter pack", value: "", detail: lt("d"), observedAt: "2026-10-01T00:00:00Z", freshness: lt("f") },
    priority: "medium",
    priority_score: 50,
    priority_factors: [],
    effort_minutes: 10,
    required_inputs: [],
    provided_inputs: {},
    assignee_user_id: null,
    due_at: null,
    action_state: spec.actionState ?? "recommended",
    measurement_state: "not_eligible",
    capability: "Live",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  }
  return buildActionOverview(row, {
    location: null,
    latestRun: spec.run ? { state: spec.run } : null,
    latestVersion: spec.version
      ? { id: `${id}-v1`, version_no: 1, approval_state: spec.version.approval, delivery_state: spec.version.delivery ?? "not_requested" }
      : null,
  })
}

/** A pack over the three starter items, `specs` given in position order. Ids are `act-1..3`. */
export function packOf(specs: [ItemSpec?, ItemSpec?, ItemSpec?] = [], opts: { closedAt?: string | null; id?: string } = {}): PackOverview {
  const pack: WorkPack = {
    id: opts.id ?? "pack-1",
    workspaceId: "ws-1",
    locationId: null,
    kind: STARTER_PACK.kind,
    createdAt: "2026-10-02T00:00:00Z",
    closedAt: opts.closedAt ?? null,
  }
  return buildPackOverview(
    pack,
    STARTER_PACK.items.map((templateKey, index) => ({
      templateKey,
      position: (index + 1) as 1 | 2 | 3,
      action: actionFor(`act-${index + 1}`, templateKey, specs[index]),
    })),
  )
}
