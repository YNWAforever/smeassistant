import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, createWriteStream, mkdirSync } from "node:fs";
import { createServer as netServer } from "node:net";
import { Pool } from "pg";
import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "../integration/neon-database";
import { isolatedEnv } from "./safety";
import { startLlmServer } from "./llm-server";
import { startIdentityServer } from "./identity-server";
export type FixtureCompletionFault = "binding" | "mapping" | "revoked" | "upstream" | "cancelled" | null;
export interface AcceptanceEnvironment { app:string; api:string; mail:string; llm:string; db:string; expireLink(link:string):void; selectGoogleAccount(email:string):Promise<void>; setFixtureFault(fault:FixtureCompletionFault):Promise<void>; holdCompletion():Promise<void>; releaseCompletion():Promise<void>; stop():Promise<void> }
const owned=new Map<string,string>();
export function sql(db:string,query:string):string {
 const database=owned.get(db);if(!database) throw new Error("Refusing SQL outside owned acceptance database");
 return execFileSync("docker",["exec","-i",db,"psql","-U","postgres","-d",database,"-v","ON_ERROR_STOP=1","-Atq"],{input:query,encoding:"utf8",stdio:["pipe","pipe","pipe"]}).trim();
}
async function port(requested=0):Promise<number> {const s=netServer();await new Promise<void>((r,reject)=>{s.once("error",reject);s.listen(requested,"127.0.0.1",r);});const p=(s.address() as {port:number}).port;await new Promise<void>(r=>s.close(()=>r()));return p;}
async function healthy(url:string,child?:ChildProcess) {
 for(let i=0;i<120;i++){if(child?.exitCode!=null) throw new Error("Acceptance Next process exited before readiness");try{if((await fetch(url,{signal:AbortSignal.timeout(1000)})).ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}
 throw new Error(`Acceptance service not healthy: ${new URL(url).origin}`);
}
export async function startEnvironment(requestedPort?:number):Promise<AcceptanceEnvironment> {
 for(const file of [".env",".env.local",".env.development",".env.development.local"])if(existsSync(file))throw new Error(`Acceptance refuses ${file}`);
 let fixture:NeonDatabaseFixture|undefined,next:ChildProcess|undefined;
 let llm:Awaited<ReturnType<typeof startLlmServer>>|undefined;
 let identity:Awaited<ReturnType<typeof startIdentityServer>>|undefined;
  const stop = async () => {
    if (next && next.exitCode === null) { if (process.platform === "win32" && next.pid) { try { execFileSync("taskkill", ["/PID", String(next.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); } catch {} } else if (next.pid) { try { process.kill(-next.pid, "SIGTERM"); } catch { next.kill(); } } await Promise.race([new Promise<void>((r) => next!.once("exit", () => r())), new Promise<void>((r) => setTimeout(r, 5000))]); if (next.exitCode === null && next.signalCode === null && next.pid) { if (process.platform !== "win32") { try { process.kill(-next.pid, "SIGKILL"); } catch {} } await Promise.race([new Promise<void>((r) => next!.once("exit", () => r())), new Promise<void>((r) => setTimeout(r, 1000))]); } }
    await identity?.stop();
    await llm?.stop();
    if (fixture) { owned.delete(fixture.containerName); fixture.stop(); }
    if (next && next.exitCode === null && next.signalCode === null) throw new Error("Acceptance cleanup could not confirm owned Next process exit");
  };
  try {
    const appPort=await port(requestedPort);
    fixture=await startNeonDatabaseFixture("test");
    owned.set(fixture.containerName,fixture.databaseName);
    const owner=new Pool({connectionString:fixture.databaseUrl});
    try {await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS");await applyMigrations(owner);await owner.query("CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");}finally{await owner.end();}
    const runtime=new URL(fixture.databaseUrl);runtime.username="fixture_runtime";runtime.password="fixture-only";
    const app=`http://localhost:${appPort}`,secret=randomBytes(32).toString("hex");
    identity=await startIdentityServer(app,secret);llm=await startLlmServer();
    mkdirSync("test-results",{recursive:true});
    const output=createWriteStream("test-results/fixture-next.log",{flags:"a"});
    next=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--hostname","127.0.0.1","--port",String(appPort)],{env:isolatedEnv({app,api:identity.url,llm:llm.url,databaseUrl:runtime.href,identitySecret:secret}),stdio:["ignore","pipe","pipe"],windowsHide:true,detached:process.platform!=="win32"});
    next.stdout?.pipe(output);next.stderr?.pipe(output);next.once("exit",()=>output.end());
    await healthy(`${app}/en/owner/sign-in`,next);
    const control = async (path: string, body: object) => {
      const response = await fetch(`${identity!.url}${path}`, { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json", "x-fixture-origin": app }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`fixture_control_failed:${response.status}`);
    };
    return { app, api: app, mail: identity.url, llm: llm.url, db: fixture.containerName, expireLink: identity.expireLink,
      selectGoogleAccount: async (email: string) => control("/test/google-account", { email }),
      setFixtureFault: async (fault: FixtureCompletionFault) => control("/test/fault", { fault }),
      holdCompletion: async () => control("/test/completion-hold", {}),
      releaseCompletion: async () => control("/test/completion-release", {}), stop };
  }catch(error){await stop();throw error;}
}
