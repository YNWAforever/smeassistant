import { createHmac } from "node:crypto";

/** PostgREST refuses to start with a JWT secret under 32 bytes. */
const MIN_SECRET_BYTES = 32;

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

/**
 * Mint the token supabase-js will send as `Authorization: Bearer <token>`.
 *
 * Supabase's own service-role key is exactly this: an HS256 JWT whose `role`
 * claim names a Postgres role, signed with the project's JWT secret. PostgREST
 * verifies the signature and then SETs that role for the transaction, which is
 * how the service role bypasses RLS. Reproducing the shape locally is what lets
 * the real `supabaseServer()` client work unmodified against a test container.
 */
export function mintServiceRoleJwt(secret: string): string {
  if (Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    throw new Error(`JWT secret must be at least ${MIN_SECRET_BYTES} bytes`);
  }
  const header = encode({ alg: "HS256", typ: "JWT" });
  // No `exp`: these tokens live only as long as the container.
  const payload = encode({ role: "service_role", iss: "sme-scanner-integration" });
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}
