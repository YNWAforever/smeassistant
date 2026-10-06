import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({user:vi.fn(),job:vi.fn(),membership:vi.fn(),connection:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireUser:mocks.user}));
vi.mock("@/lib/repositories/membership",()=>({membershipRepository:{accepted:mocks.membership}}));
vi.mock("@/lib/repositories/claims",()=>({claimsRepository:{jobBySlug:mocks.job,hasActiveGoogleConnection:mocks.connection}}));
vi.mock("@/components/onboarding-page",()=>({OnboardingPage:()=>null}));
vi.mock("@/lib/repositories/access-requests",()=>({accessRequestRepository:()=>({latestForUser:async()=>null})}));
vi.mock("@/lib/repositories/workspace-read",()=>({workspaceReadRepository:()=>({workspaces:async()=>[],locations:async()=>[]})}));
vi.mock("@/lib/repositories/brand",()=>({brandRepository:()=>({get:async()=>null})}));
import Page from "./page";
import { callbackHref, parseAuthFlow } from "@/lib/identity/sign-in-flow";
const render=()=>Page({params:Promise.resolve({locale:"en"}),searchParams:Promise.resolve({claim:"abc123",claimed:"1"})});
beforeEach(()=>{
 vi.resetAllMocks();mocks.user.mockResolvedValue({id:"mapped-app-id",email:"owner@example.test",verified:true});
 mocks.job.mockResolvedValue({share_slug:"abc123",business_name:"Shop",workspace_id:"workspace",input_snapshot:{instagramHandle:"@shop"}});
 mocks.membership.mockResolvedValue({role:"owner"});mocks.connection.mockResolvedValue(true);
});
it("uses mapped app ownership before showing connected onboarding steps",async()=>{
 const result=await render();expect(result.props).toMatchObject({ownsWorkspace:true,gbpConnected:true,evidence:{igHandle:"@shop"}});
 expect(mocks.membership).toHaveBeenCalledWith("mapped-app-id","workspace");
});
it("does not unlock ownership from a claimed query flag or viewer membership",async()=>{
 mocks.membership.mockResolvedValue({role:"viewer"});const result=await render();
 expect(result.props).toMatchObject({ownsWorkspace:false,gbpConnected:false});expect(mocks.connection).not.toHaveBeenCalled();
});
it("degrades failed evidence to an empty onboarding state",async()=>{
 mocks.job.mockRejectedValue(new Error("fixture unavailable"));const result=await render();expect(result.props).toMatchObject({evidence:null,ownsWorkspace:false});
});

it("keeps the same underscore report from sign-in callback through onboarding without granting ownership", async () => {
 const slug = "3cuOKFmHdiYf00BOs27E_NO1";
 const flow = parseAuthFlow(new URLSearchParams({locale:"en",claim:slug,method:"google"}));
 const callback = new URL(callbackHref(flow), "https://fixture.test");
 mocks.job.mockResolvedValue({share_slug:slug,business_name:"Fixture Shop",workspace_id:null,input_snapshot:{}});
 const result = await Page({params:Promise.resolve({locale:"en"}),searchParams:Promise.resolve({claim:callback.searchParams.get("claim")!})});
 expect(result.props).toMatchObject({claim:slug,evidence:{shareSlug:slug,businessName:"Fixture Shop"},ownsWorkspace:false,resumeStep:1});
 expect(mocks.user).toHaveBeenCalledWith("en",`/en/owner/onboarding?claim=${slug}`);
 expect(mocks.membership).not.toHaveBeenCalled();
});

it.each(["short", "a".repeat(65), " has spaces ", "abc/def", "%2Fstaff", "%252Fstaff", "https://evil.test/report"])("rejects invalid report context without a lookup: %s", async (claim) => {
 const result = await Page({params:Promise.resolve({locale:"en"}),searchParams:Promise.resolve({claim})});
 expect(result.props).toMatchObject({evidence:null,ownsWorkspace:false});
 expect(mocks.job).not.toHaveBeenCalled();
 expect(mocks.user).toHaveBeenCalledWith("en","/en/owner/onboarding");
});
