import { beforeEach, describe, expect, it, vi } from "vitest";
const ports = vi.hoisted(() => ({ auth: vi.fn(), bulk: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/auth", async original => ({ ...await original<typeof import("@/lib/auth")>(), authorizeWorkspaceRequest: ports.auth }));
vi.mock("@/lib/workspace/bulk-action-updates", () => ({ assignmentUpdateService: () => ({ bulk: ports.bulk }) }));
vi.mock("@/lib/security/rate-limit", async original => ({ ...await original<typeof import("@/lib/security/rate-limit")>(), enforceRateLimit: ports.limit }));
import { POST } from "./route";
const workspaceId = "00000000-0000-4000-8000-000000000001", actionId = "00000000-0000-4000-8000-000000000002";
const body = { mode: "preview", items: [{ actionId, expectedUpdatedAt: "2026-10-01T00:00:00.123456Z" }], patch: { due_at: null } };
const call = (input: unknown = body) => POST(new Request("https://app.test/api/bulk", { method: "POST", body: JSON.stringify(input) }), { params: Promise.resolve({ workspaceId }) });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("ACTION_BULK_ASSIGN_ENABLED", "true"); ports.auth.mockResolvedValue({ ok: true, user: { id: "actor" }, membership: { role: "manager" } }); ports.limit.mockResolvedValue({ allowed: true }); ports.bulk.mockResolvedValue([{ actionId, status: "updated", eligible: true }]); });
describe("bulk route (T-13)", () => {
  it("ships dark without touching auth or storage", async () => { vi.stubEnv("ACTION_BULK_ASSIGN_ENABLED", "false"); expect((await call()).status).toBe(404); expect(ports.auth).not.toHaveBeenCalled(); expect(ports.bulk).not.toHaveBeenCalled(); });
  it.each([401, 403, 404])("preserves authorization refusal %s before reads/writes", async status => { ports.auth.mockResolvedValue({ ok: false, status, code: "forbidden" }); expect((await call()).status).toBe(status); expect(ports.limit).not.toHaveBeenCalled(); expect(ports.bulk).not.toHaveBeenCalled(); });
  it("refuses privileged patches and respects fail-closed rate limit", async () => { expect((await call({ ...body, patch: { publish: true } })).status).toBe(400); expect(ports.bulk).not.toHaveBeenCalled(); ports.limit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 }); expect((await call()).status).toBe(429); expect(ports.bulk).not.toHaveBeenCalled(); });
  it("returns per-item outcomes and uses authenticated actor with manager floor", async () => { ports.bulk.mockResolvedValue([{ actionId, status: "conflict", eligible: false }]); const response = await call(); expect(await response.json()).toEqual({ mode: "preview", results: [{ actionId, status: "conflict", eligible: false }] }); expect(ports.auth).toHaveBeenCalledWith({ id: workspaceId }, { minRole: "manager" }); expect(ports.bulk).toHaveBeenCalledWith(expect.objectContaining({ workspaceId, userId: "actor" }), body); });
});
