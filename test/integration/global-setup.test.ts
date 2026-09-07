import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({dockerAvailable:vi.fn(),startNeonDatabaseFixture:vi.fn(),applySchema:vi.fn()}));
vi.mock('./docker',()=>({dockerAvailable:mocks.dockerAvailable}));
vi.mock('./neon-database',()=>({startNeonDatabaseFixture:mocks.startNeonDatabaseFixture}));
vi.mock('./schema',()=>({applySchema:mocks.applySchema}));
import setup from './global-setup';
describe('owned PostgreSQL integration setup',()=>{
 const stop=vi.fn(); const url='postgresql://postgres:postgres@127.0.0.1:54323/sme_neon_it_unit';
 beforeEach(()=>{vi.resetAllMocks();mocks.dockerAvailable.mockReturnValue(true);mocks.startNeonDatabaseFixture.mockResolvedValue({databaseUrl:url,stop});vi.stubEnv('DATABASE_URL_UNPOOLED','postgresql://forbidden.example/db');});
 afterEach(()=>vi.unstubAllEnvs());
 it('cleans owned database if schema fails',async()=>{mocks.applySchema.mockRejectedValue(new Error('schema failed'));await expect(setup()).rejects.toThrow('schema failed');expect(stop).toHaveBeenCalledTimes(1);});
 it('uses owned database and returns scoped teardown',async()=>{const cleanup=await setup();expect(mocks.applySchema).toHaveBeenCalledWith(url);expect(process.env.DATABASE_URL).toBe(url);expect(process.env.DATABASE_URL_UNPOOLED).toBeUndefined();expect(stop).not.toHaveBeenCalled();cleanup();expect(stop).toHaveBeenCalledTimes(1);});
 it('never starts fixtures without Docker',async()=>{mocks.dockerAvailable.mockReturnValue(false);await expect(setup()).rejects.toThrow('Docker');expect(mocks.startNeonDatabaseFixture).not.toHaveBeenCalled();});
});
