import {authorizeWorkspaceRequest} from '@/lib/auth';
import {authorizationOrUnavailable} from '@/lib/security/authorization-boundary';
import {getAsset,signedUrlFor} from '@/lib/workspace/assets';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(error:string,status:number)=>Response.json({error},{status,headers});
/** Read-only on-demand signing. Every renewal rechecks membership and stored location. */
export async function GET(request:Request,{params}:{params:Promise<{workspaceId:string;assetId:string}>}){
 const {workspaceId,assetId}=await params;
 if(!UUID.test(workspaceId)||!UUID.test(assetId))return json('not_found',404);
 const member=await authorizationOrUnavailable(()=>authorizeWorkspaceRequest({id:workspaceId}));
 if(!member)return json('unavailable',503);if(!member.ok)return json(member.code,member.status);
 try{
  const asset=await getAsset(workspaceId,assetId);
  if(!asset || !asset.storage_path.startsWith(`${workspaceId}/${assetId}/`))return json('not_found',404);
  if(asset.location_id){
   const locationId=asset.location_id;
   const scoped=await authorizationOrUnavailable(()=>authorizeWorkspaceRequest({id:workspaceId},{locationId}));
   if(!scoped)return json('unavailable',503);if(!scoped.ok)return json(scoped.code,scoped.status);
  }
  const url=await signedUrlFor(asset.storage_path);if(!url)return json('unavailable',503);
  return new URL(request.url).searchParams.get('open')==='1'?new Response(null,{status:302,headers:{...headers,Location:url}}):Response.json({url},{headers});
 }catch(error){if(error instanceof TypeError)throw error;return json('unavailable',503);}
}
