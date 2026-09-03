import { describe, expect, it } from "vitest"

import { ASSISTANT_RUN_ENDPOINT, buildAssistantRequest } from "@/lib/pocket-assistant/request"

const context = { workspaceId: "ws-1", locationId: "loc-1", snapshotId: "snap-1", actionId: "act-1", versionId: "ver-1" }

describe("buildAssistantRequest", () => {
  it("posts to the shared assistant route", () => {
    expect(ASSISTANT_RUN_ENDPOINT).toBe("/api/assistant/run")
  })

  it("demo mode ignores any context it is given", () => {
    expect(buildAssistantRequest("demo", "sample", "explain_priority", "zh-HK", context)).toEqual({
      mode: "demo",
      surface: "sample",
      intentId: "explain_priority",
      locale: "zh-HK",
    })
  })

  it("live mode includes the full context", () => {
    expect(buildAssistantRequest("live", "action", "friendlier_review_reply", "en", context)).toEqual({
      mode: "live",
      surface: "action",
      intentId: "friendlier_review_reply",
      locale: "en",
      context,
    })
  })

  it("live mode drops undefined optional ids but keeps the workspace id", () => {
    const body = buildAssistantRequest("live", "home", "fallback_plan", "zh-TW", { workspaceId: "ws-1", locationId: undefined })
    expect(body.context).toEqual({ workspaceId: "ws-1" })
    expect("locationId" in (body.context ?? {})).toBe(false)
  })

  it("live mode without a context sends no context (the route answers 400)", () => {
    expect(buildAssistantRequest("live", "create", "generate_social", "en")).toEqual({
      mode: "live",
      surface: "create",
      intentId: "generate_social",
      locale: "en",
    })
  })

  it("passes surface and intent through untouched", () => {
    for (const surface of ["report", "insights", "assets", "rescan", "workspace"] as const) {
      expect(buildAssistantRequest("demo", surface, "explain_limits", "en").surface).toBe(surface)
    }
    expect(buildAssistantRequest("live", "actions", "compare_priorities", "en", { workspaceId: "w" }).intentId).toBe("compare_priorities")
  })
})
