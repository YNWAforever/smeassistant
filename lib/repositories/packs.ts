import "server-only";
import type { Pool, PoolClient } from "pg";
import { getPool } from "../db/client";
import { withTransaction } from "../db/transaction";
import { workspaceEn, workspaceZhHK, workspaceZhTW } from "../copy-workspace";
import { localized, type ActionState } from "../domain";
import { dedupeKeyFor, freshnessText } from "../workspace/actions";
import { PACK_STARTED_EVENT } from "../workspace/audit";
import { applyResolvedInputs, resolveEvidenceInputs } from "../workspace/evidence-inputs";
import { isPackFinished, STARTER_PACK, type PackItemRow, type PackKind, type PackPosition, type StarterItemKey, type WorkPack } from "../workspace/packs-model";
import { TEMPLATES } from "../workspace/templates";
import { actionMutationRepository } from "./action-mutations";
import { artifactRepository } from "./artifacts";

/**
 * Work packs on plain `pg` (neon/migrations/0012_work_packs.sql, spec §2.2).
 *
 * Membership, role and location scope are the caller's: every function here
 * trusts the ids it is given. A pack stores no approval, delivery, run or
 * output state; it only points at actions.
 */
type Executor = Pick<Pool | PoolClient, "query">;
type PackDatabase = Pick<Pool, "query" | "connect">;

interface PackRow {
  id: string;
  workspace_id: string;
  location_id: string | null;
  kind: PackKind;
  created_at: Date;
  closed_at: Date | null;
}

interface ItemRow {
  template_key: StarterItemKey;
  position: number;
  action_id: string;
  action_state: ActionState;
}

export interface StartPackInput {
  workspaceId: string;
  locationId: string | null;
  actorId: string;
  locale: string;
  ipHash: string | null;
}

export interface StartPackResult {
  packId: string;
  created: boolean;
  /**
   * In position order. `reused` is true when this call did not create the
   * action: an open action with the same dedupe key already existed, or (with
   * `created: false`) the pack itself already existed.
   */
  items: Array<{ templateKey: StarterItemKey; actionId: string; reused: boolean }>;
}

export interface LoadedPack {
  pack: WorkPack;
  itemRows: PackItemRow[];
}

const PACK_COLUMNS = "id,workspace_id,location_id,kind,created_at,closed_at";
// The same expression as work_packs_open_idx, so the open-pack lookup uses it.
const OPEN_KEY = "coalesce(location_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce($2::uuid,'00000000-0000-0000-0000-000000000000'::uuid)";
const OPEN_PACK_SQL = `SELECT ${PACK_COLUMNS} FROM work_packs WHERE workspace_id=$1 AND ${OPEN_KEY} AND kind=$3 AND closed_at IS NULL`;

function toPack(row: PackRow): WorkPack {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    locationId: row.location_id,
    kind: row.kind,
    createdAt: row.created_at.toISOString(),
    closedAt: row.closed_at ? row.closed_at.toISOString() : null,
  };
}

function toItemRow(row: ItemRow): PackItemRow {
  return { templateKey: row.template_key, position: row.position as PackPosition, actionId: row.action_id };
}

async function itemRows(db: Executor, packId: string): Promise<ItemRow[]> {
  return (
    await db.query<ItemRow>(
      `SELECT i.template_key,i.position,i.action_id,a.action_state FROM work_pack_items i
       JOIN actions a ON a.id=i.action_id WHERE i.pack_id=$1 ORDER BY i.position`,
      [packId],
    )
  ).rows;
}

async function loadPack(db: Executor, row: PackRow | undefined): Promise<LoadedPack | null> {
  if (!row) return null;
  return { pack: toPack(row), itemRows: (await itemRows(db, row.id)).map(toItemRow) };
}

function existing(packId: string, rows: ItemRow[]): StartPackResult {
  return { packId, created: false, items: rows.map((row) => ({ templateKey: row.template_key, actionId: row.action_id, reused: true })) };
}

function isOpenPackConflict(error: unknown): boolean {
  const e = error as { code?: unknown; constraint?: unknown } | null;
  return e?.code === "23505" && e.constraint === "work_packs_open_idx";
}

/**
 * The required inputs exactly as POST /api/actions computes them: the template's
 * inputs, less `reviews_without_response` when the latest snapshot for this
 * scope retains an unanswered review. Read only for a template that asks for it,
 * on the transaction's client. No brand resolution, matching the route.
 */
async function scanResolvedInputs(db: Executor, workspaceId: string, locationId: string | null): Promise<ReadonlySet<string>> {
  const repository = artifactRepository(db);
  const evidence = await repository.assistantLatestSnapshot(workspaceId, locationId);
  if (!evidence) return new Set<string>();
  return resolveEvidenceInputs({ rawData: await repository.assistantReviewData(workspaceId, evidence.jobId) });
}

async function startInTransaction(client: PoolClient, input: StartPackInput): Promise<StartPackResult> {
  const { workspaceId, locationId } = input;
  const kind = STARTER_PACK.kind;

  // 1-3. Lock the open pack for this key. Unfinished: return it untouched.
  // Finished: close it and start a new one.
  const open = (await client.query<PackRow>(`${OPEN_PACK_SQL} FOR UPDATE`, [workspaceId, locationId, kind])).rows[0];
  if (open) {
    const rows = await itemRows(client, open.id);
    if (!isPackFinished(rows.map((row) => row.action_state))) return existing(open.id, rows);
    await client.query("UPDATE work_packs SET closed_at=now() WHERE id=$1", [open.id]);
  }

  // 4. Insert the pack. A concurrent start that got there first holds the open
  // index entry: this insert waits for it to commit and then raises 23505. The
  // savepoint keeps this transaction usable so the winner can be returned.
  await client.query("SAVEPOINT work_pack_insert");
  let packId: string;
  try {
    const inserted = await client.query<{ id: string }>(
      "INSERT INTO work_packs(workspace_id,location_id,kind,created_by) VALUES($1,$2,$3,$4) RETURNING id",
      [workspaceId, locationId, kind, input.actorId],
    );
    packId = inserted.rows[0]!.id;
    await client.query("RELEASE SAVEPOINT work_pack_insert");
  } catch (error) {
    if (!isOpenPackConflict(error)) throw error;
    await client.query("ROLLBACK TO SAVEPOINT work_pack_insert");
    const winner = (await client.query<PackRow>(OPEN_PACK_SQL, [workspaceId, locationId, kind])).rows[0];
    if (!winner) throw new Error("pack_start_failed");
    return existing(winner.id, await itemRows(client, winner.id));
  }

  // 5. Create or reuse each item's action, in position order, through the one
  // objective path, keyed exactly as scan derivation keys it.
  const now = new Date();
  const observedAt = now.toISOString();
  const packName = localized(workspaceEn.packs.title, workspaceZhHK.packs.title, workspaceZhTW.packs.title);
  const actions = actionMutationRepository(client);
  let resolved: ReadonlySet<string> | null = null;
  const items: StartPackResult["items"] = [];
  for (const templateKey of STARTER_PACK.items) {
    const template = TEMPLATES.find((t) => t.key === templateKey);
    if (!template) throw new Error("pack_template_missing");
    if (template.requiredInputs.includes("reviews_without_response") && !resolved) {
      resolved = await scanResolvedInputs(client, workspaceId, locationId);
    }
    const requiredInputs = applyResolvedInputs(template.requiredInputs, resolved ?? new Set<string>());
    const action = await actions.createObjective({
      workspace_id: workspaceId,
      location_id: locationId,
      template_key: templateKey,
      source: "owner_objective",
      source_finding_keys: [],
      title: template.title,
      summary: template.summary,
      evidence: {
        factType: "Recommended",
        source: "Visibility starter pack",
        value: "",
        detail: packName,
        observedAt,
        freshness: freshnessText(observedAt, now),
      },
      priority: "medium",
      priority_score: 50,
      priority_factors: [],
      effort_minutes: template.effortMinutes,
      required_inputs: requiredInputs,
      provided_inputs: {},
      // provided_inputs is empty, so every required input is still missing.
      action_state: requiredInputs.length ? "needs_input" : "recommended",
      measurement_state: "not_eligible",
      capability: template.capability,
      dedupe_key: dedupeKeyFor(workspaceId, locationId, templateKey),
    });
    items.push({ templateKey, actionId: action.id, reused: !action.created });
  }

  // 6. The three item rows. The action foreign key is deferred (ruling P2), so a
  // bad action_id would fail at COMMIT; withTransaction surfaces that as a
  // failure of the whole start.
  for (const [index, item] of items.entries()) {
    await client.query("INSERT INTO work_pack_items(pack_id,action_id,template_key,position) VALUES($1,$2,$3,$4)", [
      packId,
      item.actionId,
      item.templateKey,
      index + 1,
    ]);
  }

  // 7. Audit, in the same transaction.
  await client.query(
    `INSERT INTO audit_events(workspace_id,location_id,actor_type,actor_id,event,entity_type,entity_id,payload)
     VALUES($1,$2,'user',$3,'${PACK_STARTED_EVENT}','work_pack',$4,$5)`,
    [
      workspaceId,
      locationId,
      input.actorId,
      packId,
      JSON.stringify({
        locale: input.locale,
        ...(input.ipHash ? { ip_hash: input.ipHash } : {}),
        pack_id: packId,
        location_id: locationId,
        items: items.map((item) => ({ template_key: item.templateKey, action_id: item.actionId, reused: item.reused })),
      }),
    ],
  );
  return { packId, created: true, items };
}

/**
 * `database` defaults to the application pool. startPack checks out one client
 * for its whole transaction; the reads run on the pool.
 */
export function packRepository(database?: PackDatabase) {
  const db = () => database ?? getPool();
  async function read<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch {
      throw new Error("pack_read_failed");
    }
  }
  return {
    /** Spec §2.2. Never calls a model. Any failure, including one at COMMIT, rolls the whole start back. */
    async startPack(input: StartPackInput): Promise<StartPackResult> {
      try {
        return await withTransaction((client) => startInTransaction(client, input), db());
      } catch {
        throw new Error("pack_start_failed");
      }
    },
    openPack(workspaceId: string, locationId: string | null): Promise<LoadedPack | null> {
      return read(async () => loadPack(db(), (await db().query<PackRow>(OPEN_PACK_SQL, [workspaceId, locationId, STARTER_PACK.kind])).rows[0]));
    },
    getPack(packId: string): Promise<LoadedPack | null> {
      return read(async () => loadPack(db(), (await db().query<PackRow>(`SELECT ${PACK_COLUMNS} FROM work_packs WHERE id=$1`, [packId])).rows[0]));
    },
    packScope(packId: string): Promise<{ workspaceId: string; locationId: string | null } | null> {
      return read(async () => {
        const row = (await db().query<{ workspace_id: string; location_id: string | null }>("SELECT workspace_id,location_id FROM work_packs WHERE id=$1", [packId])).rows[0];
        return row ? { workspaceId: row.workspace_id, locationId: row.location_id } : null;
      });
    },
  };
}

export type PackRepository = ReturnType<typeof packRepository>;
