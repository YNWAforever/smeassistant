import "server-only";
import { getPool } from "../db/client";
import { withTransaction } from "../db/transaction";
import { createIdempotencyKey } from "../report-access/token";

/**
 * Report recovery: a short-lived, single-use `report_recovery` grant mailed to
 * an address that already holds a viewer grant on the report, redeemed for a
 * fresh `viewer_report` grant on the device that opens the link.
 *
 * Both rows this module writes carry `email_normalized = NULL` and
 * `lead_id = NULL`, so recovery never widens who counts as a lead recipient
 * (claimsRepository.isLeadRecipient), and `findViewerGrant` excludes the
 * `report_recovery` purpose, so a recovery row never acts as a viewer cookie.
 */
export const reportRecoveryRepository = {
  /** The report behind `slug`, when `email` already holds a non-revoked viewer grant on it (an expired one still counts). */
  async findRecipientGrant(slug: string, email: string): Promise<{ jobId: string; workspaceId: string | null; businessName: string } | null> {
    return (await getPool().query<{ jobId: string; workspaceId: string | null; businessName: string }>(`SELECT j.id AS "jobId",j.workspace_id AS "workspaceId",j.business_name AS "businessName"
FROM audit_jobs j WHERE j.share_slug=$1 AND EXISTS (
  SELECT 1 FROM report_access_grants g WHERE g.job_id=j.id AND g.purpose='viewer_report' AND g.revoked_at IS NULL
    AND lower(g.email_normalized)=lower(trim($2)))`, [slug, email])).rows[0] ?? null;
  },
  async insertRecoveryGrant(jobId: string, tokenHash: string): Promise<{ grantId: string }> {
    const row = (await getPool().query<{ id: string }>(`INSERT INTO report_access_grants(job_id,lead_id,token_hash,idempotency_key,purpose,email_normalized,expires_at)
VALUES($1,NULL,$2,$3,'report_recovery',NULL,now()+interval '60 minutes') RETURNING id`, [jobId, tokenHash, createIdempotencyKey()])).rows[0];
    return { grantId: row.id };
  },
  /**
   * Single-use under concurrency: the conditional UPDATE is the first statement,
   * so of two concurrent redeems only one matches `redeemed_at IS NULL`; the
   * other waits on the row lock, re-checks, and gets zero rows.
   */
  async redeemRecoveryGrant(tokenHash: string, viewer: { tokenHash: string; idempotencyKey: string }): Promise<{ grantId: string; jobId: string; slug: string } | null> {
    return withTransaction(async client => {
      const redeemed = (await client.query<{ id: string; job_id: string }>(`UPDATE report_access_grants SET redeemed_at=now()
WHERE token_hash=$1 AND purpose='report_recovery' AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > now()
RETURNING id, job_id`, [tokenHash])).rows[0];
      if (!redeemed) return null;
      const grant = (await client.query<{ id: string }>(`INSERT INTO report_access_grants(job_id,lead_id,token_hash,idempotency_key,purpose,email_normalized,expires_at)
VALUES($1,NULL,$2,$3,'viewer_report',NULL,now()+interval '30 days') RETURNING id`, [redeemed.job_id, viewer.tokenHash, viewer.idempotencyKey])).rows[0];
      const job = (await client.query<{ share_slug: string }>("SELECT share_slug FROM audit_jobs WHERE id=$1", [redeemed.job_id])).rows[0];
      return { grantId: grant.id, jobId: redeemed.job_id, slug: job.share_slug };
    });
  },
};
