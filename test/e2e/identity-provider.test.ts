import { describe, expect, it } from 'vitest';
import { createFixtureIdentityProvider, assertFixtureIdentityContext } from './identity-provider';
const context = { nodeEnv: 'development', testMode: 'owned-local', origin: 'http://127.0.0.1:3000', requestOrigin: 'http://127.0.0.1:3000' };
describe('explicit local fixture identity', () => {
 it.each([{nodeEnv:'production'}, {testMode:undefined}, {origin:'https://production.example'}, {requestOrigin:'https://production.example'}, {requestOrigin:'http://127.0.0.1:3001'}])('refuses unsafe composition %j', override => {
  expect(() => assertFixtureIdentityContext({...context, ...override})).toThrow('fixture_identity_forbidden');
 });
 it('resolves only verified fixture session identities and revokes on signout', async () => {
  let active = true;
  const provider = createFixtureIdentityProvider(context, { session: async () => active ? { provider:'neon', subject:'fixture-owner', email:'owner@acceptance.test', verified:true } : null, revoke: async () => {active=false;} });
  expect(await provider.getIdentity()).toMatchObject({subject:'fixture-owner', verified:true});
  await provider.signOut(); expect(await provider.getIdentity()).toBeNull();
 });
 it('rechecks mutable process context before authentication', async () => {
  const mutable = {...context};
  const provider = createFixtureIdentityProvider(mutable, {session: async () => ({provider:'neon',subject:'fixture',email:'owner@acceptance.test',verified:true}), revoke: async()=>{}});
  mutable.nodeEnv='production'; await expect(provider.getIdentity()).rejects.toThrow('fixture_identity_forbidden');
 });
});

it('rejects an unverified identity returned by a broken local session port', async () => {
 const provider=createFixtureIdentityProvider(context,{session:async()=>({provider:'neon',subject:'fixture',email:'owner@acceptance.test',verified:false} as never),revoke:async()=>{}});
 await expect(provider.getIdentity()).rejects.toThrow('fixture_identity_invalid');
});
