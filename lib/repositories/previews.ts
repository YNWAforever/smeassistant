import "server-only";
import type { Pool, PoolClient } from "pg";
import { getPool } from "../db/client";

/**
 * The unsaved preview draft's slot ledger on plain `pg`
 * (neon/migrations/0013_preview_events.sql, spec §1, §2.4).
 *
 * `claim_preview_slot` and `finish_preview_slot` own every limit and the
 * concurrency (one advisory lock); this module only names the arguments and
 * maps the jsonb result. `previewJob` reads exactly four audit_jobs columns:
 * the preview never sees the report, snapshot, findings or raw data.
 */
type Executor = Pick<Pool | PoolClient, "query">;

export type PreviewJob = { id: string; status: string; region: string | null; businessName: string };

export type ClaimRefusal = "already_used" | "job_limit" | "daily_limit" | "budget";

export type ClaimResult = { allowed: true; eventId: string } | { allowed: false; reason: ClaimRefusal };

/** Ruling R3: the only failure reasons a finished slot may carry, so no free text can reach preview_events.reason. */
export type FinishReason = "no_output" | "invalid_output" | "facts_needed";

const REFUSALS: ReadonlySet<string> = new Set<ClaimRefusal>(["already_used", "job_limit", "daily_limit", "budget"]);

/** Preserve nothing from the driver: no SQL, parameters or connection details leave this module. */
async function operation<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch {
    throw new Error("preview_operation_failed");
  }
}

function toClaimResult(value: unknown): ClaimResult {
  const result = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  if (result.allowed === true && typeof result.event_id === "string") return { allowed: true, eventId: result.event_id };
  if (result.allowed === false && typeof result.reason === "string" && REFUSALS.has(result.reason)) {
    return { allowed: false, reason: result.reason as ClaimRefusal };
  }
  throw new Error("unexpected_claim_result");
}

export function previewRepository(client?: Executor) {
  const db = () => client ?? getPool();
  return {
    async previewJob(slug: string): Promise<PreviewJob | null> {
      return operation(async () => {
        const row = (
          await db().query<{ id: string; status: string; region: string | null; business_name: string }>(
            "SELECT id, status, region, business_name FROM audit_jobs WHERE share_slug = $1",
            [slug],
          )
        ).rows[0];
        return row ? { id: row.id, status: row.status, region: row.region, businessName: row.business_name } : null;
      });
    },

    async claimSlot(input: {
      jobId: string;
      grantId: string;
      ipHash: string | null;
      globalDaily: number;
      usdDaily: number;
    }): Promise<ClaimResult> {
      return operation(async () => {
        const row = (
          await db().query<{ result: unknown }>(
            "SELECT public.claim_preview_slot($1::uuid, $2::uuid, $3::text, $4::int, $5::numeric) AS result",
            [input.jobId, input.grantId, input.ipHash, input.globalDaily, input.usdDaily],
          )
        ).rows[0];
        return toClaimResult(row?.result);
      });
    },

    async finishSlot(input: {
      eventId: string;
      outcome: "generated" | "failed";
      reason: FinishReason | null;
      costUsd: number;
    }): Promise<void> {
      await operation(() =>
        db().query("SELECT public.finish_preview_slot($1::uuid, $2::text, $3::text, $4::numeric)", [
          input.eventId,
          input.outcome,
          input.reason,
          input.costUsd,
        ]),
      );
    },
  };
}
