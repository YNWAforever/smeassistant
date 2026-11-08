import "server-only";
import type { Pool } from "pg";
import { getPool } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import type { GoogleConnectionInput } from "./claims";
export interface GscConnection {
  id:string;status:string;scopes:string[];accessTokenEncrypted:string;refreshTokenEncrypted:string|null;expiresAt:string|null;
}
export function conversationConnectorRepository(pool?: Pick<Pool,"query"|"connect">) {
  const database=()=>pool??getPool();
  return {
    async target(workspaceId:string,locationId:string):Promise<{url:string|null;market:string}|null> {
      return (await database().query<{url:string|null;market:string}>("SELECT l.website_url AS url,w.market FROM locations l JOIN workspaces w ON w.id=l.workspace_id WHERE l.workspace_id=$1 AND l.id=$2",[workspaceId,locationId])).rows[0]??null;
    },
    async gscConnection(workspaceId:string):Promise<GscConnection|null> {
      return (await database().query<GscConnection>(`SELECT id,status,scopes,access_token_encrypted AS "accessTokenEncrypted",refresh_token_encrypted AS "refreshTokenEncrypted",expires_at::text AS "expiresAt" FROM oauth_connections WHERE workspace_id=$1 AND provider='google_gsc' ORDER BY (status='active') DESC,updated_at DESC,id DESC LIMIT 1`,[workspaceId])).rows[0]??null;
    },
    async replaceGsc(input:GoogleConnectionInput):Promise<string> {
      return withTransaction(async db=>{
        await db.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE",[input.workspaceId]);
        await db.query("UPDATE oauth_connections SET status='revoked',access_token_encrypted='',refresh_token_encrypted=NULL,updated_at=now() WHERE workspace_id=$1 AND provider='google_gsc' AND status='active'",[input.workspaceId]);
        return (await db.query<{id:string}>("INSERT INTO oauth_connections(workspace_id,provider,access_token_encrypted,refresh_token_encrypted,scopes,expires_at) VALUES($1,'google_gsc',$2,$3,$4,$5) RETURNING id",[input.workspaceId,input.accessTokenEncrypted,input.refreshTokenEncrypted,input.scopes,input.expiresAt])).rows[0].id;
      },database());
    },
    async refreshGsc(input:{workspaceId:string;id:string;accessTokenEncrypted:string;expiresAt:string|null}):Promise<boolean> {
      return Boolean((await database().query("UPDATE oauth_connections SET access_token_encrypted=$3,expires_at=$4,updated_at=now() WHERE workspace_id=$1 AND id=$2 AND provider='google_gsc' AND status='active' RETURNING id",[input.workspaceId,input.id,input.accessTokenEncrypted,input.expiresAt])).rows.length);
    },
    async expireGsc(workspaceId:string,id:string):Promise<void> {
      await database().query("UPDATE oauth_connections SET status='expired',updated_at=now() WHERE workspace_id=$1 AND id=$2 AND provider='google_gsc' AND status='active'",[workspaceId,id]);
    },
    async disconnectGsc(workspaceId:string,actorId:string):Promise<void> {
      await withTransaction(async db=>{
        await db.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE",[workspaceId]);
        const revoked=await db.query<{id:string}>("UPDATE oauth_connections SET status='revoked',access_token_encrypted='',refresh_token_encrypted=NULL,updated_at=now() WHERE workspace_id=$1 AND provider='google_gsc' AND status IN ('active','expired','error') RETURNING id",[workspaceId]);
        if(revoked.rows.length)await db.query("INSERT INTO audit_events(workspace_id,actor_type,actor_id,event,entity_type,entity_id,payload) VALUES($1,'user',$2,'integration.updated','oauth_connection',$3,$4::jsonb)",[workspaceId,actorId,revoked.rows[0].id,JSON.stringify({provider:"google_gsc",status:"revoked",connections:revoked.rows.length})]);
      },database());
    },
  };
}
