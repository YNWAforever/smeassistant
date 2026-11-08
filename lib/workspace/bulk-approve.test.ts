import { describe, expect, it } from "vitest"

import type { Membership } from "@/lib/auth"
import { buildActionOverview, type ActionRow } from "@/lib/workspace/overview"
import type { VersionRow } from "@/lib/workspace/queries-pages"
import { bulkApproveItems, isBulkApprovable } from "./bulk-approve"

const owner: Membership = { workspaceId: "w", workspaceSlug: "shop", userId: "u", email: "o@example.test", role: "owner", locationScope: null }
const row = (overrides: Partial<ActionRow> = {}): ActionRow => ({
  id: "a1", workspace_id: "w", location_id: "loc-1", template_key: "review-response", source: "finding", source_finding_keys: [],
  title: { en: "Reply" }, summary: {}, evidence: {}, priority: "high", priority_score: 50, priority_factors: [], effort_minutes: 10,
  required_inputs: [], provided_inputs: {}, assignee_user_id: null, due_at: null, action_state: "in_progress", measurement_state: "not_eligible",
  capability: "Live", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", ...overrides,
})
const draft = (actionId = "a1", overrides: Partial<VersionRow> = {}): VersionRow => ({
  id: `v-${actionId}`, action_id: actionId, version_no: 2, body: "Thank you for visiting", alt_text: null, author_type: "agent", author_user_id: null,
  approval_state: "draft", delivery_state: "not_requested", approved_at: null, reviewer_comment: null, created_at: "2026-10-02T00:00:00Z",
  first_exported_at: null, origin: "agent", agentKey: null, checked: false, guardrails: [], agentNotes: [], acceptanceCriteria: [], offerRevision: null, ...overrides,
} as VersionRow)
const overview = (rowOverrides: Partial<ActionRow> = {}, version: VersionRow | null = draft(rowOverrides.id ?? "a1")) =>
  buildActionOverview(row(rowOverrides), { location: { id: rowOverrides.location_id === undefined ? "loc-1" : rowOverrides.location_id, slug: "yik-yam", name: { en: "Yik Yam", "zh-HK": "Yik Yam", "zh-TW": "Yik Yam" } }, latestRun: null, latestVersion: version })

describe("bulk approve eligibility", () => {
  it("offers review replies and social posts whose latest version is a draft", () => {
    expect(isBulkApprovable(overview(), owner)).toBe(true)
    expect(isBulkApprovable(overview({ template_key: "social-post" }), owner)).toBe(true)
  })

  it.each(["gbp-post", "visibility-content", "website-basics"])("never offers %s", (template_key) => {
    expect(isBulkApprovable(overview({ template_key }), owner)).toBe(false)
  })

  it("never offers to viewers, or to a manager outside the action's location", () => {
    expect(isBulkApprovable(overview(), { ...owner, role: "viewer" })).toBe(false)
    expect(isBulkApprovable(overview(), { ...owner, role: "manager", locationScope: ["loc-2"] })).toBe(false)
    expect(isBulkApprovable(overview(), { ...owner, role: "manager", locationScope: ["loc-1"] })).toBe(true)
  })

  it("skips closed actions, missing facts and versions that are not drafts", () => {
    expect(isBulkApprovable(overview({ action_state: "completed" }), owner)).toBe(false)
    expect(isBulkApprovable(overview({ required_inputs: ["brand_voice"] }), owner)).toBe(false)
    for (const approval_state of ["approved", "changes_requested", "rejected", "superseded"] as const) {
      expect(isBulkApprovable(overview({}, draft("a1", { approval_state })), owner)).toBe(false)
    }
    expect(isBulkApprovable(overview({}, null), owner)).toBe(false)
  })
})

describe("bulkApproveItems", () => {
  it("carries the full text of the latest draft", () => {
    const items = bulkApproveItems([overview()], owner, [draft("a1"), draft("a1", { id: "old", version_no: 1, body: "old" })])
    expect(items).toEqual([{ actionId: "a1", versionId: "v-a1", versionNo: 2, title: { en: "Reply" }, body: "Thank you for visiting" }])
  })

  it("drops a draft with a guardrail warning, or one that is no longer the latest", () => {
    expect(bulkApproveItems([overview()], owner, [draft("a1", { guardrails: [{ code: "superlative" }] as never })])).toEqual([])
    expect(bulkApproveItems([overview()], owner, [draft("a1", { id: "newer", version_no: 3 })])).toEqual([])
  })
})
