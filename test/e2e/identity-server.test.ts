import {afterEach,describe,it,expect} from 'vitest';
import {startIdentityServer} from './identity-server';
describe('local identity service contracts',()=>{
 let server:Awaited<ReturnType<typeof startIdentityServer>>|undefined;
 afterEach(async()=>server?.stop());
 const app='http://localhost:3000',secret='per-run-fixture-secret';
 const post=(path:string,body:object,authorization=secret)=>fetch(`${server!.url}${path}`,{method:'POST',headers:{authorization:`Bearer ${authorization}`,'content-type':'application/json'},body:JSON.stringify(body)});
 async function link(){await post('/send',{email:'owner@acceptance.test',callbackURL:`${app}/auth/callback?locale=en`});const list=await(await fetch(`${server!.url}/api/v1/messages`)).json();expect(list.messages[0].To[0].Address).toBe('owner@acceptance.test');return list.messages[0].Text as string;}
 it('captures local mail, redeems only once and revokes the resulting identity',async()=>{
  server=await startIdentityServer(app,secret);const url=await link();const code=new URL(url).searchParams.get('token');
  const redeemed=await post('/redeem',{code});expect(redeemed.status).toBe(200);const {token}=await redeemed.json();
  expect(await(await post('/session',{token})).json()).toMatchObject({verified:true,email:'owner@acceptance.test'});
  expect((await post('/redeem',{code})).status).toBe(401);
  expect((await post('/revoke',{token})).status).toBe(200);expect(await(await post('/session',{token})).json()).toBeNull();
 });
 it('expired local contract cannot issue a session',async()=>{server=await startIdentityServer(app,secret);const url=await link();server.expireLink(url);expect((await post('/redeem',{code:new URL(url).searchParams.get('token')})).status).toBe(401);});
 it('rejects unknown controller secret, nonfixture recipients and external callbacks',async()=>{
  server=await startIdentityServer(app,secret);
  expect((await post('/send',{},'wrong-secret')).status).toBe(401);
  for(const body of [{email:'real@example.com',callbackURL:`${app}/auth/callback`},{email:'owner@acceptance.test',callbackURL:'https://external.example/auth/callback'}])expect((await post('/send',body)).status).toBe(400);
  expect((await(await fetch(`${server.url}/api/v1/messages`)).json()).messages).toEqual([]);
 });
});
