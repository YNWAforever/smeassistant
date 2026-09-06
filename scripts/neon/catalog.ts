import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";

// Captured by replaying the original migrations, independently of the new DDL.
export const retainedFunctions = ["approve_output_version","claim_audit_job","claim_workspace_completion","complete_report_unlock","consume_rate_limit","create_output_version","decide_output_version","delete_orphaned_workspace","export_output_version","fence_workspace_completion_write","finish_workspace_completion","pending_workspace_completions","touch_actions_updated_at"];
export const deferredFunctions: string[] = [];
export const deferredTriggers: string[] = [];
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
export async function verifyCatalog(pool: Pool) {
  const legacy = JSON.parse(await readFile(new URL("../../test/integration/fixtures/legacy-final-catalog.json", import.meta.url), "utf8")) as Record<string, Row[]>;
  const actual: Record<string, Row[]> = {};
  for (const [name, query] of Object.entries(catalogQueries)) actual[name] = (await pool.query(query)).rows;
  const identity = new Set(["app_users", "auth_identities"]);
  const business = (rows: Row[]) => rows.filter(row => !identity.has(String(row.table_name ?? row.tablename ?? row.name)));
  assert.deepEqual(business(actual.tables), legacy.tables, "business tables and RLS");
  // Dropped legacy columns leave ordinal gaps; compare surviving order, not physical attnum.
  const columns = (rows: Row[]) => rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "ordinal_position")));
  assert.deepEqual(columns(business(actual.columns)), columns(legacy.columns), "all business columns/types/nullability/defaults");
  assert.deepEqual(business(actual.constraints), legacy.constraints.map(row => ({...row, definition:String(row.definition).replaceAll("auth.users", "app_users")})), "constraints and deletion semantics");
  assert.deepEqual(business(actual.indexes), legacy.indexes, "all final indexes and predicates");
  assert.deepEqual(actual.triggers, legacy.triggers.filter(row => !deferredTriggers.includes(String(row.name))), "ordinary invariant triggers");
  const expectedFunctions = legacy.functions.filter(row => retainedFunctions.includes(String(row.name))).map(row => row.name === "delete_orphaned_workspace" ? {...row,config:['search_path=""'],definition:String(row.definition).replace(" LANGUAGE plpgsql\nAS", " LANGUAGE plpgsql\n SET search_path TO ''\nAS")} : row.name === "touch_actions_updated_at" ? row : {...row, security_definer:false, definition:translateLegacyWorkflow(String(row.definition))});
  assert.deepEqual(actual.functions, expectedFunctions, "retained function definitions with constrained search_path");
  assert.deepEqual(actual.enums, legacy.enums, "enum catalog");
  const policy = (await pool.query("SELECT tablename,roles::text[] AS roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename")).rows;
  assert.equal(policy.length, legacy.tables.length + 2);
  for (const row of policy) assert.deepEqual({...row, tablename:undefined}, {tablename:undefined,roles:["sme_app_runtime"],cmd:"ALL",qual:"true",with_check:"true"});
  const invalidGrants = await pool.query(`SELECT table_name,privilege_type FROM information_schema.role_table_grants WHERE grantee='sme_app_runtime' AND (table_schema <> 'public' OR privilege_type NOT IN ('SELECT','INSERT','UPDATE','DELETE'))`);
  assert.equal(invalidGrants.rowCount, 0, "runtime only has DML table grants");
  const functionsPublic = await pool.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname='public' AND a.grantee=0 AND a.privilege_type='EXECUTE'`);
  assert.equal(functionsPublic.rowCount, 0, "no PUBLIC function execution");
  let seededRows = 0;
  for (const row of actual.tables) seededRows += Number((await pool.query(`SELECT count(*) AS count FROM public."${String(row.name).replaceAll('"','""')}"`)).rows[0].count);
  assert.equal(seededRows, 0, "fresh migrations must never seed business or account rows");
  return { tables:business(actual.tables).length, columns:business(actual.columns).length, constraints:business(actual.constraints).length, indexes:business(actual.indexes).length, triggers:actual.triggers.length, functions:actual.functions.length, seededRows, deferredFunctions, deferredTriggers };
}
