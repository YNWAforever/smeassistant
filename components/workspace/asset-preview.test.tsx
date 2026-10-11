// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {render,fireEvent,screen,cleanup,waitFor} from '@testing-library/react';
import {AssetPreview} from './asset-preview';
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();});
const asset={id:'asset',kind:'image' as const,storage_path:'workspace/asset/photo.jpg',filename:'photo.jpg',alt_text:'Photo',signedUrl:'https://fixture.test/expired'};
it('T17: lazy image error after 60 seconds renews only this asset once',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-12T00:00:00Z'));vi.advanceTimersByTime(61_000);vi.useRealTimers();
 const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({url:'https://fixture.test/fresh'})});vi.stubGlobal('fetch',fetch);
 render(<AssetPreview asset={asset} workspaceId='workspace' locale='en'/>);
 fireEvent.error(screen.getByAltText('Photo'));
 await waitFor(()=>expect(screen.getByAltText('Photo').getAttribute('src')).toBe('https://fixture.test/fresh'));
 fireEvent.error(screen.getByAltText('Photo'));expect(fetch).toHaveBeenCalledTimes(1);
 expect(fetch).toHaveBeenCalledWith('/api/workspaces/workspace/assets/asset/preview',expect.objectContaining({cache:'no-store'}));
});
it('T17: PDF link resolves permission and signing on demand rather than using an expired image URL',()=>{
 render(<AssetPreview asset={{...asset,kind:'menu',storage_path:'workspace/asset/menu.pdf',filename:'menu.pdf'}} workspaceId='workspace' locale='zh-HK'/>);
 expect(screen.getByRole('link').getAttribute('href')).toBe('/api/workspaces/workspace/assets/asset/preview?open=1');
 expect(screen.queryByRole('img')).toBeNull();
});
