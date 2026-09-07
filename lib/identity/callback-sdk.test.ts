import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({getUser:vi.fn(),signOut:vi.fn(async()=>{})}));
vi.mock("@/lib/auth",()=>mocks);
vi.mock("next/headers",()=>({cookies:async()=>({set:vi.fn(),get:()=>undefined}),headers:async()=>new Headers()}));
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();vi.stubEnv("NEON_AUTH_BASE_URL","https://auth.example.test/auth");vi.stubEnv("NEON_AUTH_COOKIE_SECRET","fixture-secret-at-least-32-characters");});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it("SDK exchanges callback challenge and redirects to the clean callback before app actions",async()=>{
 const session={user:{id:"fixture",email:"fixture@example.test",emailVerified:true},session:{id:"s",userId:"fixture",token:"fixture",expiresAt:new Date(Date.now()+60000).toISOString()}};
 const transport=vi.fn(async(input:RequestInfo|URL)=>{
  const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);
  expect(url.origin).toBe("https://auth.example.test");expect(url.pathname).toBe("/auth/get-session");
  return Response.json(session,{headers:{"set-cookie":"__Secure-neon-auth.session_token=fixture; Path=/; Secure; HttpOnly"}});
 });vi.stubGlobal("fetch",transport);
 const {GET}=await import("@/app/auth/callback/route");
 const response=await GET(new Request("https://app.test/auth/callback?locale=zh-TW&returnTo=%2Fzh-TW%2Fowner&neon_auth_session_verifier=fixture",{headers:{cookie:"__Secure-neon-auth.session_challenge=fixture"}}));
 expect(response.headers.get("location")).toBe("https://app.test/auth/callback?locale=zh-TW&returnTo=%2Fzh-TW%2Fowner");
 expect(response.headers.get("set-cookie")).toContain("__Secure-neon-auth.session_token=fixture");
 expect(mocks.getUser).not.toHaveBeenCalled();expect(transport).toHaveBeenCalled();
});
it.each(["expired","used","missing challenge"])("rejects %s callback handoff without application actions",async kind=>{
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({message:"invalid verifier"},{status:401})));
 const {GET}=await import("@/app/auth/callback/route");
 const response=await GET(new Request("https://app.test/auth/callback?locale=en&neon_auth_session_verifier=fixture",{headers:{cookie:kind==="missing challenge"?"":"__Secure-neon-auth.session_challenge=fixture"}}));
 expect(response.headers.get("location")).toBe("https://app.test/en/owner/sign-in?error=invalid_code");
 expect(mocks.getUser).not.toHaveBeenCalled();
});
