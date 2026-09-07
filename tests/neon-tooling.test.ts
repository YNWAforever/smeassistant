import { describe,it,expect } from 'vitest';
import { parseSeedArgs } from '../scripts/seed-demo';
import { generateTypes } from '../scripts/gen-types';
describe('local schema tooling',()=>{
 it.each([[[]],[['--url','postgresql://secret@remote/db']],[['--owned-test','--url','x']],[['--production']]])('rejects arbitrary seed targets %j',args=>expect(()=>parseSeedArgs(args)).toThrow('seed_requires_owned_test'));
 it('requires the explicit owned-test command',()=>expect(parseSeedArgs(['--owned-test'])).toBe(true));
 it('generates real Drizzle select and insert types for the schema',()=>{const output=generateTypes();expect(output).toContain('typeof schema.appUsers.$inferSelect');expect(output).toContain('typeof schema.appUsers.$inferInsert');expect(output).toContain('export type DatabaseRows');});
});
