import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({user:vi.fn(),job:vi.fn(),membership:vi.fn(),connection:vi.fn(),workspaces:vi.fn(),locations:vi.fn(),brand:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireUser:mocks.user}));
vi.mock("@/lib/repositories/membership",()=>({membershipRepository:{accepted:mocks.membership}}));
vi.mock("@/lib/repositories/claims",()=>({claimsRepository:{jobBySlug:mocks.job,hasActiveGoogleConnection:mocks.connection}}));
vi.mock("@/components/onboarding-page",()=>({OnboardingPage:()=>null}));
vi.mock("@/lib/repositories/access-requests",()=>({accessRequestRepository:()=>({latestForUserAndReport:async()=>null})}));
vi.mock("@/lib/repositories/workspace-read",()=>({workspaceReadRepository:()=>({workspaces:mocks.workspaces,locations:mocks.locations})}));
vi.mock("@/lib/repositories/brand",()=>({brandRepository:()=>({get:mocks.brand})}));
import Page from "./page";
import { callbackHref, parseAuthFlow } from "@/lib/identity/sign-in-flow";
const render=()=>Page({params:Promise.resolve({locale:"en"}),searchParams:Promise.resolve({claim:"abc123",claimed:"1"})});
beforeEach(()=>{
 vi.resetAllMocks();mocks.user.mockResolvedValue({id:"mapped-app-id",email:"owner@example.test",verified:true});
 mocks.job.mockResolvedValue({share_slug:"abc123",business_name:"Shop",workspace_id:"workspace",input_snapshot:{instagramHandle:"@shop"}});
 mocks.membership.mockResolvedValue({role:"owner"});mocks.connection.mockResolvedValue(true);
 mocks.workspaces.mockResolvedValue([{id:"workspace",slug:"shop-a",business_name:"Confirmed Shop"}]);mocks.locations.mockResolvedValue([]);mocks.brand.mockResolvedValue(null);
});
it("uses mapped app ownership before showing connected onboarding steps",async()=>{
 const result=await render();expect(result.props).toMatchObject({ownsWorkspace:true,gbpConnected:true,evidence:{igHandle:"@shop"}});
 expect(mocks.membership).toHaveBeenCalledWith("mapped-app-id","workspace");
});
it("sends an accepted owner directly to essentials without a connections step", async () => {
 const result = await render();
 expect(result.props.resumeStep).toBe(2);
});
it("prefills the report's recorded address rather than a district", async () => {
 mocks.job.mockResolvedValue({share_slug:"abc123",business_name:"Shop",workspace_id:"workspace",district:"Central",input_snapshot:{address:"12 Fixture Road"}});
 const result = await render();
 expect(result.props.evidence).toMatchObject({address:"12 Fixture Road",district:"Central"});
});
it("does not treat a saved district as a confirmed street address", async () => {
 mocks.workspaces.mockResolvedValue([{business_name:"Confirmed Group"}]);
 mocks.locations.mockResolvedValue([{name:"Central Branch",address:null,district:"Central"}]);
 const result = await render();
 expect(result.props.saved.locationAddress).toBeNull();
});
it("does not unlock ownership from a claimed query flag or viewer membership",async()=>{
 mocks.membership.mockResolvedValue({role:"viewer"});const result=await render();
 expect(result.props).toMatchObject({ownsWorkspace:false,gbpConnected:false});expect(mocks.connection).not.toHaveBeenCalled();expect(mocks.brand).not.toHaveBeenCalled();
});
it.each(["en", "zh-HK", "zh-TW"])("carries real profile presence and canonical workspace into the %s owner form", async locale => {
 mocks.brand.mockResolvedValue({voice:"professional",approved_claims:["Confirmed"]});
 const result=await Page({params:Promise.resolve({locale}),searchParams:Promise.resolve({claim:"abc123"})});
 expect(result.props.saved).toMatchObject({brandProfileExists:true,workspaceSlug:"shop-a",voice:"professional"});
 expect(result.props.scopeKey).toContain("mapped-app-id");
 expect(result.props.scopeKey).toContain("workspace");
 expect(mocks.brand).toHaveBeenCalledWith("workspace");
});
it("distinguishes an existing profile with no voice from no profile", async () => {
 mocks.brand.mockResolvedValue({voice:null,approved_claims:[]});
 expect((await render()).props.saved).toMatchObject({brandProfileExists:true,voice:null});
 mocks.brand.mockResolvedValue(null);
 expect((await render()).props.saved).toMatchObject({brandProfileExists:false,voice:null});
});
it("fails closed when existing settings cannot be read", async () => {
 mocks.brand.mockRejectedValue(new Error("Fixture lookup failure"));
 const result=await render();
 expect(result.props).toMatchObject({saved:null,savedUnavailable:true,ownsWorkspace:true});
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
