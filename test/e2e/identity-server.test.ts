import {afterEach,describe,it,expect} from 'vitest';
import {startIdentityServer} from './identity-server';
describe('local identity service contracts',()=>{
 let server:Awaited<ReturnType<typeof startIdentityServer>>|undefined;
 afterEach(async()=>server?.stop());
 const app='http://localhost:3000',secret='per-run-fixture-secret';
 const post=(path:string,body:object,authorization=secret)=>fetch(`${server!.url}${path}`,{method:'POST',headers:{authorization:`Bearer ${authorization}`,'content-type':'application/json','x-fixture-origin':app},body:JSON.stringify(body)});
 async function link(){await post('/send',{email:'owner@acceptance.test',callbackURL:`${app}/auth/callback?locale=en`});const list=await(await fetch(`${server!.url}/api/v1/messages`)).json();expect(list.messages[0].To[0].Address).toBe('owner@acceptance.test');return list.messages[0].Text as string;}
 it('captures local mail, redeems only once and revokes the resulting identity',async()=>{
  server=await startIdentityServer(app,secret);const url=await link();const code=new URL(url).searchParams.get('token');
  const redeemed=await post('/redeem',{code});expect(redeemed.status).toBe(200);const {token}=await redeemed.json();
  expect(await(await post('/session',{token})).json()).toMatchObject({verified:true,email:'owner@acceptance.test'});
  expect((await post('/redeem',{code})).status).toBe(401);
  expect((await post('/revoke',{token})).status).toBe(200);expect(await(await post('/session',{token})).json()).toBeNull();
 });
 it('expired local contract cannot issue a session',async()=>{server=await startIdentityServer(app,secret);const url=await link();server.expireLink(url);expect((await post('/redeem',{code:new URL(url).searchParams.get('token')})).status).toBe(401);});
 it('hands a seeded Google-style identity to the managed callback exactly once',async()=>{
  server=await startIdentityServer(app,secret);
  expect((await post('/test/google-account',{email:'owner@acceptance.test'})).status).toBe(200);
  const started=await post('/google/start',{callbackURL:`${app}/auth/callback?locale=en&method=google`});
  expect(started.status).toBe(200);
  const {url}=await started.json() as {url:string};
  const authorize=await fetch(url,{redirect:'manual'});
  expect(authorize.status).toBe(303);
  const callback=new URL(authorize.headers.get('location')!,app);
  expect(callback.origin).toBe(app);
  expect(callback.pathname).toBe('/auth/callback');
  const verifier=callback.searchParams.get('neon_auth_session_verifier');
  expect(verifier).toBeTruthy();
  const exchanged=await post('/google/exchange',{verifier});
  expect(exchanged.status).toBe(200);
  const {token}=await exchanged.json() as {token:string};
  expect(await(await post('/session',{token})).json()).toMatchObject({email:'owner@acceptance.test',verified:true});
  expect((await post('/google/exchange',{verifier})).status).toBe(401);
 });
 it('holds the next local Google session until an authenticated release',async()=>{
  server=await startIdentityServer(app,secret);
  expect((await post('/test/google-account',{email:'owner@acceptance.test'})).status).toBe(200);
  expect((await post('/test/completion-hold',{})).status).toBe(200);
  const start=await post('/google/start',{callbackURL:`${app}/auth/callback?locale=en&method=google`});
  const {url}=await start.json() as {url:string};
  const callback=await fetch(url,{redirect:'manual'});
  const verifier=new URL(callback.headers.get('location')!,app).searchParams.get('neon_auth_session_verifier');
  const exchanged=await post('/google/exchange',{verifier});
  expect(exchanged.status).toBe(200);
  const {token}=await exchanged.json() as {token:string};
  let settled=false;
  const session=post('/session',{token}).then(result=>{settled=true;return result;});
  await new Promise(resolve=>setTimeout(resolve,20));
  expect(settled).toBe(false);
  expect((await post('/test/completion-release',{})).status).toBe(200);
  expect((await session).status).toBe(200);
 });
 it('rejects unknown controller secret, nonfixture recipients and external callbacks',async()=>{
  server=await startIdentityServer(app,secret);
  expect((await post('/send',{},'wrong-secret')).status).toBe(401);
  for(const body of [{email:'real@example.com',callbackURL:`${app}/auth/callback`},{email:'owner@acceptance.test',callbackURL:'https://external.example/auth/callback'}])expect((await post('/send',body)).status).toBe(400);
  expect((await(await fetch(`${server.url}/api/v1/messages`)).json()).messages).toEqual([]);
 });
 it('rejects mismatched and nonlocal origins for every new fixture controller',async()=>{
  const localApp='http://localhost:3000',localSecret='per-run-fixture-secret';
  const localServer=await startIdentityServer(localApp,localSecret);
  const controller=(path:string,origin:string)=>fetch(`${localServer.url}${path}`,{method:'POST',headers:{authorization:`Bearer ${localSecret}`,'content-type':'application/json','x-fixture-origin':origin},body:'{}'});
  try {
   for(const path of ['/test/google-account','/test/fault','/test/completion-hold','/test/completion-release']) {
    expect((await controller(path,'http://localhost:3999')).status).toBe(401);
    expect((await controller(path,'https://outside.example')).status).toBe(401);
   }
  } finally { await localServer.stop(); }
 });
});
