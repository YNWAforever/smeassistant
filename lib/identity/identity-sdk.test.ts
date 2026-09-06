import { createHmac } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const context=vi.hoisted(()=>({cookie:"",set:vi.fn()}));
vi.mock("next/headers",()=>({cookies:async()=>({set:context.set}),headers:async()=>new Headers({cookie:context.cookie})}));
const secret="fixture-cookie-secret-32-characters-only";
const session={user:{id:"opaque|replay",email:"replay@example.test",emailVerified:true,name:"Fixture",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},session:{id:"session",token:"fixture-revoked",userId:"opaque|replay",expiresAt:new Date(Date.now()+60_000).toISOString(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}};
function signedCookie() {
 const header=Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url");
 const payload=Buffer.from(JSON.stringify({...session,exp:Math.floor(Date.now()/1000)+60,iat:Math.floor(Date.now()/1000),sub:session.user.id})).toString("base64url");
 const input=`${header}.${payload}`;
 return `${input}.${createHmac("sha256",secret).update(input).digest("base64url")}`;
}
beforeEach(()=>{vi.resetModules();vi.stubEnv("NEON_AUTH_BASE_URL","https://auth.example.test/auth");vi.stubEnv("NEON_AUTH_COOKIE_SECRET",secret);context.cookie=`__Secure-neon-auth.session_token=fixture-revoked; __Secure-neon-auth.local.session_data=${signedCookie()}`;});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it("rejects a replayed valid cached identity when upstream revoked its session",async()=>{
 const transport=vi.fn(async(input:RequestInfo|URL)=>{
  const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);
  expect(url.origin).toBe("https://auth.example.test");expect(url.pathname).toBe("/auth/get-session");
  expect(url.searchParams.get("disableCookieCache")).toBe("true");
  return Response.json(null);
 });
 vi.stubGlobal("fetch",transport);
 const {getNeonAuth,neonIdentityProvider}=await import("./neon");
 // Prove the fixture is a valid cached session the pinned SDK would otherwise accept.
 expect((await getNeonAuth().getSession()).data?.user.id).toBe(session.user.id);
 expect(transport).not.toHaveBeenCalled();
 expect(await neonIdentityProvider.getIdentity()).toBeNull();
 expect(transport).toHaveBeenCalledTimes(1);
});
