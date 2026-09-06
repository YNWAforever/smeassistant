import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createViewerToken, encodeViewerGrantCookie } from '@/lib/report-access/token';
const mocks=vi.hoisted(()=>({cookie:undefined as string|undefined,grant:vi.fn(),entitled:undefined as boolean|undefined}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>mocks.cookie ? {value:mocks.cookie}:undefined})}));
vi.mock('@/lib/auth',()=>({getUser:async()=>({id:'user',email:'fixture@example.test',verified:true}),signOut:async()=>undefined}));
vi.mock('@/lib/workspace/callback-queries',()=>({bindPendingMembership:async()=>null,findOwnedWorkspace:async()=>({data:{workspaceId:'workspace'},error:null}),createWorkspaceWithOwner:vi.fn(),attachJobToWorkspace:vi.fn()}));
vi.mock('@/lib/repositories/claims',()=>({claimsRepository:{jobBySlug:vi.fn(),firstLeadEmail:vi.fn()}}));
vi.mock('@/lib/repositories/reports',()=>({reportsRepository:()=>({findViewerGrant:mocks.grant})}));
vi.mock('@/lib/workspace/claim-scan',()=>({claimScan:async (input:{hasViewerGrant:(id:string)=>Promise<boolean>})=>{mocks.entitled=await input.hasViewerGrant('job-1');return {kind:'fixture'};}}));
import { GET } from './route';
const token=createViewerToken();
beforeEach(()=>{vi.clearAllMocks();mocks.entitled=undefined;mocks.cookie=encodeViewerGrantCookie('grant-1',token.rawToken);mocks.grant.mockResolvedValue({id:'grant-1',job_id:'job-1',token_hash:token.tokenHash,expires_at:new Date(Date.now()+60000).toISOString(),revoked_at:null});vi.stubGlobal('fetch',()=>{throw new Error('transport forbidden');});});
afterEach(()=>vi.unstubAllGlobals());
async function run(){return GET(new Request('https://fixture.test/auth/callback?claim=abcdef'));}
it('uses the existing Neon grant repository with both job and presented grant identifiers',async()=>{await run();expect(mocks.entitled).toBe(true);expect(mocks.grant).toHaveBeenCalledWith('job-1','grant-1');});
it.each([{job_id:'foreign'},{revoked_at:'2026-01-01'},{expires_at:'bad'},{expires_at:'2020-01-01'},{token_hash:'0'.repeat(64)}])('rejects invalid grant %j',async patch=>{mocks.grant.mockResolvedValue({...await mocks.grant(),...patch});await run();expect(mocks.entitled).toBe(false);});
it('does not look up absent or malformed cookies',async()=>{for(const cookie of [undefined,'broken']){mocks.cookie=cookie;await run();expect(mocks.entitled).toBe(false);}expect(mocks.grant).not.toHaveBeenCalled();});
it('fails closed on SQL errors without leaking details',async()=>{mocks.grant.mockRejectedValue(new Error('private database details'));const error=vi.spyOn(console,'error').mockImplementation(()=>{});const res=await run();expect(res.headers.get('location')).toContain('error=auth_unavailable');expect(res.headers.get('location')).not.toContain('private');error.mockRestore();});
