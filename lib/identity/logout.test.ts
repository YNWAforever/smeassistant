import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signOut: vi.fn(), set: vi.fn() }));
vi.mock("@/lib/identity/neon", () => ({ neonIdentityProvider: {signOut:mocks.signOut} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set:mocks.set }) }));
beforeEach(() => {vi.clearAllMocks(); mocks.signOut.mockResolvedValue(undefined);});
it("shared signOut revokes the managed session and invalidates local cookies", async () => {
 const {signOut}=await import("@/lib/auth"); await signOut();
 expect(mocks.signOut).toHaveBeenCalledOnce();
 expect(mocks.set).toHaveBeenCalledWith("__Secure-neon-auth.session_token", "", expect.objectContaining({maxAge:0,path:"/"}));
 expect(mocks.set).toHaveBeenCalledWith("__Secure-neon-auth.local.session_data", "", expect.objectContaining({maxAge:0}));
});
it("clears local cookies but reports failed managed revocation", async () => {
 mocks.signOut.mockRejectedValue(new Error("provider secret"));
 const {signOut}=await import("@/lib/auth");
 await expect(signOut()).rejects.toThrow("identity_signout_failed");
 expect(mocks.set).toHaveBeenCalled();
});
