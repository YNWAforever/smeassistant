export type VerifiedIdentity = { provider: "neon"; subject: string; email: string; verified: true };
export interface IdentityProvider {
 getIdentity(): Promise<VerifiedIdentity | null>;
 signOut(): Promise<void>;
}
export type ResolveApplicationUser = (identity: VerifiedIdentity) => Promise<{id: string; email: string; verified: true}>;
