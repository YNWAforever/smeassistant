import 'server-only';

import { cookies, headers } from 'next/headers';

import { createFixtureIdentityProvider, assertFixtureIdentityContext } from './identity-provider';
import { assertLocalOrigin } from './safety';

export const FIXTURE_COOKIE = 'sme_local_fixture_session';

type FixtureSession = { email: string; subject: string; provider: 'neon'; verified: true; fixtureFault?: 'binding' | 'mapping' | null };

export async function fixtureContext(request?: Request) {
 const origin = process.env.APP_ORIGIN ?? '';
 const requestOrigin = request ? new URL(request.url).origin : `http://${(await headers()).get('host')}`;
 const context = { nodeEnv: process.env.NODE_ENV, testMode: process.env.SME_TEST_IDENTITY, origin, requestOrigin };
 assertFixtureIdentityContext(context);
 assertLocalOrigin(process.env.SME_TEST_IDENTITY_URL ?? '');
 return context;
}

export async function fixtureRequest(path: string, body?: unknown, request?: Request) {
 const context = await fixtureContext(request);
 const token = request
  ? (request.headers.get('cookie') ?? '').split(';').map(value => value.trim()).find(value => value.startsWith(`${FIXTURE_COOKIE}=`))?.slice(FIXTURE_COOKIE.length + 1) ?? ''
  : (await cookies()).get(FIXTURE_COOKIE)?.value ?? '';
 return fetch(`${process.env.SME_TEST_IDENTITY_URL}${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.SME_TEST_IDENTITY_SECRET}`, 'x-fixture-origin': context.origin },
  body: JSON.stringify({ token, ...(body as object ?? {}) }), cache: 'no-store', redirect: 'error',
 });
}

export async function fixtureProvider(request?: Request) {
 const context = await fixtureContext(request);
 return createFixtureIdentityProvider(context, {
  session: async () => {
   const result = await fixtureRequest('/session', undefined, request);
   if (!result.ok) throw new Error('fixture_session_failed');
   return result.json() as Promise<FixtureSession | null>;
  },
  revoke: async () => {
   const result = await fixtureRequest('/revoke');
   if (!result.ok) throw new Error('fixture_revoke_failed');
   (await cookies()).delete(FIXTURE_COOKIE);
  },
 });
}

export async function sendFixtureMagicLink(input: { email: string; callbackURL: string }) {
 const response = await fixtureRequest('/send', input);
 return { error: response.ok ? null : { message: 'fixture_delivery_failed' } };
}

export async function exchangeFixtureVerifier(request: Request): Promise<Response | null> {
 await fixtureContext(request);
 const verifier = new URL(request.url).searchParams.get('neon_auth_session_verifier');
 if (!verifier) return null;
 const result = await fixtureRequest('/google/exchange', { verifier });
 if (!result.ok) return null;
 const data = await result.json() as { token?: unknown };
 if (typeof data.token !== 'string' || !data.token) return null;
 const clean = new URL(request.url);
 clean.searchParams.delete('neon_auth_session_verifier');
 return new Response(null, { status: 307, headers: { location: clean.toString(), 'set-cookie': `${FIXTURE_COOKIE}=${data.token}; HttpOnly; SameSite=Lax; Path=/` } });
}

export async function handleFixtureAuth(request: Request, path: string): Promise<Response> {
 await fixtureContext(request);
 if (request.method === 'GET' && path === 'verify') {
  const result = await fixtureRequest('/redeem', { code: new URL(request.url).searchParams.get('token') }, request);
  const data = await result.json() as { token?: string; callbackURL?: string };
  if (!result.ok || !data.token || !data.callbackURL) return Response.redirect(`${process.env.APP_ORIGIN}/en/owner/sign-in?error=invalid_token`, 303);
  return new Response(null, { status: 303, headers: { location: data.callbackURL, 'set-cookie': `${FIXTURE_COOKIE}=${data.token}; HttpOnly; SameSite=Lax; Path=/` } });
 }
 if (path === 'sign-in/social' && request.method === 'POST') {
  const input = await request.json() as { callbackURL?: unknown; provider?: unknown };
  if (input.provider !== 'google' || typeof input.callbackURL !== 'string') return Response.json({ error: 'invalid_fixture_social_request' }, { status: 400 });
  let callbackURL: string;
  try {
   const callback = new URL(input.callbackURL, process.env.APP_ORIGIN);
   if (callback.origin !== process.env.APP_ORIGIN || callback.pathname !== '/auth/callback') throw new Error('fixture_callback_forbidden');
   callbackURL = callback.href;
  } catch { return Response.json({ error: 'invalid_fixture_social_request' }, { status: 400 }); }
  const result = await fixtureRequest('/google/start', { callbackURL });
  const data = await result.json() as { url?: unknown };
  if (!result.ok || typeof data.url !== 'string') return Response.json({ error: 'fixture_social_unavailable' }, { status: 503 });
  return Response.json({ url: data.url, redirect: true }, { headers: { location: data.url } });
 }
 if (path === 'sign-out' && request.method === 'POST') { await (await fixtureProvider()).signOut(); return Response.json({ success: true }); }
 if (path === 'get-session') return Response.json(null);
 return Response.json({ error: 'fixture_auth_unsupported' }, { status: 404 });
}