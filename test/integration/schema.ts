import { Pool } from 'pg';
import { applyMigrations } from '../../scripts/neon/migrations';
/** Only the owned fixture's owner connection runs immutable Neon migrations. */
export async function applySchema(databaseUrl:string) {
 const url=new URL(databaseUrl);
 if(!['127.0.0.1','localhost'].includes(url.hostname) || !url.pathname.startsWith('/sme_neon_it_')) throw new Error('unsafe_schema_target');
 const owner=new Pool({connectionString:databaseUrl});
 try { await owner.query('CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS'); await applyMigrations(owner); }finally{await owner.end();}
}
