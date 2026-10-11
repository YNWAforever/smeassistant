// Audit-only: controlled dependency failure, no network or production fault injection.
import { beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ authorizeWorkspaceRequest: vi.fn() }));
vi.mock("@/lib/auth", () => auth);
import { GET as getBrand } from "@/app/api/workspaces/[workspaceId]/brand/route";
import { GET as getAssets } from "@/app/api/workspaces/[workspaceId]/assets/route";
const workspaceId = "11111111-1111-4111-8111-111111111111";
beforeEach(() => { auth.authorizeWorkspaceRequest.mockRejectedValue(new Error("identity_session_failed")); });
it.each([["brand", getBrand], ["assets", getAssets]] as const)("returns controlled 503 when %s authorization dependency is unavailable", async (name, handler) => {
  const result = handler(new Request(`https://app.test/api/workspaces/${workspaceId}/${name}`), { params: Promise.resolve({ workspaceId }) });
  await expect(result).resolves.toHaveProperty("status", 503);
  const response = await result;
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: "unavailable" });
});
