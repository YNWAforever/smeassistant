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

it("protected proxy rejects SDK signed-cache replay and preserves original locale URL", async () => {
 const { NextRequest } = await import("next/server");
 const { getNeonAuth } = await import("./neon");
 const request = new NextRequest("https://app.test/zh-TW/owner/acme?tab=actions", {headers:{cookie:context.cookie}});
 const transport=vi.fn(async(input:RequestInfo|URL)=>{ const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url); expect(url.origin).toBe("https://auth.example.test"); expect(url.pathname).toBe("/auth/get-session"); return Response.json(null); }); vi.stubGlobal("fetch",transport);
 expect((await getNeonAuth().middleware()(request)).status).toBe(200);
 expect(transport).not.toHaveBeenCalled();
 const {proxy}=await import("@/proxy");
 const response=await proxy(request);
 expect(response.status).toBe(307);
 const location=new URL(response.headers.get("location")!);
 expect(location.pathname).toBe("/zh-TW/owner/sign-in");
 expect(location.searchParams.get("returnTo")).toBe("/zh-TW/owner/acme?tab=actions");
 expect(location.href).not.toContain("disableCookieCache");
 expect(transport).toHaveBeenCalled();
});

it("managed logout fixture revokes upstream and captured cached cookie cannot reopen a protected route",async()=>{
 let revoked=false;
 const transport=vi.fn(async(input:RequestInfo|URL)=>{
   const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);
   expect(url.origin).toBe("https://auth.example.test");
   if(url.pathname==="/auth/sign-out"){revoked=true;return Response.json({success:true});}
   expect(url.pathname).toBe("/auth/get-session");return Response.json(revoked?null:session);
 });vi.stubGlobal("fetch",transport);
 const {signOut}=await import("@/lib/auth");await signOut();expect(revoked).toBe(true);
 const {NextRequest}=await import("next/server");const {proxy}=await import("@/proxy");
 expect((await proxy(new NextRequest("https://app.test/en/owner/acme",{headers:{cookie:context.cookie}}))).status).toBe(307);
});
it("actual SDK handler ignores the signed cache when upstream revoked identity",async()=>{
 const transport=vi.fn(async(input:RequestInfo|URL)=>{
  const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);
  expect(url.origin).toBe("https://auth.example.test");expect(url.pathname).toBe("/auth/get-session");return Response.json(null);
 });vi.stubGlobal("fetch",transport);
 const {GET}=await import("@/app/api/auth/[...path]/route");
 const response=await GET(new Request("https://app.test/api/auth/get-session",{headers:{cookie:context.cookie}}),{params:Promise.resolve({path:["get-session"]})});
 expect(await response.json()).toBeNull();expect(transport).toHaveBeenCalled();
});
it.each(["__Secure-neon-auth.session_token=%zz; __Secure-neon-auth.local.session_data=garbage", "__Secure-neon-auth.local.session_data=garbage", ""])("malformed or absent session fails closed: %s",async cookie=>{
 vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL)=>{
  const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);expect(url.origin).toBe("https://auth.example.test");return Response.json(null);
 }));
 const {NextRequest}=await import("next/server");const {proxy}=await import("@/proxy");
 expect((await proxy(new NextRequest("https://app.test/en/owner/acme",{headers:{cookie}}))).status).toBe(307);
});
