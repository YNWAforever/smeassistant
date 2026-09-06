import { afterEach, expect, it, vi } from 'vitest';
import Image from './opengraph-image';
afterEach(()=>vi.unstubAllGlobals());
it('renders the default OG PNG with the bundled font when remote fonts are unavailable',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('fixture forbids external font transport');}));
 const response=await Image();
 const bytes=new Uint8Array(await response.arrayBuffer());
 expect(response.headers.get('content-type')).toBe('image/png');
 expect([...bytes.slice(0,8)]).toEqual([137,80,78,71,13,10,26,10]);
 expect(bytes.length).toBeGreaterThan(1000);
});
