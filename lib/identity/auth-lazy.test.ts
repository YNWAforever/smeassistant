import { expect, it, vi } from "vitest";
const imports=vi.hoisted(()=>({provider:vi.fn(),users:vi.fn()}));
vi.mock("./neon",()=>{imports.provider();return {neonIdentityProvider:{getIdentity:async()=>({provider:"neon",subject:"opaque",email:"fixture@example.test",verified:true})}};});
vi.mock("./users",()=>{imports.users();return {resolveApplicationUser:async()=>({id:"a8098c1a-f86e-41da-bd1a-00112444be1e",email:"fixture@example.test",verified:true})};});
vi.mock("../repositories/membership",()=>({membershipRepository:{}}));
it("loads identity modules only when getUser runs, not for authorization helper imports",async()=>{
 const auth=await import("../auth");
 expect(auth.roleAtLeast("owner","viewer")).toBe(true);
 expect(imports.provider).not.toHaveBeenCalled();expect(imports.users).not.toHaveBeenCalled();
 expect(await auth.getUser()).toMatchObject({id:"a8098c1a-f86e-41da-bd1a-00112444be1e",verified:true});
 expect(imports.provider).toHaveBeenCalledOnce();expect(imports.users).toHaveBeenCalledOnce();
});
