import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";

// Captured by replaying the original migrations, independently of the new DDL.
export const retainedFunctions = ["approve_output_version","claim_audit_job","claim_workspace_completion","complete_report_unlock","consume_rate_limit","create_output_version","decide_output_version","delete_orphaned_workspace","export_output_version","fence_workspace_completion_write","finish_workspace_completion","pending_workspace_completions","touch_actions_updated_at"];
export const deferredFunctions: string[] = [];
export const deferredTriggers: string[] = [];
// Functions/triggers added by migrations after 0004 that have no legacy counterpart to
// replay-compare against. verifyCatalog excludes these from the legacy deepEqual and
// instead asserts their bare presence; their actual behavior is proven by dedicated tests
// (e.g. test/integration/neon-membership.integration.test.ts for prevent_owner_removal).
export const additionalFunctions: string[] = ["prevent_owner_removal","offer_is_expired","confirm_offer","archive_offer","offer_current_for_version","claim_preview_slot","finish_preview_slot","begin_publish_output_version","finish_publish_output_version","cancel_published_reply","guard_brand_revision_immutable","save_brand_revision","capture_brand_profile_revision","brand_snapshot_for_generation","guard_conversation_document_version_insert","guard_conversation_document_version_immutable","guard_conversation_document_asset_provenance","guard_conversation_research_ledger","guard_conversation_research_account"];
// Retained legacy functions that a later migration re-created on purpose (0011 adds one
// offer-freshness guard line to each; 0014 re-creates export_output_version again with the
// once-per-version counting changes). verifyCatalog drops them from the legacy deepEqual and
// asserts their presence; lib/workspace/offer-sql.test.ts pins their 0011 text as 0004 plus that
// one line, and lib/workspace/publish-sql.test.ts pins the 0014 export as 0011 plus changes (a)-(c).
// They stay in retainedFunctions, so neon:readiness still requires them.
export const changedFunctions: string[] = ["create_output_version","approve_output_version","export_output_version"];
export const additionalTriggers: string[] = ["workspace_members_prevent_owner_removal","brand_revision_immutable","brand_profile_revision_capture","conversation_document_version_insert","conversation_document_version_immutable","conversation_document_asset_provenance","conversation_research_ledger_guard","conversation_research_account_guard"];
// Exact PostgreSQL definitions added by 0015; the independently retained legacy catalog stays unchanged.
export const additionalIndexes = [
  { tablename: "action_runs", indexname: "action_runs_latest_metadata_idx", indexdef: "CREATE INDEX action_runs_latest_metadata_idx ON public.action_runs USING btree (workspace_id, action_id, created_at DESC, id DESC) INCLUDE (state)" },
  { tablename: "actions", indexname: "actions_list_keyset_idx", indexdef: "CREATE INDEX actions_list_keyset_idx ON public.actions USING btree (workspace_id, COALESCE(priority_score, (0)::numeric) DESC, updated_at DESC, id DESC) INCLUDE (location_id, action_state, template_key)" },
  { tablename: "output_versions", indexname: "output_versions_latest_metadata_idx", indexdef: "CREATE INDEX output_versions_latest_metadata_idx ON public.output_versions USING btree (workspace_id, action_id, version_no DESC, id DESC) INCLUDE (approval_state, delivery_state, first_exported_at)" },
];
export const catalogQueries = {
  tables: `select c.relname as name,c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname`,
  columns: `select table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position`,
  constraints: `select c.relname as table_name,k.conname as name,k.contype as type,pg_get_constraintdef(k.oid) as definition from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' order by c.relname,k.conname`,
  indexes: `select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname`,
  triggers: `select c.relname as table_name,t.tgname as name,pg_get_triggerdef(t.oid) as definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal order by c.relname,t.tgname`,
  functions: `select p.proname as name,pg_get_function_identity_arguments(p.oid) as arguments,pg_get_function_result(p.oid) as result,p.prosecdef as security_definer,p.proconfig as config,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e') order by p.proname,arguments`,
  enums: `select t.typname,e.enumlabel,e.enumsortorder from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' order by t.typname,e.enumsortorder`,
};
function translateLegacyWorkflow(def: string) {
 return def.replaceAll('\r\n','\n').replace(' SECURITY DEFINER\n','').replace("declare headers jsonb; job uuid; token uuid; target_workspace uuid;","declare job_text text; token_text text; job uuid; token uuid; target_workspace uuid;")
 .replace("  headers := coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;\n  if not (headers ? 'x-workspace-completion-job' or headers ? 'x-workspace-completion-token') then return new; end if;\n  if current_user <> 'service_role' then raise exception 'completion_role_denied'; end if;\n  if not (headers ? 'x-workspace-completion-job' and headers ? 'x-workspace-completion-token') then\n    raise exception 'completion_context_missing';\n  end if;\n  job := (headers->>'x-workspace-completion-job')::uuid;\n  token := (headers->>'x-workspace-completion-token')::uuid;", "  job_text := nullif(current_setting('app.completion_job',true),'');\n  token_text := nullif(current_setting('app.completion_token',true),'');\n  if job_text is null and token_text is null then return new; end if;\n  if not pg_has_role(current_user, 'sme_app_runtime', 'USAGE') then raise exception 'completion_role_denied'; end if;\n  if job_text is null or token_text is null then raise exception 'completion_context_missing'; end if;\n  job := job_text::uuid;\n  token := token_text::uuid;")
 .replace("encode(extensions.digest(p_job_id::text || ':' || p_idempotency_key, 'sha256'), 'hex')", "encode(sha256(convert_to(p_job_id::text || ':' || p_idempotency_key, 'UTF8')), 'hex')");
}

type Row = Record<string, unknown>;
// PostgreSQL preserves body line endings from migration input. Compare only that
// checkout representation canonically; metadata, other text and journal bytes stay strict.
function normalizeFunctionLineEndings(rows: Row[]): Row[] {
  return rows.map(row => ({
    ...row,
    definition: typeof row.definition === "string" ? row.definition.replaceAll("\r\n", "\n") : row.definition,
  }));
}
// PG18 records NOT NULL in pg_constraint as well as pg_attribute. The legacy
// PG16 snapshot already compares column nullability; validate the new metadata
// independently before removing only its redundant rows from that comparison.
async function validateNotNullCatalog(pool: Pool, constraintCount: number): Promise<number> {
  const version = Number((await pool.query("SELECT current_setting('server_version_num')::int AS version")).rows[0].version);
  assert.ok(Number.isInteger(version) && version > 0, "valid PostgreSQL catalog version");
  if (version < 180000) {
    assert.equal(constraintCount, 0, "unexpected pre-PG18 NOT NULL constraint metadata");
    return 0;
  }
  const columns = (await pool.query(`SELECT c.relname AS table_name,a.attname AS column_name
    FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped AND a.attnotnull
    ORDER BY c.relname,a.attname`)).rows;
  const constraints = (await pool.query(`SELECT c.relname AS table_name,a.attname AS column_name,
      k.convalidated,k.conenforced,cardinality(k.conkey) AS key_count
    FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class c ON c.oid=k.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=k.conkey[1] AND NOT a.attisdropped
    WHERE n.nspname='public' AND c.relkind='r' AND k.contype='n'
    ORDER BY c.relname,a.attname`)).rows;
  assert.equal(constraints.length, constraintCount, "complete NOT NULL constraint metadata");
  for (const row of constraints) {
    assert.ok(row.convalidated === true && row.conenforced === true && row.key_count === 1,
      "NOT NULL constraints must be validated, enforced and single-column");
  }
  assert.deepEqual(constraints.map(({ table_name, column_name }) => ({ table_name, column_name })), columns,
    "NOT NULL constraints must match every non-null column exactly once");
  return constraints.length;
}
export async function verifyCatalog(pool: Pool) {
  const legacy = JSON.parse(await readFile(new URL("../../test/integration/fixtures/legacy-final-catalog.json", import.meta.url), "utf8")) as Record<string, Row[]>;
  const actual: Record<string, Row[]> = {};
  for (const [name, query] of Object.entries(catalogQueries)) actual[name] = (await pool.query(query)).rows;
  const identity = new Set(["app_users", "auth_identities"]);
  const business = (rows: Row[]) => rows.filter(row => !identity.has(String(row.table_name ?? row.tablename ?? row.name)));
  const legacyBusiness = (rows: Row[]) => business(rows).filter(row => !["brand_revisions","conversation_document_versions","conversation_research_accounts","conversation_research_ledger"].includes(String(row.table_name ?? row.tablename ?? row.name)));
  assert.deepEqual(legacyBusiness(actual.tables), legacy.tables, "retained business tables and RLS");
  assert.deepEqual(actual.tables.find(row=>row.name==='brand_revisions'),{name:'brand_revisions',rls:true},'immutable brand table and RLS');
  // Dropped legacy columns leave ordinal gaps; compare surviving order, not physical attnum.
  const columns = (rows: Row[]) => rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "ordinal_position")));
  assert.deepEqual(columns(legacyBusiness(actual.columns).filter(row=>!(row.table_name==='brand_profiles' && row.column_name==='current_revision_id'))), columns(legacy.columns), "all business columns/types/nullability/defaults");
  assert.deepEqual(actual.tables.find(row=>row.name==='conversation_document_versions'),{name:'conversation_document_versions',rls:true},'document versions table and RLS');
  for(const name of ['conversation_research_accounts','conversation_research_ledger']) assert.deepEqual(actual.tables.find(row=>row.name===name),{name,rls:true},`${name} table and RLS`);
  const documentGrants=await pool.query("SELECT privilege_type FROM information_schema.role_table_grants WHERE grantee='sme_app_runtime' AND table_schema='public' AND table_name='conversation_document_versions' ORDER BY privilege_type");
  assert.deepEqual(documentGrants.rows,[{privilege_type:'INSERT'},{privilege_type:'SELECT'}],'runtime document versions remain append-only');
  const gscConstraint=actual.constraints.find(row=>row.name==='oauth_connections_provider_check');
  assert.equal(gscConstraint?.definition,"CHECK ((provider = ANY (ARRAY['instagram'::text, 'google_gbp'::text, 'ga4'::text, 'google_gsc'::text])))",'GSC provider is additive to the original OAuth allowlist');
  const revisionColumns=columns(actual.columns.filter(row=>row.table_name==='brand_revisions' || (row.table_name==='brand_profiles' && row.column_name==='current_revision_id')));
  const column=(table_name:string,column_name:string,data_type:string,udt_name:string,is_nullable:string,column_default:string|null)=>({table_name,column_name,data_type,udt_name,is_nullable,column_default});
  assert.deepEqual(revisionColumns,[column('brand_profiles','current_revision_id','uuid','uuid','YES',null),column('brand_revisions','id','uuid','uuid','NO','gen_random_uuid()'),column('brand_revisions','workspace_id','uuid','uuid','NO',null),column('brand_revisions','profile','jsonb','jsonb','NO',null),column('brand_revisions','actor_id','uuid','uuid','YES',null),column('brand_revisions','created_at','timestamp with time zone','timestamptz','NO','now()'),column('brand_revisions','source','text','text','NO',null)],'exact revision columns');
  const notNullConstraints = await validateNotNullCatalog(pool, actual.constraints.filter(row => row.type === "n").length);
  const comparableConstraints = business(actual.constraints).filter(row => row.type !== "n");
  assert.deepEqual(legacyBusiness(comparableConstraints).filter(row=>row.name!=='brand_profiles_current_revision_fkey' && row.name!=='oauth_connections_provider_check'), legacy.constraints.filter(row=>row.name!=="oauth_connections_provider_check").map(row => ({...row, definition:String(row.definition).replaceAll("auth.users", "app_users")})), "constraints and deletion semantics");
  const constraint=(table_name:string,name:string,type:string,definition:string)=>({table_name,name,type,definition});
  assert.deepEqual(comparableConstraints.filter(row=>row.table_name==='brand_revisions' || row.name==='brand_profiles_current_revision_fkey'),[
   constraint('brand_profiles','brand_profiles_current_revision_fkey','f','FOREIGN KEY (workspace_id, current_revision_id) REFERENCES brand_revisions(workspace_id, id)'),
   constraint('brand_revisions','brand_revisions_actor_id_fkey','f','FOREIGN KEY (actor_id) REFERENCES app_users(id)'),
   constraint('brand_revisions','brand_revisions_pkey','p','PRIMARY KEY (id)'),
   constraint('brand_revisions','brand_revisions_profile_check','c',"CHECK ((jsonb_typeof(profile) = 'object'::text))"),
   constraint('brand_revisions','brand_revisions_source_check','c',"CHECK ((source = ANY (ARRAY['baseline'::text, 'save'::text])))"),
   constraint('brand_revisions','brand_revisions_workspace_id_fkey','f','FOREIGN KEY (workspace_id) REFERENCES workspaces(id)'),
   constraint('brand_revisions','brand_revisions_workspace_id_id_key','u','UNIQUE (workspace_id, id)')],'exact revision constraints and non-destructive deletion semantics');
  assert.deepEqual(legacyBusiness(actual.indexes).filter(row => !additionalIndexes.some(index => index.indexname === row.indexname)), legacy.indexes, "all retained indexes and predicates");
  assert.deepEqual(actual.indexes.filter(row=>row.tablename==='brand_revisions'),[
   {tablename:'brand_revisions',indexname:'brand_revisions_history_idx',indexdef:'CREATE INDEX brand_revisions_history_idx ON public.brand_revisions USING btree (workspace_id, created_at DESC, id DESC)'},
   {tablename:'brand_revisions',indexname:'brand_revisions_pkey',indexdef:'CREATE UNIQUE INDEX brand_revisions_pkey ON public.brand_revisions USING btree (id)'},
   {tablename:'brand_revisions',indexname:'brand_revisions_workspace_id_id_key',indexdef:'CREATE UNIQUE INDEX brand_revisions_workspace_id_id_key ON public.brand_revisions USING btree (workspace_id, id)'}],'exact revision indexes');
  for (const index of additionalIndexes) assert.deepEqual(actual.indexes.find(row => row.indexname === index.indexname), index, `additional index ${index.indexname} definition`);
  const isAdditionalTrigger = (row: Row) => additionalTriggers.includes(String(row.name));
  const isAdditionalFunction = (row: Row) => additionalFunctions.includes(String(row.name)) || changedFunctions.includes(String(row.name));
  assert.deepEqual(actual.triggers.filter(row => !isAdditionalTrigger(row)), legacy.triggers.filter(row => !deferredTriggers.includes(String(row.name))), "ordinary invariant triggers");
  for (const name of additionalTriggers) assert.ok(actual.triggers.some(row => row.name === name), `additional trigger ${name} present`);
  const expectedFunctions = normalizeFunctionLineEndings(legacy.functions).filter(row => retainedFunctions.includes(String(row.name)) && !changedFunctions.includes(String(row.name))).map(row => row.name === "delete_orphaned_workspace" ? {...row,config:['search_path=""'],definition:String(row.definition).replace(" LANGUAGE plpgsql\nAS", " LANGUAGE plpgsql\n SET search_path TO ''\nAS")} : row.name === "touch_actions_updated_at" ? row : {...row, security_definer:false, definition:translateLegacyWorkflow(String(row.definition))});
  assert.deepEqual(normalizeFunctionLineEndings(actual.functions.filter(row => !isAdditionalFunction(row))), expectedFunctions, "retained function definitions with constrained search_path");
  for (const name of additionalFunctions) assert.ok(actual.functions.some(row => row.name === name), `additional function ${name} present`);
  for (const name of changedFunctions) assert.ok(actual.functions.some(row => row.name === name), `changed function ${name} present`);
  assert.deepEqual(actual.enums, legacy.enums, "enum catalog");
  const policy = (await pool.query("SELECT tablename,roles::text[] AS roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename")).rows;
  assert.equal(policy.length, legacy.tables.length + 12);
  for (const row of policy.filter(row=>row.tablename!=='brand_revisions' && row.tablename!=='conversation_document_versions' && row.tablename!=='conversation_research_accounts' && row.tablename!=='conversation_research_ledger')) assert.deepEqual({...row, tablename:undefined}, {tablename:undefined,roles:["sme_app_runtime"],cmd:"ALL",qual:"true",with_check:"true"});
  assert.deepEqual(policy.filter(row=>row.tablename==='brand_revisions').sort((a,b)=>String(a.cmd).localeCompare(String(b.cmd))),[
   {tablename:'brand_revisions',roles:['sme_app_runtime'],cmd:'INSERT',qual:null,with_check:'true'},
   {tablename:'brand_revisions',roles:['sme_app_runtime'],cmd:'SELECT',qual:'true',with_check:null}],'append-only revision policies');
  const revisionGrants=await pool.query("SELECT privilege_type FROM information_schema.role_table_grants WHERE grantee='sme_app_runtime' AND table_schema='public' AND table_name='brand_revisions' ORDER BY privilege_type");
  assert.deepEqual(revisionGrants.rows,[{privilege_type:'INSERT'},{privilege_type:'SELECT'}],'runtime cannot mutate saved revisions');
  const invalidGrants = await pool.query(`SELECT table_name,privilege_type FROM information_schema.role_table_grants WHERE grantee='sme_app_runtime' AND (table_schema <> 'public' OR privilege_type NOT IN ('SELECT','INSERT','UPDATE','DELETE'))`);
  assert.equal(invalidGrants.rowCount, 0, "runtime only has DML table grants");
  const functionsPublic = await pool.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname='public' AND a.grantee=0 AND a.privilege_type='EXECUTE'`);
  assert.equal(functionsPublic.rowCount, 0, "no PUBLIC function execution");
  let seededRows = 0;
  for (const row of actual.tables) seededRows += Number((await pool.query(`SELECT count(*) AS count FROM public."${String(row.name).replaceAll('"','""')}"`)).rows[0].count);
  assert.equal(seededRows, 0, "fresh migrations must never seed business or account rows");
  return { tables:business(actual.tables).length, columns:business(actual.columns).length, constraints:comparableConstraints.length, notNullConstraints, indexes:business(actual.indexes).length, triggers:actual.triggers.length, functions:actual.functions.length, seededRows, deferredFunctions, deferredTriggers };
}
