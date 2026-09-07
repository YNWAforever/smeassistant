import "server-only";
import { withTransaction } from "../db/transaction";
import type { ResolveApplicationUser } from "./contracts";

/** Provider and subject are the only identity key. Email never links accounts. */
export const resolveApplicationUser: ResolveApplicationUser = async identity => {
  if (
    identity?.provider !== "neon" || identity.verified !== true
    || typeof identity.subject !== "string" || !identity.subject.trim()
    || typeof identity.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email)
  ) throw new Error("identity_invalid");
  try {
    return await withTransaction(async client => {
      // Serialize first login before creating a candidate user. Hash collisions only
      // serialize unrelated logins; the exact provider/subject query stays authoritative.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        JSON.stringify([identity.provider, identity.subject]),
      ]);
      const existing = await client.query<{ user_id: string }>(
        "SELECT user_id FROM auth_identities WHERE provider=$1 AND subject=$2",
        [identity.provider, identity.subject],
      );
      let id = existing.rows[0]?.user_id;
      if (id) {
        await client.query("UPDATE app_users SET email=$1 WHERE id=$2", [identity.email, id]);
      } else {
        const created = await client.query<{ id: string }>(
          "INSERT INTO app_users(email) VALUES($1) RETURNING id", [identity.email],
        );
        id = created.rows[0].id;
        await client.query(
          "INSERT INTO auth_identities(provider,subject,user_id) VALUES($1,$2,$3)",
          [identity.provider, identity.subject, id],
        );
      }
      return { id, email: identity.email, verified: true as const };
    });
  } catch {
    throw new Error("identity_resolution_failed");
  }
};
