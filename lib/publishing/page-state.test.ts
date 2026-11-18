import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real repository is never reached: the module is replaced by spies.
const repo = vi.hoisted(() => ({
  publishDeliveryIds: vi.fn(),
  getDelivery: vi.fn(),
  activeGbpConnection: vi.fn(),
}));
vi.mock("@/lib/repositories/publishing", () => ({ publishingRepository: () => repo }));

// Only the connection reader is replaced; the account-ref parser stays real.
const igRepo = vi.hoisted(() => ({ activeConnection: vi.fn() }));
vi.mock("@/lib/repositories/instagram-connection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/repositories/instagram-connection")>();
  return { ...actual, instagramConnectionRepository: () => igRepo };
});

import { GBP_SCOPE_REQUIRED } from "@/lib/oauth/google-connection";
import { loadInstagramPublishPanel, loadPublishPanel } from "./page-state";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const V2 = "22222222-2222-4222-8222-222222222222";
const V1 = "33333333-3333-4333-8333-333333333333";
const D1 = "44444444-4444-4444-8444-444444444444";

const approved = [
  { id: V2, approval_state: "approved", body: "Thank you for visiting us." },
  { id: V1, approval_state: "superseded", body: "Older reply." },
];

function input(overrides: Partial<Parameters<typeof loadPublishPanel>[0]> = {}): Parameters<typeof loadPublishPanel>[0] {
  return {
    workspaceId: WORKSPACE,
    templateKey: "review-response",
    locationPlaceId: "place-1",
    role: "owner",
    inScope: true,
    versions: approved,
    enabled: true,
    ...overrides,
  };
}

const connection = {
  id: "c-1",
  accessTokenEncrypted: "sealed-access",
  refreshTokenEncrypted: "sealed-refresh",
  scopes: [GBP_SCOPE_REQUIRED],
  expiresAt: null,
};

describe("loadPublishPanel", () => {
  beforeEach(() => {
    repo.publishDeliveryIds.mockReset().mockResolvedValue([]);
    repo.getDelivery.mockReset();
    repo.activeGbpConnection.mockReset().mockResolvedValue(connection);
  });
  afterEach(() => vi.restoreAllMocks());

  it("null for another template", async () => {
    expect(await loadPublishPanel(input({ templateKey: "social-post" }))).toBeNull();
    expect(repo.publishDeliveryIds).not.toHaveBeenCalled();
    expect(repo.getDelivery).not.toHaveBeenCalled();
    expect(repo.activeGbpConnection).not.toHaveBeenCalled();
  });

  it("flag off reads no connection and returns deliveries only when publish rows exist", async () => {
    const empty = await loadPublishPanel(input({ enabled: false }));
    expect(empty).toEqual({
      enabled: false,
      connectionActive: false,
      eligibility: { ok: false, reason: "flag_off" },
      mayAct: false,
      canPublish: false,
      canDelete: false,
      deliveries: [],
    });
    expect(repo.publishDeliveryIds).toHaveBeenCalledWith(WORKSPACE, [V2, V1]);
    // No publish rows: no 0014 column is read, and the connection is never read with the flag off.
    expect(repo.getDelivery).not.toHaveBeenCalled();
    expect(repo.activeGbpConnection).not.toHaveBeenCalled();

    repo.publishDeliveryIds.mockResolvedValue([{ id: D1, versionId: V2, state: "publishing", createdAt: "2026-10-04T10:00:00.000Z" }]);
    repo.getDelivery.mockResolvedValue({
      id: D1,
      workspaceId: WORKSPACE,
      versionId: V2,
      actionId: "a-1",
      locationId: "l-1",
      templateKey: "review-response",
      versionNo: 2,
      body: "Thank you for visiting us.",
      state: "failed",
      targetRef: "accounts/1/locations/2/reviews/r1",
      counted: false,
      failureReason: "not_applied",
      verifiedAt: null,
      createdAt: "2026-10-04T10:00:00.000Z",
    });
    const withRows = await loadPublishPanel(input({ enabled: false }));
    expect(withRows?.deliveries).toEqual([
      { id: D1, versionId: V2, state: "failed", reason: "not_applied", verifiedAt: null, createdAt: "2026-10-04T10:00:00.000Z" },
    ]);
    expect(repo.getDelivery).toHaveBeenCalledWith(D1);
    expect(repo.activeGbpConnection).not.toHaveBeenCalled();
    // Nothing secret or textual reaches the panel.
    expect(JSON.stringify(withRows)).not.toMatch(/sealed|Thank you|reviews\/r1/);
  });

  it("canPublish false for viewer and out-of-scope manager; canDelete only for owner", async () => {
    const owner = await loadPublishPanel(input());
    expect(owner).toMatchObject({ enabled: true, connectionActive: true, eligibility: { ok: true }, mayAct: true, canPublish: true, canDelete: true });
    expect(await loadPublishPanel(input({ role: "manager", inScope: true }))).toMatchObject({ mayAct: true, canPublish: true, canDelete: false });
    expect(await loadPublishPanel(input({ role: "manager", inScope: false }))).toMatchObject({ mayAct: false, canPublish: false, canDelete: false });
    expect(await loadPublishPanel(input({ role: "viewer", inScope: true }))).toMatchObject({ mayAct: false, canPublish: false, canDelete: false });
    // The flag off: nobody may publish or delete.
    expect(await loadPublishPanel(input({ enabled: false }))).toMatchObject({ mayAct: false, canPublish: false, canDelete: false });
    // A connection without the reviews scope is no connection.
    repo.activeGbpConnection.mockResolvedValue({ ...connection, scopes: ["openid"] });
    expect(await loadPublishPanel(input())).toMatchObject({
      connectionActive: false,
      eligibility: { ok: false, reason: "connection_missing" },
      canPublish: false,
      canDelete: true,
    });
  });

  it("eligibility uses the latest approved version", async () => {
    // Newest first: the approved v2 is empty, so it is that body that decides.
    const result = await loadPublishPanel(
      input({
        versions: [
          { id: "v3", approval_state: "draft", body: "" },
          { id: V2, approval_state: "approved", body: "   " },
          { id: V1, approval_state: "approved", body: "A good older reply." },
        ],
      }),
    );
    expect(result?.eligibility).toEqual({ ok: false, reason: "empty_body" });

    const none = await loadPublishPanel(input({ versions: [{ id: V2, approval_state: "draft", body: "Draft text" }] }));
    expect(none?.eligibility).toEqual({ ok: false, reason: "not_approved" });
    expect(none?.canPublish).toBe(false);

    const noListing = await loadPublishPanel(input({ locationPlaceId: null }));
    expect(noListing?.eligibility).toEqual({ ok: false, reason: "no_location_listing" });
  });

  it("a read failure hides the card and logs only a category", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    repo.publishDeliveryIds.mockRejectedValue(new Error("connection refused: postgres://user:secret@host"));
    expect(await loadPublishPanel(input())).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][1]).toEqual({ category: "gbp_publish_panel_unavailable" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });
});

const IG_CONNECTION = {
  id: "c-ig",
  accountRef: JSON.stringify({ id: "17841400000000000", username: "kammanhouse" }),
  scopes: ["instagram_basic", "instagram_content_publish"],
};

function igInput(overrides: Partial<Parameters<typeof loadInstagramPublishPanel>[0]> = {}): Parameters<typeof loadInstagramPublishPanel>[0] {
  return {
    workspaceId: WORKSPACE,
    templateKey: "social-post",
    role: "owner",
    inScope: true,
    versions: [{ id: V2 }, { id: V1 }],
    enabled: true,
    ...overrides,
  };
}

function deliveryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: D1,
    workspaceId: WORKSPACE,
    versionId: V2,
    actionId: "a-1",
    locationId: "l-1",
    templateKey: "social-post",
    versionNo: 2,
    body: "Fresh milk tea at Kam Man House.",
    state: "failed",
    channel: "instagram",
    payload: null,
    targetRef: "instagram:17841400000000000",
    counted: false,
    failureReason: "media_url_unreachable",
    verifiedAt: null,
    createdAt: "2026-10-04T10:00:00.000Z",
    ...overrides,
  };
}

describe("loadInstagramPublishPanel", () => {
  beforeEach(() => {
    repo.publishDeliveryIds.mockReset().mockResolvedValue([]);
    repo.getDelivery.mockReset();
    repo.activeGbpConnection.mockReset();
    igRepo.activeConnection.mockReset().mockResolvedValue(IG_CONNECTION);
  });
  afterEach(() => vi.restoreAllMocks());

  it("null for another template while the flag is off, and no reads", async () => {
    expect(await loadInstagramPublishPanel(igInput({ templateKey: "review-response", enabled: false }))).toBeNull();
    expect(repo.publishDeliveryIds).not.toHaveBeenCalled();
    expect(repo.getDelivery).not.toHaveBeenCalled();
    expect(igRepo.activeConnection).not.toHaveBeenCalled();
  });

  it("flag off reads no connection and returns deliveries only when instagram rows exist", async () => {
    expect(await loadInstagramPublishPanel(igInput({ enabled: false }))).toBeNull();
    expect(repo.publishDeliveryIds).toHaveBeenCalledWith(WORKSPACE, [V2, V1]);
    expect(repo.getDelivery).not.toHaveBeenCalled();
    expect(igRepo.activeConnection).not.toHaveBeenCalled();

    repo.publishDeliveryIds.mockResolvedValue([{ id: D1, versionId: V2, state: "failed", createdAt: "2026-10-04T10:00:00.000Z" }]);
    repo.getDelivery.mockResolvedValue(deliveryRow());
    const withRows = await loadInstagramPublishPanel(igInput({ enabled: false }));
    expect(withRows?.deliveries).toEqual([
      { id: D1, versionId: V2, state: "failed", reason: "media_url_unreachable", verifiedAt: null, createdAt: "2026-10-04T10:00:00.000Z" },
    ]);
    expect(igRepo.activeConnection).not.toHaveBeenCalled();
    // Nothing secret or account-identifying reaches the panel.
    expect(JSON.stringify(withRows)).not.toMatch(/sealed|17841400000000000|kammanhouse|Fresh milk tea/);
  });

  it("keeps only instagram deliveries of this workspace", async () => {
    repo.publishDeliveryIds.mockResolvedValue([
      { id: D1, versionId: V2, state: "published", createdAt: "2026-10-04T10:00:00.000Z" },
      { id: "d-gbp", versionId: V1, state: "published", createdAt: "2026-10-03T10:00:00.000Z" },
      { id: "d-other", versionId: V1, state: "failed", createdAt: "2026-10-02T10:00:00.000Z" },
    ]);
    repo.getDelivery
      .mockResolvedValueOnce(deliveryRow({ state: "published", verifiedAt: "2026-10-04T10:02:00.000Z", failureReason: null }))
      .mockResolvedValueOnce(deliveryRow({ id: "d-gbp", channel: "google_business" }))
      .mockResolvedValueOnce(deliveryRow({ id: "d-other", workspaceId: "99999999-9999-4999-8999-999999999999" }));
    const panel = await loadInstagramPublishPanel(igInput());
    expect(panel?.deliveries.map((row) => row.id)).toEqual([D1]);
  });

  it("canPublish needs the flag, template, publish scopes and role; mayAct mirrors scope", async () => {
    expect(await loadInstagramPublishPanel(igInput())).toMatchObject({
      enabled: true, connectionActive: true, templateAllowed: true, mayAct: true, canPublish: true,
    });
    expect(await loadInstagramPublishPanel(igInput({ role: "manager", inScope: true }))).toMatchObject({ mayAct: true, canPublish: true });
    expect(await loadInstagramPublishPanel(igInput({ role: "manager", inScope: false }))).toMatchObject({ mayAct: false, canPublish: false });
    expect(await loadInstagramPublishPanel(igInput({ role: "viewer", inScope: true }))).toMatchObject({ mayAct: false, canPublish: false });
    expect(await loadInstagramPublishPanel(igInput({ enabled: false }))).toBeNull();
    // A connection without both publish scopes is no connection.
    igRepo.activeConnection.mockResolvedValue({ ...IG_CONNECTION, scopes: ["instagram_basic"] });
    expect(await loadInstagramPublishPanel(igInput())).toMatchObject({ connectionActive: false, canPublish: false });
    // A connection that names no account is no connection either.
    igRepo.activeConnection.mockResolvedValue({ ...IG_CONNECTION, accountRef: "not-json" });
    expect(await loadInstagramPublishPanel(igInput())).toMatchObject({ connectionActive: false, canPublish: false });
  });

  it("a read failure hides the card and logs only a category", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    repo.publishDeliveryIds.mockRejectedValue(new Error("connection refused: postgres://user:secret@host"));
    expect(await loadInstagramPublishPanel(igInput())).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][1]).toEqual({ category: "instagram_publish_panel_unavailable" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });
});
