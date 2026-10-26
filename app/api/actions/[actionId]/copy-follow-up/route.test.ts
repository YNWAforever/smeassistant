import { beforeEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ authorize: vi.fn(), record: vi.fn() }));
vi.mock("@/app/api/actions/_shared/mutation", async original => ({ ...(await original<typeof import("@/app/api/actions/_shared/mutation")>()), authorizeActionMutation: mocked.authorize }));
vi.mock("@/lib/repositories/copy-follow-up", () => ({ copyFollowUpRepository: () => ({ record: mocked.record }) }));
import { POST } from "./route";
const actionId = "11111111-1111-4111-8111-111111111111", versionId = "22222222-2222-4222-8222-222222222222";
const post = (body: unknown) => POST(new Request("http://app.test/api", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ actionId }) });
beforeEach(() => {
  vi.clearAllMocks();
  mocked.authorize.mockResolvedValue({ ok: true, scope: { workspaceId: "workspace", locationId: "location" }, user: { id: "owner" } });
  mocked.record.mockResolvedValue({ ok: true, id: "41" });
});
describe("copy follow-up mutation", () => {
  it("uses the authorized action/workspace/actor, ignoring forged scope in the body", async () => {
    expect((await post({ versionId, decision: "pending", locale: "zh-HK", workspaceId: "foreign", actorId: "forged" })).status).toBe(200);
    expect(mocked.record).toHaveBeenCalledWith({ workspaceId: "workspace", actionId, versionId, actorId: "owner", locale: "zh-HK", decision: "pending" });
  });
  it("preserves a viewer or out-of-scope refusal before any persistence", async () => {
    mocked.authorize.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await post({ versionId, decision: "pending" })).status).toBe(403);
    expect(mocked.record).not.toHaveBeenCalled();
  });
  it.each([{ versionId, decision: "posted" }, { versionId: "bad", decision: "pending" }, { versionId, decision: "later" }, { versionId, decision: "not_yet", expectedRecordId: "bad" }])("rejects malformed or unauditable answers %j", async body => {
    expect((await post(body)).status).toBe(400);
    expect(mocked.record).not.toHaveBeenCalled();
  });
  it("reports a stale answer or unavailable write without claiming it was saved", async () => {
    mocked.record.mockResolvedValueOnce({ ok: false, error: "follow_up_changed" });
    expect((await post({ versionId, decision: "later", expectedRecordId: "41" })).status).toBe(409);
    mocked.record.mockRejectedValueOnce(new Error("private database detail"));
    const response = await post({ versionId, decision: "pending" });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
