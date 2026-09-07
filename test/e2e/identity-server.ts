import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { assertLocalOrigin, listen } from './safety';
export async function startIdentityServer(app: string, secret: string) {
 assertLocalOrigin(app);
 const links = new Map<string,{email:string;callbackURL:string;expires:number}>();
 const sessions = new Map<string,{email:string;subject:string}>();
 const messages: {ID:string;To:{Address:string}[];HTML:string;Text:string}[]=[];
 const server=createServer(async(req,res)=>{
  const json=(value:unknown,status=200)=>{res.writeHead(status,{'content-type':'application/json'}).end(JSON.stringify(value));};
  try {
   if(req.method==='GET' && req.url==='/api/v1/messages') return json({messages:[...messages].reverse()});
   if(req.method==='GET' && req.url?.startsWith('/api/v1/message/')) return json(messages.find(m=>m.ID===req.url!.split('/').pop()) ?? {},200);
   if(req.headers.authorization!==`Bearer ${secret}`) return json({error:'unauthorized'},401);
   const chunks:Buffer[]=[];for await(const chunk of req) chunks.push(Buffer.from(chunk));
   const body=JSON.parse(Buffer.concat(chunks).toString());
   if(req.url==='/send') {
    const callback=new URL(body.callbackURL);
    if(callback.origin!==app || callback.pathname!=='/auth/callback' || !/^[^\s@]+@acceptance\.test$/.test(body.email)) return json({error:'unsafe_fixture_recipient_or_callback'},400);
    const code=randomBytes(32).toString('base64url');
    links.set(code,{email:body.email,callbackURL:callback.href,expires:Date.now()+60000});
    const link=`${app}/api/auth/verify?token=${code}`;
    messages.push({ID:randomUUID(),To:[{Address:body.email}],HTML:`<a href="${link}">Local contract sign-in</a>`,Text:link});
    return json({ok:true});
   }
   if(req.url==='/redeem') {
    const link=links.get(body.code);links.delete(body.code);
    if(!link || link.expires<=Date.now()) return json({error:'invalid_token'},401);
    const token=randomBytes(32).toString('base64url');sessions.set(token,{email:link.email,subject:`fixture:${link.email}`});
    return json({token,callbackURL:link.callbackURL});
   }
   if(req.url==='/session') {const identity=sessions.get(body.token);return json(identity ? {...identity,provider:'neon',verified:true} : null);}
   if(req.url==='/revoke') {sessions.delete(body.token);return json({ok:true});}
   return json({error:'not_found'},404);
  }catch{json({error:'invalid_request'},400);}
 });
 const url=await listen(server);
 return {url,expireLink(link:string){const target=new URL(link);if(target.origin!==app)throw new Error('unsafe_fixture_link');const entry=links.get(target.searchParams.get('token') ?? '');if(!entry)throw new Error('fixture_link_missing');entry.expires=0;},async stop(){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
