import { describe, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));
vi.mock('./client', () => ({ getPool: () => ({ connect: async () => state }) }));
import { withCompletionContext } from './transaction';
describe('completion context', () => {
    it('binds local context on the writing client before callback and commits', async () => {
        state.query.mockResolvedValue({ rows: [] });
        await withCompletionContext('job', "token'; DROP TABLE actions;--", async (client) => { expect(client).toBe(state); await client.query('SELECT 1'); });
        expect(state.query.mock.calls).toEqual([['BEGIN'], ["SELECT set_config('app.completion_job',$1,true), set_config('app.completion_token',$2,true)", ['job', "token'; DROP TABLE actions;--"]], ['SELECT 1'], ['COMMIT']]);
    });
});
