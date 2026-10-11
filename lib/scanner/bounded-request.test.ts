import {afterEach,it,expect,vi} from 'vitest';
import {fetchJsonWithinDeadline} from './bounded-request';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it.each(['headers','body'])('T16: %s stall ends within the deadline even if abort is ignored',async part=>{
 vi.useFakeTimers();
 vi.stubGlobal('fetch',vi.fn(()=>part==='headers'?new Promise(()=>{}):Promise.resolve({json:()=>new Promise(()=>{})})));
 const pending=fetchJsonWithinDeadline('/fixture',{},1000);
 const rejection=expect(pending).rejects.toMatchObject({code:'timeout'});
 await vi.advanceTimersByTimeAsync(1001);await rejection;
});
it('T16: explicit cancellation is separate from network and timeouts',async()=>{
 const controller=new AbortController();vi.stubGlobal('fetch',vi.fn(()=>new Promise(()=>{})));
 const pending=fetchJsonWithinDeadline('/fixture',{signal:controller.signal},1000);
 const rejection=expect(pending).rejects.toMatchObject({code:'cancelled'});controller.abort();await rejection;
});
