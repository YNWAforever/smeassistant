import {beforeEach,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({auth:vi.fn(),get:vi.fn(),sign:vi.fn()}));
vi.mock('@/lib/auth',()=>({authorizeWorkspaceRequest:state.auth}));
vi.mock('@/lib/workspace/assets',()=>({getAsset:state.get,signedUrlFor:state.sign}));
import {GET} from './route';
const workspaceId='11111111-1111-4111-8111-111111111111',assetId='22222222-2222-4222-8222-222222222222',locationId='33333333-3333-4333-8333-333333333333';
const params={params:Promise.resolve({workspaceId,assetId})};
beforeEach(()=>{vi.resetAllMocks();state.auth.mockResolvedValue({ok:true});state.get.mockResolvedValue({location_id:locationId,storage_path:`${workspaceId}/${assetId}/menu.pdf`});state.sign.mockResolvedValue('https://fixture.test/fresh');});
it('T17: renews an owned asset only after rechecking its stored location',async()=>{
 const response=await GET(new Request('https://app.test/preview'),params);
 expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');expect(await response.json()).toEqual({url:'https://fixture.test/fresh'});
 expect(state.auth).toHaveBeenLastCalledWith({id:workspaceId},{locationId});expect(state.sign).toHaveBeenCalledTimes(1);
 const open=await GET(new Request('https://app.test/preview?open=1'),params);expect(open.status).toBe(302);expect(open.headers.get('location')).toBe('https://fixture.test/fresh');
});
it.each([401,403,404])('T17: denied scope %s never signs',async status=>{
 state.auth.mockResolvedValueOnce({ok:true}).mockResolvedValueOnce({ok:false,status,code:'forbidden'});
 expect((await GET(new Request('https://app.test/preview'),params)).status).toBe(status);expect(state.sign).not.toHaveBeenCalled();
});
it('T17: rejects unknown/foreign path and fails closed on identity outage',async()=>{
 state.get.mockResolvedValueOnce({location_id:null,storage_path:'foreign/asset/file'});
 expect((await GET(new Request('https://app.test/preview'),params)).status).toBe(404);expect(state.sign).not.toHaveBeenCalled();
 state.auth.mockRejectedValueOnce(new Error('identity_session_failed'));
 expect((await GET(new Request('https://app.test/preview'),params)).status).toBe(503);expect(state.sign).not.toHaveBeenCalled();
});
