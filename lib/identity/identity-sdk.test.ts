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

it.each([429, 500, 503])("preserves the browser session and denies content during upstream %s", async status => {
  const transport = vi.fn(async () => Response.json({ message: "fixture dependency failure" }, { status }));
  vi.stubGlobal("fetch", transport);
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("@/proxy");
  const response = await proxy(new NextRequest("https://app.test/en/owner/acme", { headers: { cookie: context.cookie } }));
  expect(transport).toHaveBeenCalledTimes(1);
  expect(response.status).toBe(503);
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("x-middleware-next")).toBeNull();
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(response.headers.get("cache-control")).toBe("no-store");
});

it("validates once upstream and recovers on the next request without signing in again", async () => {
  const transport = vi.fn().mockResolvedValueOnce(Response.json(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json(session));
  vi.stubGlobal("fetch", transport);
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("@/proxy");
  const request = () => new NextRequest("https://app.test/en/owner/acme?tab=actions", { headers: { cookie: context.cookie } });
  expect((await proxy(request())).status).toBe(503);
  const response = await proxy(request());
  expect(response.headers.get("x-middleware-next")).toBe("1");
  expect(transport).toHaveBeenCalledTimes(2);
  const url = new URL(String(transport.mock.calls[1][0]));
  expect(url.searchParams.get("disableCookieCache")).toBe("true");
  expect(request().url).not.toContain("disableCookieCache");
});

it.each(["throw", "invalid JSON", "empty body"])("denies access without sign-out on %s", async failure => {
  vi.stubGlobal("fetch", vi.fn(async () => {
    if (failure === "throw") throw new TypeError("fixture transport secret");
    return new Response(failure === "invalid JSON" ? "not JSON" : null, { status: 200 });
  }));
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("@/proxy");
  const response = await proxy(new NextRequest("https://app.test/en/owner/acme", { headers: { cookie: context.cookie } }));
  expect(response.status).toBe(503);
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(await response.text()).not.toContain("secret");
});

it.each([401, 403])("redirects confirmed upstream denial %s to sign-in", async status => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(null, { status })));
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("@/proxy");
  const response = await proxy(new NextRequest("https://app.test/en/owner/acme", { headers: { cookie: context.cookie } }));
  expect(response.status).toBe(307);
  expect(new URL(response.headers.get("location")!).pathname).toBe("/en/owner/sign-in");
});

it("keeps owner query data out of upstream validation while preserving returnTo", async () => {
  const transport = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    expect([...url.searchParams.entries()]).toEqual([["disableCookieCache", "true"]]);
    expect(new Headers(init?.headers).get("referer")).toBeNull();
    expect(new Headers(init?.headers).get("authorization")).toBeNull();
    return Response.json(null);
  });
  vi.stubGlobal("fetch", transport);
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("@/proxy");
  const path = "/en/owner/acme?search=private-fixture&_rsc=fixture&disableRefresh=true&neon_auth_session_verifier=orphan";
  const request = new NextRequest(`https://app.test${path}`, { headers: { cookie: context.cookie, referer: `https://app.test${path}`, authorization: "Bearer fixture-unrelated" } });
  const response = await proxy(request);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(new URL(response.headers.get("location")!).searchParams.get("returnTo")).toBe(path);
  expect(request.url).toBe(`https://app.test${path}`);
});

it("preserves rotated token attributes and the SDK-minted cache", async () => {
  const { MANAGED_SESSION_COOKIES } = await import("./cookies");
  const expires = new Date(Date.now() + 60_000).toUTCString();
  const transport = vi.fn().mockResolvedValueOnce(Response.json(session, { headers: {
    "set-cookie": `${MANAGED_SESSION_COOKIES[0]}=rotated; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires}`,
  } })).mockImplementation(async () => Response.json(session));
  vi.stubGlobal("fetch", transport);
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("@/proxy");
  const response = await proxy(new NextRequest("https://app.test/en/owner/acme", { headers: { cookie: context.cookie } }));
  expect(response.headers.get("x-middleware-next")).toBe("1");
  expect(transport).toHaveBeenCalledTimes(2);
  expect(response.cookies.get(MANAGED_SESSION_COOKIES[0])).toMatchObject({ value: "rotated", path: "/", httpOnly: true, secure: true, sameSite: "lax", expires: new Date(expires) });
  expect(response.cookies.get(MANAGED_SESSION_COOKIES[1])?.value).toBeTruthy();
});

it("honors positive Max-Age over a past Expires when forwarding a rotated token", async () => {
  const { MANAGED_SESSION_COOKIES } = await import("./cookies");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(session, { headers: {
    "set-cookie": `${MANAGED_SESSION_COOKIES[0]}=rotated; Max-Age=3600; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; Secure`,
  } })));
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("@/proxy");
  const response = await proxy(new NextRequest("https://app.test/en/owner/acme", { headers: { cookie: context.cookie } }));
  expect(response.cookies.get(MANAGED_SESSION_COOKIES[0])).toMatchObject({ value: "rotated", maxAge: 3600 });
});

it.each(["en", "zh-HK", "zh-TW"])("keeps %s RSC/prefetch requests unavailable during Auth failure", async locale => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(null, { status: 429, headers: { "set-cookie": "fixture=; Max-Age=0" } })));
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("@/proxy");
  const response = await proxy(new NextRequest(`https://app.test/${locale}/owner/acme?_rsc=fixture`, { headers: { cookie: context.cookie, RSC: "1", "next-router-prefetch": "1" } }));
  expect(response.status).toBe(503);
  expect(response.headers.get("content-language")).toBe(locale);
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("set-cookie")).toBeNull();
});

it("preserves the SDK verifier exchange redirect on an owner URL", async () => {
  const { MANAGED_AUTH_COOKIES, MANAGED_SESSION_COOKIES } = await import("./cookies");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(session, { headers: { "set-cookie": `${MANAGED_SESSION_COOKIES[0]}=exchanged; Path=/; Secure; HttpOnly` } })));
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("@/proxy");
  const response = await proxy(new NextRequest("https://app.test/zh-TW/owner/acme?tab=actions&neon_auth_session_verifier=fixture", { headers: { cookie: `${MANAGED_AUTH_COOKIES[2]}=fixture` } }));
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("https://app.test/zh-TW/owner/acme?tab=actions");
  expect(response.cookies.get(MANAGED_SESSION_COOKIES[0])?.value).toBe("exchanged");
});

it.each([429, 500, "failed exchange with existing session"])("keeps failed owner OAuth handoff unavailable: %s", async failure => {
  const { MANAGED_AUTH_COOKIES } = await import("./cookies");
  const transport = vi.fn();
  if (typeof failure === "number") transport.mockImplementation(async () => Response.json(null, { status: failure }));
  else transport.mockResolvedValueOnce(Response.json(null, { status: 401 })).mockImplementation(async () => Response.json(session));
  vi.stubGlobal("fetch", transport);
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("@/proxy");
  const response = await proxy(new NextRequest("https://app.test/en/owner/acme?neon_auth_session_verifier=fixture", { headers: { cookie: `${context.cookie}; ${MANAGED_AUTH_COOKIES[2]}=fixture` } }));
  expect(response.status).toBe(503);
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(response.headers.get("x-middleware-next")).toBeNull();
});

it.each([401, 429])("forwards managed cookie deletion only for authoritative denial (%s)", async status => {
  const { MANAGED_SESSION_COOKIES } = await import("./cookies");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(null, { status, headers: {
    "set-cookie": `${MANAGED_SESSION_COOKIES[0]}=; Max-Age=0; Path=/; HttpOnly; Secure; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
  } })));
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("@/proxy");
  const response = await proxy(new NextRequest("https://app.test/en/owner/acme", { headers: { cookie: context.cookie } }));
  if (status === 429) {
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
  } else {
    expect(response.status).toBe(307);
    // The pinned SDK normalizes an empty token via its parser; retain the
    // authoritative expiry rather than requiring its original wire spelling.
    expect(response.cookies.get(MANAGED_SESSION_COOKIES[0])).toMatchObject({ expires: new Date(0), httpOnly: true, secure: true, path: "/" });
    const cached = response.cookies.get(MANAGED_SESSION_COOKIES[1]);
    expect(cached?.maxAge === 0 || (cached?.expires ? new Date(cached.expires).getTime() : Infinity) <= Date.now()).toBe(true);
  }
});

it("does not call Auth when no session token is present", async () => {
  const transport = vi.fn();
  vi.stubGlobal("fetch", transport);
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("@/proxy");
  expect((await proxy(new NextRequest("https://app.test/en/owner/acme"))).status).toBe(307);
  expect(transport).not.toHaveBeenCalled();
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
