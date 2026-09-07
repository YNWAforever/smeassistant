import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({fail:false,GET:vi.fn(),POST:vi.fn(),owner:vi.fn(),invite:vi.fn()}));
vi.mock("@/lib/identity/neon",()=>({getNeonAuth:()=>{if(mocks.fail)throw new Error("private config");return {handler:()=>({GET:mocks.GET,POST:mocks.POST})};}}));
vi.mock("@/app/api/owner/magic-link/route",()=>({POST:mocks.owner}));
vi.mock("@/app/api/workspace-invites/magic-link/route",()=>({POST:mocks.invite}));
const context=(path:string)=>({params:Promise.resolve({path:path.split("/")})});
beforeEach(()=>{vi.clearAllMocks();mocks.fail=false;mocks.GET.mockResolvedValue(Response.json(null));mocks.POST.mockResolvedValue(Response.json({ok:true}));mocks.owner.mockResolvedValue(Response.json({ok:true}));mocks.invite.mockResolvedValue(Response.json({ok:true}));});
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
