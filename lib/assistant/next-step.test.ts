import { describe, expect, it } from "vitest"

import { nextStepHref } from "@/lib/assistant/next-step"
import type { AssistantNextStep } from "@/lib/pocket-assistant/contracts"

const A = "11111111-1111-4111-8111-111111111111"
const V = "22222222-2222-4222-8222-222222222222"
const base = "/zh-HK/owner/kam-man"

describe("nextStepHref", () => {
  it.each([
    [{ kind: "provide_inputs", actionId: A }, `${base}/actions/${A}#inputs`],
    [{ kind: "review_version", actionId: A, versionId: V }, `${base}/actions/${A}?version=${V}`],
    [{ kind: "open_integrations" }, `${base}/settings/integrations`],
    [{ kind: "open_action", actionId: A }, `${base}/actions/${A}`],
    [{ kind: "open_actions" }, `${base}/actions`],
  ])("maps %o", (step, href) => expect(nextStepHref(base, step as AssistantNextStep)).toBe(href))

  it("keeps ?location= before the fragment", () => {
    expect(nextStepHref(base, { kind: "provide_inputs", actionId: A }, "tin-hau")).toBe(`${base}/actions/${A}?location=tin-hau#inputs`)
    expect(nextStepHref(base, { kind: "review_version", actionId: A, versionId: V }, "tin-hau")).toBe(`${base}/actions/${A}?version=${V}&location=tin-hau`)
    expect(nextStepHref(base, { kind: "open_actions" }, "tin-hau")).toBe(`${base}/actions?location=tin-hau`)
  })

  it("encodes the location", () => {
    expect(nextStepHref(base, { kind: "open_actions" }, "a b&c")).toBe(`${base}/actions?location=a%20b%26c`)
  })

  it("returns null for a missing or non-UUID id", () => {
    expect(nextStepHref(base, { kind: "provide_inputs" })).toBeNull()
    expect(nextStepHref(base, { kind: "review_version", actionId: A })).toBeNull()
    expect(nextStepHref(base, { kind: "review_version", versionId: V })).toBeNull()
    expect(nextStepHref(base, { kind: "open_action", actionId: "../billing" })).toBeNull()
    expect(nextStepHref(base, { kind: "review_version", actionId: A, versionId: "x?y" })).toBeNull()
  })
})
