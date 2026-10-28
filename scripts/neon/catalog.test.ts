import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { additionalFunctions, additionalIndexes, additionalTriggers, catalogQueries, changedFunctions, verifyCatalog } from "./catalog";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));

type Row = Record<string, unknown>;
const column = { table_name: "workspaces", column_name: "timezone", ordinal_position: 1, data_type: "text", udt_name: "text", is_nullable: "NO", column_default: null };
const check = { table_name: "workspaces", name: "workspaces_timezone_check", type: "c", definition: "CHECK ((timezone <> ''::text))" };
const legacy = { tables: [{ name: "workspaces", rls: true }], columns: [column], constraints: [check], indexes: [], triggers: [], functions: [], enums: [] };
const resourceTables=["conversation_document_versions","conversation_research_accounts","conversation_research_ledger"];
const notNull = { table_name: "workspaces", column_name: "timezone", convalidated: true, conenforced: true, key_count: 1 };
const revisionColumn=(table_name:string,column_name:string,data_type:string,udt_name:string,is_nullable:string,column_default:string|null)=>({table_name,column_name,data_type,udt_name,is_nullable,column_default});
const revisionColumns=[revisionColumn('brand_profiles','current_revision_id','uuid','uuid','YES',null),revisionColumn('brand_revisions','id','uuid','uuid','NO','gen_random_uuid()'),revisionColumn('brand_revisions','workspace_id','uuid','uuid','NO',null),revisionColumn('brand_revisions','profile','jsonb','jsonb','NO',null),revisionColumn('brand_revisions','actor_id','uuid','uuid','YES',null),revisionColumn('brand_revisions','created_at','timestamp with time zone','timestamptz','NO','now()'),revisionColumn('brand_revisions','source','text','text','NO',null)];
const revisionNotNull=revisionColumns.filter(c=>c.is_nullable==='NO').map(c=>({...notNull,table_name:c.table_name,column_name:c.column_name}));
const constraint=(table_name:string,name:string,type:string,definition:string)=>({table_name,name,type,definition});
const revisionConstraints=[constraint('brand_profiles','brand_profiles_current_revision_fkey','f','FOREIGN KEY (workspace_id, current_revision_id) REFERENCES brand_revisions(workspace_id, id)'),constraint('brand_revisions','brand_revisions_actor_id_fkey','f','FOREIGN KEY (actor_id) REFERENCES app_users(id)'),constraint('brand_revisions','brand_revisions_pkey','p','PRIMARY KEY (id)'),constraint('brand_revisions','brand_revisions_profile_check','c',"CHECK ((jsonb_typeof(profile) = 'object'::text))"),constraint('brand_revisions','brand_revisions_source_check','c',"CHECK ((source = ANY (ARRAY['baseline'::text, 'save'::text])))"),constraint('brand_revisions','brand_revisions_workspace_id_fkey','f','FOREIGN KEY (workspace_id) REFERENCES workspaces(id)'),constraint('brand_revisions','brand_revisions_workspace_id_id_key','u','UNIQUE (workspace_id, id)')];
const revisionIndexes=[{tablename:'brand_revisions',indexname:'brand_revisions_history_idx',indexdef:'CREATE INDEX brand_revisions_history_idx ON public.brand_revisions USING btree (workspace_id, created_at DESC, id DESC)'},{tablename:'brand_revisions',indexname:'brand_revisions_pkey',indexdef:'CREATE UNIQUE INDEX brand_revisions_pkey ON public.brand_revisions USING btree (id)'},{tablename:'brand_revisions',indexname:'brand_revisions_workspace_id_id_key',indexdef:'CREATE UNIQUE INDEX brand_revisions_workspace_id_id_key ON public.brand_revisions USING btree (workspace_id, id)'}];

function metadataPool(options: { version?: number; notNullRows?: Row[]; nullable?: boolean; changedCheck?: boolean } = {}) {
  const version = options.version ?? 180006;
  const metadata: Record<string, Row[]> = {
    tables: [...legacy.tables, { name: "app_users", rls: true }, { name: "auth_identities", rls: true },{name:'brand_revisions',rls:true},...resourceTables.map(name=>({name,rls:true}))],
    columns: [...revisionColumns,{ ...column, is_nullable: options.nullable ? "YES" : "NO" }],
    constraints: [constraint("oauth_connections","oauth_connections_provider_check","c", "CHECK ((provider = ANY (ARRAY['instagram'::text, 'google_gbp'::text, 'ga4'::text, 'google_gsc'::text])))"),...revisionConstraints,options.changedCheck ? { ...check, definition: "CHECK ((timezone <> 'UTC'::text))" } : check, ...(version >= 180000 ? [notNull,...revisionNotNull].map(c=>({table_name:c.table_name,name:`${c.column_name}_not_null`,type:'n',definition:`NOT NULL ${c.column_name}`})) : [])],
    indexes: [...revisionIndexes,...additionalIndexes],
    triggers: additionalTriggers.map(name => ({ name })),
    functions: [...additionalFunctions, ...changedFunctions].map(name => ({ name })),
    enums: [],
  };
  const query = vi.fn(async (sql: string) => {
    const category = Object.entries(catalogQueries).find(([, value]) => value === sql)?.[0];
    let rows: Row[];
    if (category) rows = metadata[category];
    else if (sql.includes("server_version_num")) rows = [{ version }];
    else if (sql.includes("attnotnull")) rows = [...revisionNotNull,notNull].map(({table_name,column_name})=>({table_name,column_name}));
    else if (sql.includes("k.contype='n'")) rows = [...revisionNotNull,...(options.notNullRows ?? [notNull])];
    else if (sql.includes("FROM pg_policies")) rows = [...["workspaces", "app_users", "auth_identities"].map(tablename => ({ tablename, roles: ["sme_app_runtime"], cmd: "ALL", qual: "true", with_check: "true" })),{tablename:'brand_revisions',roles:['sme_app_runtime'],cmd:'INSERT',qual:null,with_check:'true'},{tablename:'brand_revisions',roles:['sme_app_runtime'],cmd:'SELECT',qual:'true',with_check:null},...resourceTables.flatMap(tablename=>(tablename==='conversation_document_versions'?['INSERT','SELECT']:['INSERT','SELECT','UPDATE']).map(cmd=>({tablename,roles:['sme_app_runtime'],cmd,qual:cmd==='INSERT'?null:'true',with_check:cmd==='SELECT'?null:'true'})))];
    else if(sql.includes("role_table_grants") && (sql.includes("table_name='brand_revisions'")||sql.includes("table_name='conversation_document_versions'"))) rows=[{privilege_type:'INSERT'},{privilege_type:'SELECT'}];
    else if (sql.includes("role_table_grants") || sql.includes("aclexplode")) rows = [];
    else if (sql.startsWith("SELECT count(*) AS count FROM public.")) rows = [{ count: "0" }];
    else throw new Error(`Unexpected verifier query: ${sql}`);
    return { rows, rowCount: rows.length };
  });
  return { pool: { query } as unknown as Pool, query };
}

beforeEach(() => { vi.mocked(readFile).mockResolvedValue(JSON.stringify(legacy)); });

describe("T-19 PostgreSQL NOT NULL catalog compatibility", () => {
  it("accepts the unchanged PostgreSQL 16 representation", async () => {
    await expect(verifyCatalog(metadataPool({ version: 160014 }).pool)).resolves.toMatchObject({ constraints: 9, seededRows: 0 });
  });
  it("accepts PostgreSQL 18 only after validating its redundant NOT NULL metadata", async () => {
    await expect(verifyCatalog(metadataPool().pool)).resolves.toMatchObject({ constraints: 9, notNullConstraints: 6, seededRows: 0 });
  });
  it.each([
    ["missing constraint", []],
    ["unvalidated constraint", [{ ...notNull, convalidated: false }]],
    ["unenforced constraint", [{ ...notNull, conenforced: false }]],
    ["multi-column constraint", [{ ...notNull, key_count: 2 }]],
    ["wrong column", [{ ...notNull, column_name: "market" }]],
    ["duplicate constraint", [notNull, notNull]],
  ])("rejects PostgreSQL 18 %s instead of hiding it", async (_name, notNullRows) => {
    await expect(verifyCatalog(metadataPool({ notNullRows }).pool)).rejects.toThrow(/NOT NULL/);
  });
  it("still rejects relaxed column nullability", async () => {
    await expect(verifyCatalog(metadataPool({ nullable: true }).pool)).rejects.toThrow("all business columns/types/nullability/defaults");
  });
  it("still rejects changed ordinary constraints", async () => {
    await expect(verifyCatalog(metadataPool({ changedCheck: true }).pool)).rejects.toThrow("constraints and deletion semantics");
  });
});
