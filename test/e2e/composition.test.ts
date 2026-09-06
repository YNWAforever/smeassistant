import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
const state=vi.hoisted(()=>({host:'localhost:3000'}));
vi.mock('next/headers',()=>({headers:async()=>new Headers({host:state.host}),cookies:async()=>({get:()=>({value:'forged'}),delete:vi.fn()})}));
vi.mock('../../lib/identity/neon',()=>({getNeonAuth:()=>{throw new Error('managed_provider_must_not_be_called');}}));
import {GET} from '../../app/api/auth/[...path]/route';
import {proxy} from '../../proxy';
import {getUser} from '../../lib/auth';
import {handleFixtureAuth} from './composition';
describe('fixture authentication cannot escape local test composition',()=>{
 beforeEach(()=>{vi.stubEnv('SME_TEST_IDENTITY','owned-local');vi.stubEnv('SME_TEST_IDENTITY_URL','http://127.0.0.1:3001');vi.stubEnv('SME_TEST_IDENTITY_SECRET','fixture-secret');vi.stubEnv('APP_ORIGIN','http://localhost:3000');vi.stubEnv('NODE_ENV','development');state.host='localhost:3000';});
 afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
 it.each(['production','nonlocal'] as const)('handler, proxy and application identity reject %s before transport',async(mode)=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('transport must remain untouched'));
  if(mode==='production')vi.stubEnv('NODE_ENV','production');else{vi.stubEnv('APP_ORIGIN','https://external.example');state.host='external.example';}
  const url=mode==='production'?'http://localhost:3000':'https://external.example';
  expect((await GET(new Request(`${url}/api/auth/verify?token=forged`),{params:Promise.resolve({path:['verify']})})).status).toBe(503);
  const gate=await proxy(new NextRequest(`${url}/en/owner/select-workspace`,{headers:{cookie:'sme_local_fixture_session=forged'}}));expect(gate.status).toBe(307);expect(gate.headers.get('location')).toContain('/owner/sign-in');
  await expect(getUser()).rejects.toThrow('fixture_identity_forbidden');
  expect(fetch).not.toHaveBeenCalled();
 });
 it('rejects request Host disagreement even with a valid fixture cookie',async()=>{state.host='attacker.example';await expect(getUser()).rejects.toThrow('fixture_identity_forbidden');});
 it('direct test handler refuses nonloopback request origin',async()=>{await expect(handleFixtureAuth(new Request('https://external.example/api/auth/verify?token=forged'),'verify')).rejects.toThrow('fixture_identity_forbidden');});
});
