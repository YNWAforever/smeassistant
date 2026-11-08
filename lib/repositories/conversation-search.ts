import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { getPool } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import type { SearchGap, SearchRecord } from "@/lib/workspace/search-gap";
import { compareQueryTitles } from "@/lib/workspace/search-gap";
import { actionMutationRepository } from "./action-mutations";
import { templateByKey } from "@/lib/workspace/templates";
import { localized } from "@/lib/domain";
import { freshnessText } from "@/lib/workspace/actions";

export interface SearchScope { workspaceId: string; locationId: string }
const COLUMNS = `id,workspace_id AS "workspaceId",location_id AS "locationId",gap,brief,created_at::text AS "createdAt",approved_at::text AS "approvedAt",action_id AS "actionId"`;
const VALID_SCOPE = `EXISTS(SELECT 1 FROM locations l WHERE l.id=conversation_search_briefs.location_id AND l.workspace_id=$1)`;

export function conversationSearchRepository(pool?: Pick<Pool, "query" | "connect">) {
  const database = () => pool ?? getPool();
  return {
    async list(scope: SearchScope): Promise<SearchRecord[]> {
      return (await database().query<SearchRecord>(`SELECT ${COLUMNS} FROM conversation_search_briefs WHERE workspace_id=$1 AND location_id=$2 AND ${VALID_SCOPE} ORDER BY created_at DESC,id DESC LIMIT 50`, [scope.workspaceId, scope.locationId])).rows;
    },
    async find(scope: SearchScope, id: string): Promise<SearchRecord | null> {
      return (await database().query<SearchRecord>(`SELECT ${COLUMNS} FROM conversation_search_briefs WHERE workspace_id=$1 AND location_id=$2 AND id=$3 AND ${VALID_SCOPE}`, [scope.workspaceId, scope.locationId, id])).rows[0] ?? null;
    },
    async append(scope: SearchScope, gap: SearchGap, brief: SearchRecord["brief"]): Promise<SearchRecord> {
      // Re-reading identical final evidence must not make another confirmable brief.
      // Keep the original source/draft timestamps on that immutable snapshot.
      const source = { ...gap.source, observedAt: undefined, items: [...gap.source.items].sort(compareQueryTitles) };
      const snapshotKey = createHash("sha256").update(JSON.stringify(brief ? { version: gap.version, market: gap.market, websiteUrl: gap.websiteUrl, status: gap.status, reason: gap.reason, source, queries: [...gap.queries].sort(compareQueryTitles) } : randomUUID())).digest("hex");
      const saved = (await database().query<SearchRecord>(`INSERT INTO conversation_search_briefs(workspace_id,location_id,snapshot_key,gap,brief) VALUES($1,$2,$3,$4,$5) ON CONFLICT(workspace_id,location_id,snapshot_key) DO NOTHING RETURNING ${COLUMNS}`, [scope.workspaceId, scope.locationId, snapshotKey, JSON.stringify(gap), brief ? JSON.stringify(brief) : null])).rows[0];
      if (saved) return saved;
      const existing = (await database().query<SearchRecord>(`SELECT ${COLUMNS} FROM conversation_search_briefs WHERE workspace_id=$1 AND location_id=$2 AND snapshot_key=$3 AND ${VALID_SCOPE}`, [scope.workspaceId, scope.locationId, snapshotKey])).rows[0];
      if (!existing) throw new Error("search_snapshot_unavailable");
      return existing;
    },
    /** The row lock, todo, confirmation and audit commit together. Repeats keep the original ID even after task closure. */
    async approve(scope: SearchScope, id: string, actorId: string): Promise<SearchRecord | null> {
      return withTransaction(async db => {
        const record = (await db.query<SearchRecord>(`SELECT ${COLUMNS} FROM conversation_search_briefs WHERE workspace_id=$1 AND location_id=$2 AND id=$3 AND ${VALID_SCOPE} FOR UPDATE`, [scope.workspaceId, scope.locationId, id])).rows[0];
        if (!record) return null;
        // Recheck accepted ownership inside the transaction, including on idempotent saves.
        const owner = await db.query("SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 AND role='owner' AND accepted_at IS NOT NULL FOR SHARE", [scope.workspaceId, actorId]);
        if (!owner.rows.length) throw new Error("owner_required");
        if (record.approvedAt) return record;
        if (!record.brief || !record.gap.queries.length) throw new Error("brief_unavailable");
        const brief = record.brief, now = new Date(), template = templateByKey("website-basics");
        const title = localized(brief.en.title, brief["zh-HK"].title, brief["zh-TW"].title);
        const detail = (locale: keyof typeof brief) => [brief[locale].missing, brief[locale].why, ...record.gap.queries.map(row => row.title), ...brief[locale].steps, brief[locale].citation].join("\n\n");
        const summary = localized(detail("en"), detail("zh-HK"), detail("zh-TW"));
        const action = await actionMutationRepository(db).createObjective({
          workspace_id: scope.workspaceId, location_id: scope.locationId, template_key: template.key, source: "owner_objective", source_finding_keys: [],
          title, summary,
          evidence: { factType: "Recommended", source: "Google Search Console", value: "", detail: summary, observedAt: record.gap.source.observedAt, freshness: freshnessText(record.gap.source.observedAt!, now) },
          priority: "medium", priority_score: 50, priority_factors: [], effort_minutes: template.effortMinutes,
          required_inputs: template.requiredInputs, provided_inputs: {}, action_state: "needs_input", measurement_state: "not_eligible", capability: template.capability,
          dedupe_key: `conversation-search:${scope.workspaceId}:${scope.locationId}:${record.id}`,
        });
        const saved = (await db.query<SearchRecord>(`UPDATE conversation_search_briefs SET approved_at=now(),approved_by=$4,action_id=$5 WHERE workspace_id=$1 AND location_id=$2 AND id=$3 RETURNING ${COLUMNS}`, [scope.workspaceId, scope.locationId, id, actorId, action.id])).rows[0];
        await db.query("INSERT INTO audit_events(workspace_id,actor_type,actor_id,event,entity_type,entity_id,payload) VALUES($1,'user',$2,'action.updated','action',$3,$4::jsonb)", [scope.workspaceId, actorId, action.id, JSON.stringify({ change: "created", source: "owner_objective", search_brief_id: id, confirmation: "explicit_owner" })]);
        return saved;
      }, database());
    },
  };
}
