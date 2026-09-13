import type { Pool } from "pg";
import type { SessionUser } from "@/lib/auth";
import { membershipRepository } from "@/lib/repositories/membership";
import { claimsRepository, type OwnerWorkspaceInput } from "@/lib/repositories/claims";

/** Verified app identity is mandatory; recipient binding is one transaction. */
export async function bindPendingMembership(user: SessionUser): Promise<string | null> {
 return membershipRepository.bindPending(user);
}

/** Caller chooses best-effort BD signaling versus fail-closed claim authorization. */
export async function findOwnedWorkspace(userId: string): Promise<{
 data: {workspaceId:string} | null; error: {message:string} | null;
}> {
 try { return {data: await membershipRepository.ownedWorkspace(userId), error:null}; }
 catch { return {data:null,error:{message:"workspace lookup failed"}}; }
}

/** Workspace and accepted owner are inserted atomically after merchant proof. */
export async function createWorkspaceWithOwner(input:OwnerWorkspaceInput,db?:Pick<Pool,"query">): Promise<{id:string;slug:string}> {
 // Forwarded only when supplied, so a caller that passes no executor delegates
 // with exactly the arguments it always did -- an existing test pins that shape.
 return db ? claimsRepository.createWorkspaceWithOwner(input,db) : claimsRepository.createWorkspaceWithOwner(input);
}

/** False is a lost claim race; database failures remain errors. */
export async function attachJobToWorkspace(jobId:string,workspaceId:string,db?:Pick<Pool,"query">): Promise<boolean> {
 return db ? claimsRepository.attachJob(jobId,workspaceId,db) : claimsRepository.attachJob(jobId,workspaceId);
}
