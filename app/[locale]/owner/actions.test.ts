import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({signOut:vi.fn()}));
vi.mock("@/lib/auth",()=>({signOut:mocks.signOut}));
vi.mock("next/navigation",()=>({redirect:(path:string)=>{throw new Error(`redirect:${path}`);}}));
beforeEach(()=>{mocks.signOut.mockReset();mocks.signOut.mockResolvedValue(undefined);});
it('T09: explicit account switch retains validated report and return path after app signout',async()=>{
  const {switchAccountAction}=await import('./actions');
  await expect(switchAccountAction('zh-HK','/zh-HK/owner/onboarding?claim=fixture-report','fixture-report')).rejects.toThrow(/redirect:\/zh-HK\/owner\/sign-in\?.*intent=switch_account/);
  expect(mocks.signOut).toHaveBeenCalledOnce();
});
it("returns to locale landing after successful revocation",async()=>{
 const {signOutAction}=await import("./actions");
 await expect(signOutAction("zh-TW")).rejects.toThrow("redirect:/zh-TW");
});
it("redirects safely with a visible unavailable error after local invalidation on revocation failure",async()=>{
 mocks.signOut.mockRejectedValue(new Error("identity_signout_failed"));
 const {signOutAction}=await import("./actions");
 await expect(signOutAction("en")).rejects.toThrow("redirect:/en/owner/sign-in?error=auth_unavailable");
});
