import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeWorkspaceRequest, type RouteAuth } from "@/lib/auth";
import { conversationHomeEnabled } from "@/lib/workspace/conversation-flag";
import { conversationConnectorRepository } from "@/lib/repositories/conversation-connectors";
import { googleOAuthConfigured, GSC_SCOPE_REQUIRED } from "@/lib/oauth/google-connection";
import { readGscContext } from "@/lib/connectors/gsc";
import { researchStatus, runResearch } from "@/lib/connectors/research";
import type { ConnectorContext } from "@/lib/connectors/types";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
export const runtime="nodejs";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
const bad=(error:string,status=400)=>NextResponse.json({error},{status,headers});
type Context={params:Promise<{workspaceId:string}>};
function permitted(auth:Extract<RouteAuth,{ok:true}>,workspaceId:string,locationId:string|null):boolean {
  return auth.membership.workspaceId===workspaceId&&(locationId===null||auth.membership.role!=="manager"||auth.membership.locationScope===null||auth.membership.locationScope.includes(locationId));
}
async function gscStatus(workspaceId:string,url:string|null,market:string):Promise<ConnectorContext>{
  const context:ConnectorContext={source:"gsc",status:"empty",scope:url??"",items:[],observedAt:null};
  if(!googleOAuthConfigured())return {...context,status:"disabled"};
  if(!["hk","tw"].includes(market)||!url)return {...context,status:"unsupported"};
  const row=await conversationConnectorRepository().gscConnection(workspaceId);
  return {...context,...(row?.status==="active"&&row.scopes.includes(GSC_SCOPE_REQUIRED)?{reason:"gsc_connected"}:{}),status:!row||row.status==="revoked"?"disconnected":row.status!=="active"||!row.scopes.includes(GSC_SCOPE_REQUIRED)?"reconnect":"empty"};
}
function location(value:unknown):string|null|undefined{return value==="all"?null:typeof value==="string"&&UUID.test(value)?value.toLowerCase():undefined;}
export async function GET(req:Request,{params}:Context){
  if(!conversationHomeEnabled())return bad("not_enabled",404);
  const {workspaceId}=await params;if(!UUID.test(workspaceId))return bad("not_found",404);
  const query=new URL(req.url).searchParams,locationId=location(query.get("location_id"));if(locationId===undefined||query.getAll("location_id").length!==1)return bad("invalid_location");
  try{
    const auth=await authorizeWorkspaceRequest({id:workspaceId},locationId?{locationId}:{});if(!auth.ok)return bad(auth.code,auth.status);if(!permitted(auth,workspaceId,locationId))return bad("forbidden",403);
    const target=locationId?await conversationConnectorRepository().target(workspaceId,locationId):{url:null,market:"unsupported"};if(!target)return bad("not_found",404);
    const input={workspaceId,locationId,url:target.url,market:target.market};
    const connectors=await Promise.all([gscStatus(workspaceId,target.url,target.market),researchStatus({...input,provider:"firecrawl"}),researchStatus({...input,provider:"dataforseo"})]);
    return NextResponse.json({connectors},{headers});
  }catch{return bad("unavailable",503);}
}
const Input=z.object({provider:z.enum(["gsc","firecrawl","dataforseo"]),location_id:z.string().max(36),keyword:z.string().trim().max(120).optional(),disconnect:z.boolean().optional()}).strict();
export async function POST(req:Request,{params}:Context){
  if(!conversationHomeEnabled())return bad("not_enabled",404);
  const {workspaceId}=await params;if(!UUID.test(workspaceId))return bad("not_found",404);
  if(Number(req.headers.get("content-length"))>4096)return bad("invalid_request");
  let body;try{const text=await req.text();if(text.length>4096)return bad("invalid_request");body=Input.parse(JSON.parse(text));}catch{return bad("invalid_request");}
  const locationId=location(body.location_id);if(locationId===undefined||body.disconnect&&body.provider!=="gsc")return bad("invalid_request");
  try{
    const auth=await authorizeWorkspaceRequest({id:workspaceId},{...(body.provider!=="gsc"||body.disconnect?{minRole:"owner" as const}:{}),...(locationId?{locationId}:{})});if(!auth.ok)return bad(auth.code,auth.status);
    if(!permitted(auth,workspaceId,locationId)||(body.provider!=="gsc"||body.disconnect)&&auth.membership.role!=="owner")return bad("forbidden",403);
    const target=locationId?await conversationConnectorRepository().target(workspaceId,locationId):{url:null,market:"unsupported"};if(!target)return bad("not_found",404);
    const rate=await enforceRateLimit({req,scope:"action_mutation",identifiers:[auth.user.id,workspaceId,"conversation_context"],failClosed:true});if(!rate.allowed)return rateLimitedResponse(rate.retryAfterSeconds);
    let context:ConnectorContext;
    if(body.disconnect){await conversationConnectorRepository().disconnectGsc(workspaceId,auth.user.id);context={source:"gsc",status:"disconnected",scope:target.url??"",items:[],observedAt:null};}
    else if(body.provider==="gsc")context=await readGscContext({workspaceId,websiteUrl:target.url,market:target.market});
    else context=await runResearch({workspaceId,locationId,provider:body.provider,url:target.url,market:target.market,keyword:body.keyword});
    return NextResponse.json({context},{headers});
  }catch{return bad("unavailable",503);}
}
