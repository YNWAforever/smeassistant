import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({bind:vi.fn(),owned:vi.fn(),create:vi.fn(),attach:vi.fn()}));
vi.mock("@/lib/repositories/membership",()=>({membershipRepository:{bindPending:mocks.bind,ownedWorkspace:mocks.owned}}));
vi.mock("@/lib/repositories/claims",()=>({claimsRepository:{createWorkspaceWithOwner:mocks.create,attachJob:mocks.attach}}));
import {bindPendingMembership,findOwnedWorkspace,createWorkspaceWithOwner,attachJobToWorkspace} from "./callback-queries";
beforeEach(()=>vi.resetAllMocks());
it("passes verified application identity to invitation binding",async()=>{
 const user={id:"app-user",email:"verified@example.test",verified:true};mocks.bind.mockResolvedValue("workspace");
 expect(await bindPendingMembership(user)).toBe("workspace");expect(mocks.bind).toHaveBeenCalledWith(user);
});
it("keeps ownership absence separate from an unavailable lookup",async()=>{
 mocks.owned.mockResolvedValue(null);expect(await findOwnedWorkspace("app-user")).toEqual({data:null,error:null});
 mocks.owned.mockRejectedValue(new Error("private SQL failure"));expect(await findOwnedWorkspace("app-user")).toEqual({data:null,error:{message:"workspace lookup failed"}});
});
it("returns accepted ownership without granting it from sign-in",async()=>{
 mocks.owned.mockResolvedValue({workspaceId:"workspace"});expect(await findOwnedWorkspace("app-user")).toEqual({data:{workspaceId:"workspace"},error:null});
 expect(mocks.create).not.toHaveBeenCalled();
});
it("delegates atomic workspace and owner creation",async()=>{
 const input={ownerUserId:"app-user",ownerEmail:"verified@example.test",businessName:"Shop",industry:null,district:null,market:"hk"};
 mocks.create.mockResolvedValue({id:"workspace",slug:"shop"});expect(await createWorkspaceWithOwner(input)).toEqual({id:"workspace",slug:"shop"});expect(mocks.create).toHaveBeenCalledWith(input);
});
it("preserves a lost claim race as false",async()=>{mocks.attach.mockResolvedValue(false);expect(await attachJobToWorkspace("job","workspace")).toBe(false);expect(mocks.attach).toHaveBeenCalledWith("job","workspace");});
it("propagates a failed claim write instead of reporting a lost race",async()=>{mocks.attach.mockRejectedValue(new Error("attach failed"));await expect(attachJobToWorkspace("job","workspace")).rejects.toThrow("attach failed");});
