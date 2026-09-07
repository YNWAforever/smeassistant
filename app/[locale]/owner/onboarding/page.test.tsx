import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({user:vi.fn(),job:vi.fn(),membership:vi.fn(),connection:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireUser:mocks.user}));
vi.mock("@/lib/repositories/membership",()=>({membershipRepository:{accepted:mocks.membership}}));
vi.mock("@/lib/repositories/claims",()=>({claimsRepository:{jobBySlug:mocks.job,hasActiveGoogleConnection:mocks.connection}}));
vi.mock("@/components/onboarding-page",()=>({OnboardingPage:()=>null}));
import Page from "./page";
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
