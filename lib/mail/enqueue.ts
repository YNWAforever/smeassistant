import { completionId } from "@/lib/workspace/completion-id";
import type { MailOutboxRepository, OutboxInsert } from "@/lib/repositories/mail-outbox";

import { mailAvailability, parseRecipientAllowlist } from "./availability";
import { decideRecipient, mailKindsForScan, type ScanDiffForMail } from "./decide";

/**
 * Enqueues one `mail_outbox` row per accepted member per mail kind, inside
 * the same transaction that already persisted the snapshot and the in-app
 * `scan.completed` notification (lib/workspace/post-process.ts). Every row
 * gets a deterministic id (completionId) so a retried completion -- the same
 * job re-run through this function a second time -- inserts nothing extra
 * and never resurrects or resets a row that has since moved to `held` or
 * `sent` (Review Focus 3; enforced by mailOutboxRepository.insert's `ON
 * CONFLICT (id) DO NOTHING`).
 *
 * Per-recipient hold/queue decisions (decideRecipient) are made *now*, at
 * enqueue time, from the facts this transaction can see. A fact that changes
 * later (a member opts out, or is removed, before the delivery tick runs)
 * is handled by the tick re-reading facts at send time (sendFacts), not by
 * this function -- it never re-decides an already-inserted row.
 */
export interface EnqueueScanMailInput {
  workspaceId: string;
  jobId: string;
  status: string;
  businessName: string;
  market: "hk" | "tw";
  workspacePath: string | null;
  diff: ScanDiffForMail | null;
}

const MARKET_LOCALE_FALLBACK = { hk: "zh-HK", tw: "zh-TW" } as const;

export async function enqueueScanMail(
  repo: Pick<MailOutboxRepository, "recipients" | "insert">,
  input: EnqueueScanMailInput,
  env: Record<string, string | undefined> = process.env,
): Promise<number> {
  const kinds = mailKindsForScan({ status: input.status }, input.diff);
  if (kinds.length === 0) return 0;

  const availability = mailAvailability(env);
  const allowlist = parseRecipientAllowlist(env.MAIL_RECIPIENT_ALLOWLIST);
  const localeFallback = MARKET_LOCALE_FALLBACK[input.market];

  let inserted = 0;
  for (const kind of kinds) {
    const recipients = await repo.recipients(input.workspaceId, kind);
    if (recipients.length === 0) continue;

    const rows: OutboxInsert[] = recipients.map(({ userId, facts, locale }) => {
      const decision = decideRecipient(facts, { availability, allowlist });
      return {
        id: completionId("mail", input.workspaceId, input.jobId, kind, userId),
        workspace_id: input.workspaceId,
        user_id: userId,
        job_id: input.jobId,
        kind,
        to_address: facts.address,
        locale: locale ?? localeFallback,
        state: decision.state,
        hold_reason: decision.state === "held" ? decision.reason : null,
        payload: {
          businessName: input.businessName,
          regressedCount: kind === "regression_alert" ? (input.diff?.regressed_findings.length ?? 0) : null,
          workspacePath: input.workspacePath,
        },
      };
    });

    inserted += await repo.insert(rows);
  }
  return inserted;
}
