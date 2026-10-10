/** Pending workspace invitations stop being usable this many days after `invited_at`. */
export const INVITATION_TTL_DAYS = 14;

/**
 * SQL predicate for "this pending invitation is still live". The alias is
 * interpolated into SQL, so it is restricted to a bare lowercase identifier.
 * With `enforce` false (invitation mail flag off) it is a no-op.
 */
export function pendingInvitationLiveSql(alias: string, enforce: boolean): string {
  if (!/^[a-z_]+$/.test(alias)) throw new Error("invalid_sql_alias");
  return enforce ? `${alias}.invited_at > now() - interval '${INVITATION_TTL_DAYS} days'` : "TRUE";
}
