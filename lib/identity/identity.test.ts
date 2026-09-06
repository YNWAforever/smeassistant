import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ getSession: vi.fn(), signOut: vi.fn(), create: vi.fn() }));
vi.mock("@neondatabase/auth/next/server", () => ({ createNeonAuth: sdk.create }));
const valid = () => ({ user: { id: "opaque|subject", email: "one@example.test", emailVerified: true }, session: { userId: "opaque|subject", expiresAt: new Date(Date.now() + 60_000) } });
beforeEach(() => {
 vi.resetModules(); vi.clearAllMocks();
 vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.example.test/auth");
 vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "x".repeat(32));
 sdk.create.mockReturnValue(sdk); sdk.getSession.mockResolvedValue({ data: valid(), error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("Neon server identity", () => {
 it("constructs lazily and reuses the configured server SDK", async () => {
  const { getNeonAuth, neonIdentityProvider } = await import("./neon");
  expect(sdk.create).not.toHaveBeenCalled();
  expect(getNeonAuth()).toBe(getNeonAuth());
  expect(sdk.create).toHaveBeenCalledExactlyOnceWith({ baseUrl: "https://auth.example.test/auth", cookies: { secret: "x".repeat(32) }, logLevel: "silent" });
  expect(await neonIdentityProvider.getIdentity()).toEqual({provider:"neon",subject:"opaque|subject",email:"one@example.test",verified:true});
 });
 it.each([null, {}, {user:{}}, {...valid(),user:{...valid().user,emailVerified:false}}, {...valid(),user:{...valid().user,emailVerified:"true"}}, {...valid(),user:{...valid().user,id:""}}, {...valid(),user:{...valid().user,email:"bad"}}, {...valid(),session:{...valid().session,userId:"other"}}, {...valid(),session:{...valid().session,expiresAt:new Date(0)}}, {...valid(),session:{...valid().session,expiresAt:"invalid"}}])("rejects absent, invalid, expired or unverified sessions %#", async data => {
  sdk.getSession.mockResolvedValue({data,error:null});
  const {neonIdentityProvider} = await import("./neon");
  expect(await neonIdentityProvider.getIdentity()).toBeNull();
 });
 it("accepts serialized SDK session dates", async () => {
  sdk.getSession.mockResolvedValue({data:{...valid(),session:{...valid().session,expiresAt:new Date(Date.now()+60_000).toISOString()}},error:null});
  const {neonIdentityProvider} = await import("./neon");
  expect(await neonIdentityProvider.getIdentity()).toMatchObject({subject:"opaque|subject"});
 });
 it.each(["", "not-a-url", "http://auth.example.test/auth", "https://user:secret@example.test/auth", "https://auth.example.test/auth?secret=leak", "https://auth.example.test/auth#secret"])('sanitizes malformed URL %s', async url => {
  vi.stubEnv("NEON_AUTH_BASE_URL",url);
  const {getNeonAuth} = await import("./neon");
  expect(getNeonAuth).toThrow("identity_config_invalid"); expect(sdk.create).not.toHaveBeenCalled();
 });
 it.each(["", "short"])('rejects missing/short cookie secrets',async secret => {
  vi.stubEnv("NEON_AUTH_COOKIE_SECRET",secret);
  const {getNeonAuth} = await import("./neon"); expect(getNeonAuth).toThrow("identity_config_invalid");
 });
 it("permits loopback HTTP only in tests", async () => {
  vi.stubEnv("NEON_AUTH_BASE_URL","http://127.0.0.1:3001/auth");
  const first = await import("./neon"); expect(first.getNeonAuth()).toBe(sdk);
  vi.resetModules(); vi.stubEnv("NODE_ENV","production");
  const second = await import("./neon"); expect(second.getNeonAuth).toThrow("identity_config_invalid");
 });
 it("sanitizes construction and session transport errors", async () => {
  sdk.create.mockImplementationOnce(()=> {throw new Error("secret credential");});
  const {getNeonAuth,neonIdentityProvider} = await import("./neon");
  expect(getNeonAuth).toThrow(/^identity_config_invalid$/);
  sdk.getSession.mockRejectedValueOnce(new Error("secret token"));
  await expect(neonIdentityProvider.getIdentity()).rejects.toThrow(/^identity_session_failed$/);
  sdk.getSession.mockResolvedValueOnce({data:null,error:{status:500,message:"secret"}});
  await expect(neonIdentityProvider.getIdentity()).rejects.toThrow(/^identity_session_failed$/);
 });
 it.each([401,403])("treats SDK unauthenticated errors as null (%s)",async status=>{
  sdk.getSession.mockResolvedValue({data:null,error:{status,message:"invalid token"}});
  const {neonIdentityProvider}=await import("./neon"); expect(await neonIdentityProvider.getIdentity()).toBeNull();
 });
 it("signs out through the server SDK and sanitizes errors",async()=>{
  const {neonIdentityProvider}=await import("./neon"); await neonIdentityProvider.signOut(); expect(sdk.signOut).toHaveBeenCalledOnce();
  sdk.signOut.mockRejectedValueOnce(new Error("secret")); await expect(neonIdentityProvider.signOut()).rejects.toThrow(/^identity_signout_failed$/);
 });
});
