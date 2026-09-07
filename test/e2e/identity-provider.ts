import type { IdentityProvider, VerifiedIdentity } from '../../lib/identity/contracts';
import { assertLocalOrigin } from './safety';
export interface FixtureIdentityContext { nodeEnv: string | undefined; testMode: string | undefined; origin: string; requestOrigin: string }
export function assertFixtureIdentityContext(context: FixtureIdentityContext): void {
 try { if (context.nodeEnv === 'production' || !['test','development'].includes(context.nodeEnv ?? '') || context.testMode !== 'owned-local' || assertLocalOrigin(context.origin) !== assertLocalOrigin(context.requestOrigin)) throw new Error(); }
 catch { throw new Error('fixture_identity_forbidden'); }
}
export function createFixtureIdentityProvider(context: FixtureIdentityContext, ports: {session(): Promise<VerifiedIdentity | null>; revoke(): Promise<void>}): IdentityProvider {
 assertFixtureIdentityContext(context);
 return { async getIdentity() {assertFixtureIdentityContext(context); const identity=await ports.session();
 if(identity && (identity.provider!=='neon' || identity.verified!==true || !identity.subject?.trim() || !/^[^\s@]+@acceptance\.test$/.test(identity.email)))throw new Error('fixture_identity_invalid');
 return identity;}, async signOut() {assertFixtureIdentityContext(context); await ports.revoke();} };
}
