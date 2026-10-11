/** Browser finder deadline includes body parsing; provider health is a separate result. */
export class FinderRequestError extends Error {
 constructor(readonly code:'timeout'|'network_error'|'cancelled'){super(code);}
}
export async function fetchJsonWithinDeadline(url:string,init:RequestInit,timeoutMs=30_000):Promise<{response:Response;data:Record<string,unknown>}> {
 const controller=new AbortController();
 let rejectDeadline!:(reason:Error)=>void;
 const interrupted=new Promise<never>((_,reject)=>{rejectDeadline=reject;});
 const cancel=()=>{controller.abort();rejectDeadline(new FinderRequestError('cancelled'));};
 const timer=setTimeout(()=>{controller.abort();rejectDeadline(new FinderRequestError('timeout'));},timeoutMs);
 init.signal?.addEventListener('abort',cancel,{once:true});
 if(init.signal?.aborted)cancel();
 try{return await Promise.race([interrupted,(async()=>{
   const response=await fetch(url,{...init,signal:controller.signal});
   const raw=await response.json().catch(()=>({}));
   return {response,data:raw && typeof raw==='object' && !Array.isArray(raw)?raw:{}};
 })()]);}catch(error){if(error instanceof FinderRequestError)throw error;throw new FinderRequestError('network_error');}
 finally{clearTimeout(timer);init.signal?.removeEventListener('abort',cancel);}
}
