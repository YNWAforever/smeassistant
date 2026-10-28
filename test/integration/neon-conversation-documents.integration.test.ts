import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { applyMigrations } from "../../scripts/neon/migrations";
import { conversationConnectorRepository } from "../../lib/repositories/conversation-connectors";
import { conversationDocumentRepository } from "../../lib/repositories/conversation-documents";
describe("Stage 2 immutable asset document versions on owned PostgreSQL",()=>{
  let fixture:NeonDatabaseFixture,owner:Pool,runtime:Pool;
  beforeAll(async()=>{
    fixture=await startNeonDatabaseFixture("test");owner=new Pool({connectionString:fixture.databaseUrl});
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS");await applyMigrations(owner);
    await owner.query("CREATE ROLE conversation_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
    const url=new URL(fixture.databaseUrl);url.username="conversation_runtime";url.password="fixture-only";runtime=new Pool({connectionString:url.href});
  });
  afterAll(async()=>{await Promise.allSettled([owner?.end(),runtime?.end()]);fixture?.stop();});
  async function setup(){
    const workspaceId=(await runtime.query("INSERT INTO workspaces DEFAULT VALUES RETURNING id")).rows[0].id as string;
    const uploadedBy=(await runtime.query("INSERT INTO app_users(email) VALUES($1) RETURNING id",[`${crypto.randomUUID()}@example.test`])).rows[0].id as string;
    await runtime.query("INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,'fixture@example.test','owner',now())",[workspaceId,uploadedBy]);
    const locationId=(await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,'branch','Synthetic branch') RETURNING id",[workspaceId])).rows[0].id as string;
    return {workspaceId,locationId,uploadedBy};
  }
  function input(scope:{workspaceId:string;locationId:string|null;uploadedBy:string},text:string,documentId?:string){
    const id=crypto.randomUUID();return {...scope,documentId,title:"menu.txt",text,truncated:false,sha256:"a".repeat(64),asset:{id,workspace_id:scope.workspaceId,location_id:scope.locationId,kind:"document" as const,storage_path:`${scope.workspaceId}/${id}/__conversation_document__/menu.txt`,filename:"menu.txt",alt_text:null,rights_status:"needs_review" as const,rights_confirmed_at:null,uploaded_by:scope.uploadedBy}};
  }
  it("appends racing revisions and preserves every cited extract and original asset",async()=>{
    const scope=await setup(),repo=conversationDocumentRepository(runtime),first=await repo.append(input(scope,"confirmed v1"));
    const next=await Promise.all([repo.append(input(scope,"new v2",first.documentId)),repo.append(input(scope,"new v3",first.documentId))]);
    expect(next.map(v=>v.version).sort()).toEqual([2,3]);
    expect(await repo.list(scope,[first.id])).toMatchObject([{id:first.id,version:1,text:"confirmed v1"}]);
    expect(await repo.list(scope)).toHaveLength(1);
    await expect(runtime.query("UPDATE conversation_document_versions SET extracted_text='overwritten' WHERE id=$1",[first.id])).rejects.toMatchObject({code:"42501"});
    await expect(owner.query("UPDATE conversation_document_versions SET extracted_text='overwritten' WHERE id=$1",[first.id])).rejects.toThrow("document_version_immutable");
    await expect(owner.query("DELETE FROM conversation_document_versions WHERE id=$1",[first.id])).rejects.toThrow("document_version_immutable");
    await expect(runtime.query("UPDATE assets SET filename='replaced.txt' WHERE id=$1",[first.assetId])).rejects.toThrow("document_asset_immutable");
    await runtime.query("UPDATE assets SET rights_status='approved',rights_confirmed_at=now(),alt_text='confirmed' WHERE id=$1",[first.assetId]);
    expect((await repo.list(scope,[first.id]))[0].title).toBe("menu.txt");
  });
  it("rejects cross-workspace/location IDs and owner substitution without partial asset writes",async()=>{
    const a=await setup(),b=await setup(),repo=conversationDocumentRepository(runtime),first=await repo.append(input(a,"private confirmed facts"));
    expect(await repo.list(b,[first.id])).toEqual([]);expect(await repo.list({...a,locationId:null},[first.id])).toEqual([]);
    await expect(repo.append(input(b,"wrong shop",first.documentId))).rejects.toThrow("document_not_found");
    await expect(repo.append(input({...a,uploadedBy:b.uploadedBy},"wrong owner"))).rejects.toThrow("document_owner_required");
    expect((await runtime.query("SELECT count(*)::int AS n FROM assets WHERE workspace_id=$1",[a.workspaceId])).rows[0].n).toBe(1);
    expect((await runtime.query("SELECT approved_deliveries FROM workspace_usage WHERE workspace_id=$1",[a.workspaceId])).rows).toEqual([]);
  });
  it("preserves deletion-driven actor/location lifecycle without moving a citation into all locations",async()=>{
    const scope=await setup(),repo=conversationDocumentRepository(runtime),saved=await repo.append(input(scope,"keep original facts"));
    const successor=(await runtime.query("INSERT INTO app_users(email) VALUES($1) RETURNING id",[`${crypto.randomUUID()}@example.test`])).rows[0].id;
    await runtime.query("INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,'successor@example.test','manager',now())",[scope.workspaceId,successor]);
    await runtime.query("DELETE FROM app_users WHERE id=$1",[scope.uploadedBy]);
    expect((await runtime.query("SELECT uploaded_by FROM conversation_document_versions WHERE id=$1",[saved.id])).rows[0].uploaded_by).toBeNull();
    expect((await repo.list(scope,[saved.id]))[0].text).toBe("keep original facts");
    await runtime.query("DELETE FROM locations WHERE id=$1",[scope.locationId]);
    expect(await repo.list(scope,[saved.id])).toEqual([]);expect(await repo.list({...scope,locationId:null},[saved.id])).toEqual([]);
    expect((await runtime.query("SELECT location_id FROM conversation_document_versions WHERE id=$1",[saved.id])).rows[0].location_id).toBe(scope.locationId);
    await runtime.query("DELETE FROM workspaces WHERE id=$1",[scope.workspaceId]);
    expect((await runtime.query("SELECT id FROM conversation_document_versions WHERE id=$1",[saved.id])).rows).toEqual([]);
  });

  it("keeps GSC separate from GBP and records owner disconnect without tokens in audit",async()=>{
    const scope=await setup(),repo=conversationConnectorRepository(runtime);
    const gbp=(await runtime.query("INSERT INTO oauth_connections(workspace_id,provider,access_token_encrypted,scopes) VALUES($1,'google_gbp','synthetic-gbp',ARRAY['business.manage']) RETURNING id",[scope.workspaceId])).rows[0].id;
    const gsc=await repo.replaceGsc({workspaceId:scope.workspaceId,accessTokenEncrypted:"synthetic-gsc-access",refreshTokenEncrypted:"synthetic-gsc-refresh",scopes:["https://www.googleapis.com/auth/webmasters.readonly"],expiresAt:"2099-01-01"});
    expect(await repo.gscConnection(scope.workspaceId)).toMatchObject({id:gsc,status:"active"});
    await repo.disconnectGsc(scope.workspaceId,scope.uploadedBy);
    expect((await runtime.query("SELECT status,access_token_encrypted FROM oauth_connections WHERE id=$1",[gbp])).rows[0]).toEqual({status:"active",access_token_encrypted:"synthetic-gbp"});
    const events=(await runtime.query("SELECT actor_id,payload FROM audit_events WHERE workspace_id=$1 AND event='integration.updated'",[scope.workspaceId])).rows;
    expect(events).toMatchObject([{actor_id:scope.uploadedBy,payload:{provider:"google_gsc",status:"revoked"}}]);
    expect(JSON.stringify(events)).not.toContain("synthetic-gsc");
  });

});
