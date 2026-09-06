import 'server-only';
import { getNeonAuth, neonIdentityProvider } from './neon';
export async function identityProvider() {
 if(process.env.SME_TEST_IDENTITY) return (await import('../../test/e2e/composition')).fixtureProvider();
 return neonIdentityProvider;
}
export async function sendMagicLink(input: {email:string; callbackURL:string}) {
 if(process.env.SME_TEST_IDENTITY) return (await import('../../test/e2e/composition')).sendFixtureMagicLink(input);
 return getNeonAuth().signIn.magicLink(input);
}
