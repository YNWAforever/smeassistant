import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({fail:false,GET:vi.fn(),POST:vi.fn(),owner:vi.fn(),invite:vi.fn(),rateLimit:vi.fn()}));
vi.mock("@/lib/identity/neon",()=>({getNeonAuth:()=>{if(mocks.fail)throw new Error("private config");return {handler:()=>({GET:mocks.GET,POST:mocks.POST})};}}));
vi.mock("@/app/api/owner/magic-link/route",()=>({POST:mocks.owner}));
vi.mock("@/app/api/workspace-invites/magic-link/route",()=>({POST:mocks.invite}));
vi.mock("@/lib/security/rate-limit", async importOriginal => ({
 ...await importOriginal<typeof import("@/lib/security/rate-limit")>(),
 enforceCompositeIdentifierRateLimit:mocks.rateLimit,
}));
const context=(path:string)=>({params:Promise.resolve({path:path.split("/")})});
beforeEach(()=>{vi.clearAllMocks();mocks.fail=false;mocks.rateLimit.mockResolvedValue({allowed:true});mocks.GET.mockResolvedValue(Response.json(null));mocks.POST.mockResolvedValue(Response.json({ok:true}));mocks.owner.mockResolvedValue(Response.json({ok:true}));mocks.invite.mockResolvedValue(Response.json({ok:true}));});
it("loads handler lazily and sanitizes config failure with correlation id",async()=>{
 mocks.fail=true;const {GET}=await import("./route");
 const response=await GET(new Request("https://app.test/api/auth/get-session"),context("get-session"));
 expect(response.status).toBe(503);expect(await response.json()).toMatchObject({error:"auth_unavailable",correlationId:expect.any(String)});
});
it("SDK session handler receives fresh validation without the signed cache",async()=>{
 const {GET}=await import("./route");
 await GET(new Request("https://app.test/api/auth/get-session",{headers:{cookie:"__Secure-neon-auth.local.session_data=cached; __Secure-neon-auth.session_token=token"}}),context("get-session"));
 expect(mocks.GET.mock.calls[0][0].headers.get("cookie")).not.toContain("session_data");
 expect(mocks.GET.mock.calls[0][0].headers.get("cookie")).toContain("session_token=token");
});
it.each([false,true])("SDK magic link delegates to existing bounded mail flow claim=%s",async claim=>{
 const {POST}=await import("./route");
 await POST(new Request("https://app.test/api/auth/sign-in/magic-link",{method:"POST",body:JSON.stringify({email:"fixture@example.test",callbackURL:`/auth/callback?locale=zh-TW${claim?"&claim=abcdef":""}&returnTo=%2Fzh-TW%2Fowner`})}),context("sign-in/magic-link"));
 const selected=claim?mocks.owner:mocks.invite;expect(selected).toHaveBeenCalledOnce();
 expect(await selected.mock.calls[0][0].json()).toMatchObject({email:"fixture@example.test",locale:"zh-TW",returnTo:"/zh-TW/owner"});
 expect(mocks.POST).not.toHaveBeenCalled();
});
it("rejects a foreign callback before any managed request",async()=>{
 const {POST}=await import("./route");
 const response=await POST(new Request("https://app.test/api/auth/sign-in/social",{method:"POST",body:JSON.stringify({provider:"google",callbackURL:"//evil.example"})}),context("sign-in/social"));
 expect(response.status).toBe(400);expect(mocks.POST).not.toHaveBeenCalled();
});
it("forwards supported Google identity through lazy SDK POST",async()=>{
 const {POST}=await import("./route");
 const response=await POST(new Request("https://app.test/api/auth/sign-in/social",{method:"POST",body:JSON.stringify({provider:"google",callbackURL:"/auth/callback?locale=en"})}),context("sign-in/social"));
 expect(response.status).toBe(200);expect(mocks.POST).toHaveBeenCalledOnce();
});

it("rejects an alternate foreign new-user callback before Google dispatch",async()=>{
 const {POST}=await import("./route");
 const response=await POST(new Request("https://app.test/api/auth/sign-in/social",{method:"POST",body:JSON.stringify({provider:"google",callbackURL:"/auth/callback",newUserCallbackURL:"https://evil.example"})}),context("sign-in/social"));
 expect(response.status).toBe(400);expect(mocks.POST).not.toHaveBeenCalled();
});

it("forwards a framework-wrapped GET with its query and session token, excluding signed caches", async () => {
 const { GET } = await import("./route");
 const original = new Request("https://app.test/api/auth/get-session?disableCookieCache=true", {
  headers: { cookie: "__Secure-neon-auth.local.session_data=first; __Secure-neon-auth.session_token=fixture; __Secure-neon-auth.local.session_data=second", origin: "https://app.test" },
 });
 // Next's production route wrapper is a Proxy: native Undici private fields
 // cannot be accessed by passing that wrapper to the Request copy constructor.
 const wrapped = new Proxy(original, { get(target, property) { return Reflect.get(target, property, target); } });
 const response = await GET(wrapped, context("get-session"));
 expect(response.status).toBe(200);
 expect(mocks.GET).toHaveBeenCalledOnce();
 const forwarded = mocks.GET.mock.calls[0][0] as Request;
 expect(forwarded.url).toBe(original.url);
 expect(forwarded.method).toBe("GET");
 expect(forwarded.headers.get("origin")).toBe("https://app.test");
 expect(forwarded.headers.get("cookie")).toBe("__Secure-neon-auth.session_token=fixture");
});

it("sanitizes spoofed and repeated callback context before delegating a new SDK magic link", async () => {
 const {POST}=await import("./route");
 await POST(new Request("https://app.test/api/auth/sign-in/magic-link",{method:"POST",body:JSON.stringify({email:"fixture@example.test",callbackURL:"/auth/callback?locale=en&locale=zh-HK&claim=Ab_cd-12&returnTo=%2Fzh-HK%2Fowner%2Fshop%3Ftab%3Devidence&method=github&token=private"})}),context("sign-in/magic-link"));
 expect(mocks.owner).toHaveBeenCalledOnce();
 expect(await mocks.owner.mock.calls[0][0].json()).toEqual({email:"fixture@example.test",slug:"Ab_cd-12",locale:"zh-HK",returnTo:"/zh-HK/owner/shop?tab=evidence",method:null});
});

it("forwards Google only with its allowlisted callback context", async () => {
 const {POST}=await import("./route");
 await POST(new Request("https://app.test/api/auth/sign-in/social",{method:"POST",body:JSON.stringify({provider:"google",callbackURL:"/auth/callback?locale=en&returnTo=%2Fen%2Fowner%2Fshop&method=google&token=private",errorCallbackURL:"/auth/callback?locale=en&returnTo=%2Fen%2Fowner%2Fshop&method=google&code=private"})}),context("sign-in/social"));
 expect(mocks.POST).toHaveBeenCalledOnce();
 const body=await mocks.POST.mock.calls[0][0].json();
 expect(body.callbackURL).toBe("/auth/callback?locale=en&returnTo=%2Fen%2Fowner%2Fshop&method=google");
 expect(body.errorCallbackURL).toBe("/auth/callback?locale=en&returnTo=%2Fen%2Fowner%2Fshop&method=google");
});

it("keeps a missing-context SDK callback on the bounded neutral callback path", async () => {
 const {POST}=await import("./route");
 await POST(new Request("https://app.test/api/auth/sign-in/social",{method:"POST",body:JSON.stringify({provider:"google",callbackURL:"/auth/callback"})}),context("sign-in/social"));
 const body=await mocks.POST.mock.calls[0][0].json();
 expect(body.callbackURL).toBe("/auth/callback?locale=zh-HK");
});

it.each([false,true])("email code delivery uses the existing recipient and mail budget guards (claim=%s)", async claim => {
 const {POST}=await import("./route");
 const response=await POST(new Request("https://app.test/api/auth/email-otp/send-verification-otp",{
  method:"POST",body:JSON.stringify({email:"fixture@example.test",type:"sign-in",callbackURL:`/auth/callback?locale=en&method=email${claim?"&claim=abcdef":""}`}),
 }),context("email-otp/send-verification-otp"));
 expect(response.status).toBe(200);
 const selected=claim?mocks.owner:mocks.invite;
 expect(selected).toHaveBeenCalledOnce();
 expect(await selected.mock.calls[0][0].json()).toMatchObject({email:"fixture@example.test",delivery:"code"});
 expect(mocks.POST).not.toHaveBeenCalled();
});

it("verifies a code through the SDK without forwarding the previous account or arbitrary options", async () => {
 const {POST}=await import("./route");
 mocks.POST.mockResolvedValue(Response.json({user:{id:"new-user"}},{headers:{"set-cookie":"__Secure-neon-auth.session_token=new-session; Path=/; Secure; HttpOnly"}}));
 const response=await POST(new Request("https://app.test/api/auth/sign-in/email-otp",{
  method:"POST",headers:{origin:"https://app.test",cookie:"__Secure-neon-auth.session_token=old; __Secure-neon-auth.local.session_data=cached",authorization:"Bearer old"},
  body:JSON.stringify({email:"FIXTURE@example.test",otp:"123456",role:"owner",callbackURL:"https://evil.example"}),
 }),context("sign-in/email-otp"));
 expect(response.status).toBe(200);
 expect(response.headers.get("set-cookie")).toContain("session_token=new-session");
 expect(mocks.rateLimit).toHaveBeenCalledWith(expect.objectContaining({scope:"owner_otp_verify",identifier:"fixture@example.test",failClosed:true}));
 const forwarded=mocks.POST.mock.calls[0][0] as Request;
 expect(await forwarded.json()).toEqual({email:"fixture@example.test",otp:"123456"});
 expect(forwarded.headers.get("cookie")).toBeNull();
 expect(forwarded.headers.get("authorization")).toBeNull();
});

it.each([{allowed:false,retryAfterSeconds:60},{allowed:false,unavailable:true}])("fails closed before code verification when the rate limiter refuses: %j", async decision => {
 mocks.rateLimit.mockResolvedValue(decision);
 const {POST}=await import("./route");
 const response=await POST(new Request("https://app.test/api/auth/sign-in/email-otp",{
  method:"POST",headers:{origin:"https://app.test"},body:JSON.stringify({email:"fixture@example.test",otp:"123456"}),
 }),context("sign-in/email-otp"));
 expect(response.status).toBe(decision.unavailable?503:429);
 expect(mocks.POST).not.toHaveBeenCalled();
});

it.each(["https://outside.test","null",""])("rejects cross-origin code verification (%s)", async origin => {
 const {POST}=await import("./route");
 const response=await POST(new Request("https://app.test/api/auth/sign-in/email-otp",{
  method:"POST",headers:origin?{origin}:{},body:JSON.stringify({email:"fixture@example.test",otp:"123456"}),
 }),context("sign-in/email-otp"));
 expect(response.status).toBe(400);
 expect(mocks.POST).not.toHaveBeenCalled();
 expect(mocks.rateLimit).not.toHaveBeenCalled();
});

it.each([null, [], {email:"bad",otp:"123456"}, {email:"fixture@example.test",otp:"12345"}, {email:"fixture@example.test",otp:123456}])("rejects malformed code input before verification: %j", async body => {
 const {POST}=await import("./route");
 const response=await POST(new Request("https://app.test/api/auth/sign-in/email-otp",{
  method:"POST",headers:{origin:"https://app.test"},body:JSON.stringify(body),
 }),context("sign-in/email-otp"));
 expect(response.status).toBe(400);
 expect(mocks.POST).not.toHaveBeenCalled();
 expect(mocks.rateLimit).not.toHaveBeenCalled();
});
it.each(["email-verification","forget-password","email-change"])("does not expose other OTP mail operations: %s", async type => {
 const {POST}=await import("./route");
 const response=await POST(new Request("https://app.test/api/auth/email-otp/send-verification-otp",{
  method:"POST",body:JSON.stringify({email:"fixture@example.test",type,callbackURL:"/auth/callback"}),
 }),context("email-otp/send-verification-otp"));
 expect(response.status).toBe(400);
 expect(mocks.owner).not.toHaveBeenCalled();
 expect(mocks.invite).not.toHaveBeenCalled();
 expect(mocks.POST).not.toHaveBeenCalled();
});
