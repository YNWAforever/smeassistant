import { describe, expect, it } from "vitest";

import { inLocationScope, type Membership } from "@/lib/auth";
import { buildActionOverview, type ActionOverview, type ActionRow } from "@/lib/workspace/overview";

import { ACTION_ID, LOCATION_ID, WORKSPACE_ID, actionRow } from "./__fixtures__";
import { buildSuggestions, canAct, missingInputKeys, type SignalRows, type WaitingVersion } from "./signals";

const L1 = LOCATION_ID;
const L2 = "99999999-9999-4999-8999-999999999999";
const NEED_ID = ACTION_ID;
const OTHER_ID = "44444444-4444-4444-8444-444444444444";
const V1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const V2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const V3 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";

const owner: Membership = { workspaceId: WORKSPACE_ID, workspaceSlug: "ws", userId: "u1", email: "o@example.com", role: "owner", locationScope: null };
const manager: Membership = { ...owner, role: "manager" };
const viewer: Membership = { ...owner, role: "viewer" };

function make(id: string, patch: Partial<ActionRow> = {}, locationId: string | null = L1): ActionOverview {
  const row: ActionRow = { ...actionRow, id, location_id: locationId, ...patch };
  return buildActionOverview(row, {
    location: locationId ? { id: locationId, slug: "yik-yam", name: { en: "Yik Yam", "zh-HK": "奕蔭街", "zh-TW": "奕蔭街" } } : null,
    latestRun: null,
    latestVersion: null,
  });
}

const need = make(NEED_ID, { action_state: "needs_input", required_inputs: ["opening_hours"], provided_inputs: {} });
const other = make(OTHER_ID, { action_state: "needs_input", required_inputs: ["menu_items"], provided_inputs: {}, priority_score: 10 });

function version(id: string, actionId: string, createdAt: string, patch: Partial<WaitingVersion> = {}): WaitingVersion {
  return { id, actionId, versionNo: 1, approvalState: "draft", createdAt, locationId: L1, ...patch };
}

const v1 = version(V1, NEED_ID, "2026-09-01T00:00:00Z");

function rows(patch: Partial<SignalRows> = {}): SignalRows {
  return { actions: [need, other], waitingVersions: [v1], google: "expired", ...patch };
}

describe("canAct", () => {
  const cases: Array<[string, Pick<Membership, "role" | "locationScope">, string | null]> = [
    ["owner at a location", { role: "owner", locationScope: null }, L1],
    ["owner workspace-wide", { role: "owner", locationScope: null }, null],
    ["manager, null scope", { role: "manager", locationScope: null }, L1],
    ["manager, in scope", { role: "manager", locationScope: [L1] }, L1],
    ["manager, out of scope", { role: "manager", locationScope: [L2] }, L1],
    ["manager, workspace-wide", { role: "manager", locationScope: [L2] }, null],
    ["viewer", { role: "viewer", locationScope: null }, L1],
  ];
  it.each(cases)("agrees with inLocationScope for %s (viewers never act)", (_name, actor, loc) => {
    const full = { ...owner, ...actor };
    expect(canAct(actor, loc)).toBe(actor.role !== "viewer" && inLocationScope(full, loc));
  });
});

describe("missingInputKeys", () => {
  it("lists missing inputs of a needs_input action", () => {
    expect(missingInputKeys(need)).toEqual(["opening_hours"]);
  });
  it("is empty unless the action needs input", () => {
    expect(missingInputKeys(make(NEED_ID, { action_state: "ready", required_inputs: ["opening_hours"], provided_inputs: {} }))).toEqual([]);
  });
  it("drops offer_id and is empty for offer templates", () => {
    const offer = make(NEED_ID, { template_key: "offer-instagram-post", action_state: "needs_input", required_inputs: ["offer_id", "brand_voice"], provided_inputs: {} });
    expect(missingInputKeys(offer)).toEqual([]);
  });
  it("tolerates an unknown template key", () => {
    expect(missingInputKeys(make(NEED_ID, { template_key: "retired-template", action_state: "needs_input", required_inputs: ["x"], provided_inputs: {} }))).toEqual(["x"]);
  });
});

describe("buildSuggestions", () => {
  it("orders missing inputs, review version, Google and caps at 3", () => {
    const out = buildSuggestions({ membership: owner, locationId: L1, rows: rows() });
    expect(out.map((s) => s.id)).toEqual([`missing_inputs:${NEED_ID}`, `review_version:${V1}`, "google:expired"]);
    expect(out.map((s) => s.kind)).toEqual(["missing_inputs", "review_version", "google"]);
    expect(out.map((s) => s.intentId)).toEqual(["explain_missing_inputs", "where_to_continue", "where_to_continue"]);
    expect(out.map((s) => s.nextStep)).toEqual([
      { kind: "provide_inputs", actionId: NEED_ID },
      { kind: "review_version", actionId: NEED_ID, versionId: V1 },
      { kind: "open_integrations" },
    ]);
    expect(out[0].context).toEqual({ workspaceId: WORKSPACE_ID, locationId: L1, actionId: NEED_ID });
    expect(out[1].context).toEqual({ workspaceId: WORKSPACE_ID, locationId: L1, actionId: NEED_ID, versionId: V1 });
    expect(out[2].context).toEqual({ workspaceId: WORKSPACE_ID, locationId: L1 });
    expect(out[0].label.actionTitle).toEqual(need.title);
    expect(out[1].label.actionTitle).toEqual(need.title);
    expect(out[2].label).toEqual({});
  });

  it("omits locationId from the context when none is given", () => {
    const out = buildSuggestions({ membership: owner, rows: rows() });
    expect(Object.keys(out[0].context)).toEqual(["workspaceId", "actionId"]);
    expect(Object.keys(out[2].context)).toEqual(["workspaceId"]);
  });

  it("prefers the focused action and a focused action's waiting version", () => {
    const older = version(V1, NEED_ID, "2026-08-01T00:00:00Z");
    const forOther = version(V2, OTHER_ID, "2026-09-05T00:00:00Z");
    const out = buildSuggestions({ membership: owner, focusedActionId: OTHER_ID, rows: rows({ waitingVersions: [older, forOther] }) });
    expect(out[0].id).toBe(`missing_inputs:${OTHER_ID}`);
    expect(out[1].id).toBe(`review_version:${V2}`);
    expect(out[1].nextStep).toEqual({ kind: "review_version", actionId: OTHER_ID, versionId: V2 });
  });

  it("prefers a focused version over other versions of the same action", () => {
    const a = version(V1, NEED_ID, "2026-08-01T00:00:00Z");
    const b = version(V2, NEED_ID, "2026-09-01T00:00:00Z", { versionNo: 2 });
    const out = buildSuggestions({ membership: owner, focusedActionId: NEED_ID, focusedVersionId: V2, rows: rows({ waitingVersions: [a, b], google: "active" }) });
    expect(out.find((s) => s.kind === "review_version")?.id).toBe(`review_version:${V2}`);
  });

  it("falls back to the highest priority action when the focused one needs nothing", () => {
    const ready = make("55555555-5555-4555-8555-555555555555", { action_state: "ready" });
    const out = buildSuggestions({ membership: owner, focusedActionId: ready.id, rows: rows({ actions: [ready, need, other] }) });
    expect(out[0].id).toBe(`missing_inputs:${NEED_ID}`);
  });

  it("picks the oldest waiting version when nothing is focused", () => {
    const newer = version(V2, NEED_ID, "2026-09-09T00:00:00Z");
    const oldest = version(V3, OTHER_ID, "2026-07-01T00:00:00Z");
    const out = buildSuggestions({ membership: owner, rows: rows({ waitingVersions: [newer, v1, oldest], google: "active" }) });
    expect(out.find((s) => s.kind === "review_version")?.id).toBe(`review_version:${V3}`);
  });

  it("drops offer actions and offer_id from missing inputs", () => {
    const offer = make(NEED_ID, { template_key: "offer-instagram-post", action_state: "needs_input", required_inputs: ["offer_id"], provided_inputs: {} });
    const out = buildSuggestions({ membership: owner, rows: rows({ actions: [offer], waitingVersions: [], google: "active" }) });
    expect(out).toEqual([]);
  });

  it.each([null, "expired", "revoked", "error"] as const)("raises Google %s for owners only", (status) => {
    const mk = (m: Membership) => buildSuggestions({ membership: m, rows: rows({ actions: [], waitingVersions: [], google: status }) });
    expect(mk(owner)).toHaveLength(1);
    expect(mk(owner)[0]).toMatchObject({ kind: "google", id: `google:${status ?? "none"}`, nextStep: { kind: "open_integrations" } });
    expect(mk(manager)).toEqual([]);
    expect(mk(viewer)).toEqual([]);
  });

  it("raises nothing for an active connection", () => {
    expect(buildSuggestions({ membership: owner, rows: rows({ actions: [], waitingVersions: [], google: "active" }) })).toEqual([]);
  });

  it("gives viewers questions without nextStep", () => {
    const out = buildSuggestions({ membership: viewer, rows: rows() });
    expect(out.map((s) => s.kind)).toEqual(["missing_inputs", "review_version"]);
    for (const s of out) expect(s.nextStep).toBeUndefined();
  });

  it("gives an out-of-scope manager nothing for rows outside its scope", () => {
    const scoped: Membership = { ...manager, locationScope: [L2] };
    expect(buildSuggestions({ membership: scoped, rows: rows() })).toEqual([]);
  });

  it("keeps in-scope rows for a scoped manager, with a nextStep", () => {
    const scoped: Membership = { ...manager, locationScope: [L1] };
    const out = buildSuggestions({ membership: scoped, rows: rows() });
    expect(out.map((s) => s.kind)).toEqual(["missing_inputs", "review_version"]);
    expect(out[0].nextStep).toEqual({ kind: "provide_inputs", actionId: NEED_ID });
  });

  it("treats a workspace-wide action as in scope for a scoped manager", () => {
    const scoped: Membership = { ...manager, locationScope: [L2] };
    const wide = make(NEED_ID, { action_state: "needs_input", required_inputs: ["opening_hours"], provided_inputs: {} }, null);
    const wideVersion = version(V1, NEED_ID, "2026-09-01T00:00:00Z", { locationId: null });
    const out = buildSuggestions({ membership: scoped, rows: rows({ actions: [wide], waitingVersions: [wideVersion] }) });
    expect(out.map((s) => s.kind)).toEqual(["missing_inputs", "review_version"]);
    expect(out[0].nextStep).toEqual({ kind: "provide_inputs", actionId: NEED_ID });
    expect(out[1].nextStep).toEqual({ kind: "review_version", actionId: NEED_ID, versionId: V1 });
  });

  it("returns [] when nothing needs the owner", () => {
    expect(buildSuggestions({ membership: owner, rows: { actions: [], waitingVersions: [], google: "active" } })).toEqual([]);
  });

  it("puts only ids and titles in suggestions", () => {
    const secret = make(NEED_ID, {
      action_state: "needs_input",
      required_inputs: ["opening_hours"],
      provided_inputs: { note: "SECRET-PROVIDED-VALUE" },
      evidence: { factType: "Observed", source: "S", value: "SECRET-EVIDENCE-VALUE", detail: { en: "SECRET-DETAIL", "zh-HK": "x", "zh-TW": "x" } },
    });
    const out = buildSuggestions({ membership: owner, rows: rows({ actions: [secret] }) });
    const json = JSON.stringify(out);
    expect(json).not.toContain("SECRET");
    expect(json).not.toContain("opening_hours");
  });
});
