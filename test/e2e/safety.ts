import { createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:http";

export function assertLocalOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || !url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Acceptance requires a bare loopback HTTP origin with an explicit port");
  return url.origin;
}
export function roleToken(secret: string, role: "anon" | "service_role"): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role, iss: "supabase", exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}
export function isolatedEnv(input: { app: string; api: string; llm: string; anon: string; service: string }): NodeJS.ProcessEnv {
  for (const url of [input.app, input.api, input.llm]) assertLocalOrigin(url);
  const env: NodeJS.ProcessEnv = { NODE_ENV: "development" };
  for (const key of ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA"]) if (process.env[key]) env[key] = process.env[key];
  return { ...env, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", SCAN_SOURCES: "fixture", SCAN_FIXTURE: "unavailable-ig", NEXT_PUBLIC_SITE_URL: input.app, APP_ORIGIN: input.app, NEXT_PUBLIC_SUPABASE_URL: input.api, NEXT_PUBLIC_SUPABASE_ANON_KEY: input.anon, SUPABASE_SERVICE_ROLE_KEY: input.service, RATE_LIMIT_SECRET: randomUUID(), LLM_BASE_URL: `${input.llm}/v1`, LLM_API_KEY: "local-fixture-only", LLM_MODEL: "fixture", WORKSPACE_CLAIM_VIA_OAUTH_ENABLED: "false" };
}
export async function listen(server: ReturnType<typeof createServer>): Promise<string> {
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No local server port");
  return `http://127.0.0.1:${address.port}`;
}
