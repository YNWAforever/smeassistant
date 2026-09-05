import { beforeEach, describe, expect, it, vi } from "vitest";
const { complete, reconcile, admin } = vi.hoisted(() => ({ complete: vi.fn(), reconcile: vi.fn(), admin: vi.fn(() => ({})) }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseServer: admin }));
vi.mock("@/lib/workspace/completion", () => ({ completeWorkspaceScan: complete, reconcileWorkspaceScans: reconcile }));
import { POST } from "./route";
const secret = "fixture-completion-secret-32-bytes-long";
const jobId = "11111111-1111-4111-8111-111111111111";
function request(body: unknown, token = secret) { return new Request("http://localhost/api/internal/workspace-scan-completion", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) }); }
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("WORKSPACE_COMPLETION_SECRET", secret); vi.stubEnv("WORKSPACE_COMPLETION_ENABLED", "true"); complete.mockResolvedValue({ status: "completed" }); });
describe("internal workspace completion authorization", () => {
  it("is disabled by default", async () => { vi.stubEnv("WORKSPACE_COMPLETION_ENABLED", ""); expect((await POST(request({ jobId }))).status).toBe(404); expect(admin).not.toHaveBeenCalled(); });
  it.each(["", "short", "wrong-secret-of-at-least-32-bytes-long"])("rejects invalid bearer before database access", async token => { expect((await POST(request({ jobId }, token))).status).toBe(401); expect(admin).not.toHaveBeenCalled(); });
  it("fails closed for missing server secret", async () => { vi.stubEnv("WORKSPACE_COMPLETION_SECRET", ""); expect((await POST(request({ jobId }))).status).toBe(503); expect(admin).not.toHaveBeenCalled(); });
  it.each([{}, { jobId: "bad" }, { jobId, workspaceId: jobId }, { jobId, locationId: jobId }, { jobId, status: "done" }, { jobId, reconcile: true }])("rejects omitted or spoofed context %j", async body => { expect((await POST(request(body))).status).toBe(400); expect(admin).not.toHaveBeenCalled(); });
  it("passes only normalized job ID to server processing", async () => { expect((await POST(request({ jobId }))).status).toBe(200); expect(complete).toHaveBeenCalledWith({}, jobId); });
  it("returns retryable status without exposing database errors", async () => { complete.mockRejectedValue(new Error("secret-db-error")); const response = await POST(request({ jobId })); expect(response.status).toBe(503); expect(await response.text()).not.toContain("secret-db-error"); });
  it("reconciles only server-selected bounded work", async () => { reconcile.mockResolvedValue([{ status: "retry" }]); expect((await POST(request({ reconcile: true }))).status).toBe(503); expect(reconcile).toHaveBeenCalledWith({}); });
});
