import { dockerAvailable } from './docker';
import { applySchema } from './schema';
import { startNeonDatabaseFixture } from './neon-database';
export default async function setup() {
 if(!dockerAvailable()) throw new Error('Integration tests require Docker. No tests were run or skipped.');
 const fixture=await startNeonDatabaseFixture(process.env.NODE_ENV);
 try {await applySchema(fixture.databaseUrl);process.env.DATABASE_URL=fixture.databaseUrl;delete process.env.DATABASE_URL_UNPOOLED;process.env.RATE_LIMIT_SECRET='integration-fixture-only';}
 catch(error){fixture.stop();throw error;}
 return ()=>fixture.stop();
}
