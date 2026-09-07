import 'server-only';
import { cookies, headers } from 'next/headers';
import { createFixtureIdentityProvider, assertFixtureIdentityContext } from './identity-provider';
import { assertLocalOrigin } from './safety';
export const FIXTURE_COOKIE = 'sme_local_fixture_session';
export async function fixtureContext(request?: Request) {
 const origin = process.env.APP_ORIGIN ?? '';
 const requestOrigin = request ? new URL(request.url).origin : `http://${(await headers()).get('host')}`;
 const context = {nodeEnv:process.env.NODE_ENV,testMode:process.env.SME_TEST_IDENTITY,origin,requestOrigin};
 assertFixtureIdentityContext(context);
 assertLocalOrigin(process.env.SME_TEST_IDENTITY_URL ?? '');
 return context;
}
export async function fixtureRequest(path: string, body?: unknown, request?: Request) {
 await fixtureContext(request);
 const token = request ? (request.headers.get('cookie') ?? '').split(';').map(v=>v.trim()).find(v=>v.startsWith(`${FIXTURE_COOKIE}=`))?.slice(FIXTURE_COOKIE.length+1) ?? '' : (await cookies()).get(FIXTURE_COOKIE)?.value ?? '';
 return fetch(`${process.env.SME_TEST_IDENTITY_URL}${path}`, {method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${process.env.SME_TEST_IDENTITY_SECRET}`},body:JSON.stringify({token,...(body as object ?? {})}),cache:'no-store',redirect:'error'});
}
export async function fixtureProvider(request?:Request) {
 const context = await fixtureContext(request);
 return createFixtureIdentityProvider(context, { session: async () => { const result=await fixtureRequest('/session',undefined,request); if(!result.ok) throw new Error('fixture_session_failed'); return result.json(); }, revoke: async () => { const result=await fixtureRequest('/revoke'); if(!result.ok) throw new Error('fixture_revoke_failed'); (await cookies()).delete(FIXTURE_COOKIE); } });
}
export async function sendFixtureMagicLink(input: {email:string;callbackURL:string}) {
 const response=await fixtureRequest('/send',input); return {error:response.ok ? null : {message:'fixture_delivery_failed'}};
}
export async function handleFixtureAuth(request: Request, path: string): Promise<Response> {
 await fixtureContext(request);
 if(request.method === 'GET' && path === 'verify') {
  const result=await fixtureRequest('/redeem',{code:new URL(request.url).searchParams.get('token')},request);
  const data=await result.json();
  if(!result.ok) return Response.redirect(`${process.env.APP_ORIGIN}/en/owner/sign-in?error=invalid_token`,303);
  return new Response(null,{status:303,headers:{location:data.callbackURL,'set-cookie':`${FIXTURE_COOKIE}=${data.token}; HttpOnly; SameSite=Lax; Path=/`}});
 }
 if(path === 'sign-out' && request.method === 'POST') { await (await fixtureProvider()).signOut(); return Response.json({success:true}); }
 if(path === 'get-session') return Response.json(null);
 return Response.json({error:'fixture_auth_unsupported'}, {status:404});
}
