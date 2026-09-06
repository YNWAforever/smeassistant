import {execFileSync} from 'node:child_process';
import {Pool} from 'pg';
import {it,expect} from 'vitest';
import {startNeonDatabaseFixture} from './neon-database';
it('owned network-none relay supports distinct SQL clients and closes on cleanup',async()=>{
 const fixture=await startNeonDatabaseFixture('test');const pool=new Pool({connectionString:fixture.databaseUrl,max:2,connectionTimeoutMillis:5000});
 try{
  const [a,b]=await Promise.all([pool.connect(),pool.connect()]);
  try{const ids=await Promise.all([a.query('SELECT pg_backend_pid() AS id'),b.query('SELECT pg_backend_pid() AS id')]);expect(ids[0].rows[0].id).not.toBe(ids[1].rows[0].id);expect((await a.query('SELECT 1 AS value')).rows[0].value).toBe(1);}finally{a.release();b.release();}
  const state=JSON.parse(execFileSync('docker',['inspect',fixture.containerName],{encoding:'utf8'}))[0];expect(state.HostConfig.NetworkMode).toBe('none');expect(state.HostConfig.PortBindings).toEqual({});
 }finally{await pool.end();fixture.stop();}
 const stopped=new Pool({connectionString:fixture.databaseUrl,connectionTimeoutMillis:1000});try{await expect(stopped.query('SELECT 1')).rejects.toThrow();}finally{await stopped.end();}
});

it('relay disconnect closes the remote backend and permits pool recovery',async()=>{
 const fixture=await startNeonDatabaseFixture('test');const pool=new Pool({connectionString:fixture.databaseUrl,max:2,connectionTimeoutMillis:5000});
 try{
  const client=await pool.connect();const pid=(await client.query('SELECT pg_backend_pid() AS id')).rows[0].id;
  await client.query('BEGIN');client.release(true);
  await expect.poll(async()=>Number((await pool.query('SELECT count(*) FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0].count),{timeout:2000}).toBe(0);
  expect((await pool.query('SELECT 1 AS value')).rows[0].value).toBe(1);
 }finally{await pool.end();fixture.stop();}
});
