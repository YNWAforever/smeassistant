import { Pool } from "pg";
import type { OwnerCheckTarget } from "./owner-check-contract";

/** Fixed synthetic custom seed; one transaction, no external services. */
export async function seedOwnerCheckFixture(target: OwnerCheckTarget) {
  const { a, b, ids, managerInId, managerInEmail } = target;
  const seedPool = new Pool({ connectionString: target.ownerUrl, max: 1, connectionTimeoutMillis: 10_000 });
  const pool = await seedPool.connect();
  let ownerId = "";
  try {
    await pool.query("BEGIN");
    ownerId = (await pool.query("SELECT id FROM app_users WHERE email=$1", [a.emails.owner])).rows[0].id;
    const foreignOwnerId = (await pool.query("SELECT id FROM app_users WHERE email=$1", [b.emails.owner])).rows[0].id;
    await pool.query("UPDATE workspace_members m SET user_id=u.id,accepted_at=COALESCE(m.accepted_at,'2026-10-01T00:00:00Z'::timestamptz) FROM app_users u WHERE m.email=u.email AND m.workspace_id=ANY($1::uuid[])", [[a.workspaceId, b.workspaceId]]);
    await pool.query("INSERT INTO app_users(id,email) VALUES($1,$2)", [managerInId, managerInEmail]);
    await pool.query("INSERT INTO auth_identities(provider,subject,user_id) VALUES('neon',$1,$2)", [`fixture:${managerInEmail}`, managerInId]);
    await pool.query("INSERT INTO workspace_members(workspace_id,user_id,email,role,location_scope,accepted_at) VALUES($1,$2,$3,'manager',$4::uuid[],'2026-10-01T00:00:00Z')", [a.workspaceId, managerInId, managerInEmail, [a.locationId]]);
    for (const action of [ids.secondAction, ids.retractAction]) {
      await pool.query(`INSERT INTO actions(id,workspace_id,location_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key)
        VALUES($1::uuid,$2::uuid,$3::uuid,'review-response','{"en":"Synthetic review task"}','{"en":"Owned fixture"}','{}','medium',50,'{}',10,'Live',$1::text)`, [action, a.workspaceId, a.locationId]);
    }
    for (const version of [
      [ids.v1, a.workspaceId, a.actionId, 1, "superseded", "not_requested", null, "Synthetic original reply A"],
      [ids.v2, a.workspaceId, a.actionId, 2, "approved", "exported", "2026-10-01T00:00:00Z", "Synthetic exact saved reply A"],
      [ids.secondVersion, a.workspaceId, ids.secondAction, 1, "approved", "exported", "2026-10-01T00:00:00Z", "Synthetic second historical reply"],
      [ids.foreignVersion, b.workspaceId, b.actionId, 1, "approved", "not_requested", null, "Workspace B private synthetic reply"],
      [ids.retractVersion, a.workspaceId, ids.retractAction, 1, "approved", "not_requested", null, "Synthetic historical retraction reply"],
    ]) await pool.query(`INSERT INTO output_versions(id,workspace_id,action_id,version_no,approval_state,delivery_state,first_exported_at,body,author_type,approved_by,approved_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'user',$9,'2026-10-01T00:00:00Z')`, [...version, version[1] === b.workspaceId ? foreignOwnerId : ownerId]);
    for (const [action, version] of [[a.actionId, ids.v2], [ids.secondAction, ids.secondVersion], [ids.retractAction, ids.retractVersion]]) {
      await pool.query("UPDATE actions SET action_state='completed',completed_at='2026-10-02T00:00:00Z' WHERE id=$1 AND workspace_id=$2", [action, a.workspaceId]);
      await pool.query("INSERT INTO action_applications(workspace_id,action_id,output_version_id,source,asserted_by,asserted_at) VALUES($1,$2,$3,'owner_asserted',$4,'2026-10-02T00:00:00Z')", [a.workspaceId, action, version, ownerId]);
    }
    for (const version of [ids.v2, ids.secondVersion]) await pool.query("INSERT INTO deliveries(workspace_id,version_id,mode,state,counted,idempotency_key,created_by) VALUES($1,$2,'export','exported',true,$3,$4)", [a.workspaceId, version, `fixture:${version}`, ownerId]);
    await pool.query("INSERT INTO workspace_usage(workspace_id,period,approved_deliveries,allowance) VALUES($1,'2026-10',2,3)", [a.workspaceId]);
    for (const [event, entity, time] of [["version.approved", ids.v2, "2026-10-01T00:01:00Z"], ["delivery.exported", ids.v2, "2026-10-01T00:02:00Z"], ["action.applied", a.actionId, "2026-10-02T00:00:00Z"]]) {
      await pool.query("INSERT INTO audit_events(workspace_id,location_id,actor_type,actor_id,event,entity_type,entity_id,payload,created_at) VALUES($1,$2,'user',$3,$4,'action',$5,$6::jsonb,$7)", [a.workspaceId, a.locationId, ownerId, event, entity, JSON.stringify({ output_version_id: ids.v2 }), time]);
    }
    for (const [asset, workspace, location] of [[ids.assetA, a.workspaceId, a.locationId], [ids.assetB, b.workspaceId, b.locationId]]) await pool.query("INSERT INTO assets(id,workspace_id,location_id,kind,storage_path,filename,rights_status,uploaded_by) VALUES($1::uuid,$2::uuid,$3::uuid,'image',$1::text,'synthetic-existing-proof.png','approved',$4::uuid)", [asset, workspace, location, workspace === b.workspaceId ? foreignOwnerId : ownerId]);
    const counts = (await pool.query(`SELECT
      (SELECT count(*) FROM workspaces WHERE id=ANY($1::uuid[]))+
      (SELECT count(*) FROM locations WHERE workspace_id=ANY($1::uuid[]))+
      (SELECT count(*) FROM workspace_members WHERE workspace_id=ANY($1::uuid[]))+
      (SELECT count(*) FROM app_users WHERE email LIKE '%@acceptance.test')+
      (SELECT count(*) FROM auth_identities WHERE subject LIKE 'fixture:%@acceptance.test')+
      (SELECT count(*) FROM actions WHERE workspace_id=ANY($1::uuid[]))+
      (SELECT count(*) FROM output_versions WHERE workspace_id=ANY($1::uuid[]))+
      (SELECT count(*) FROM action_applications WHERE workspace_id=ANY($1::uuid[]))+
      (SELECT count(*) FROM deliveries WHERE workspace_id=ANY($1::uuid[]))+
      (SELECT count(*) FROM workspace_usage WHERE workspace_id=ANY($1::uuid[]))+
      (SELECT count(*) FROM assets WHERE workspace_id=ANY($1::uuid[]))+
      (SELECT count(*) FROM audit_events WHERE workspace_id=ANY($1::uuid[])) AS rows`, [[a.workspaceId, b.workspaceId]])).rows[0];
    if (Number(counts.rows) + 1 > 60) throw new Error("fixture_seed_budget_exceeded");
    const membership = (await pool.query(`SELECT count(*)::int AS ready FROM workspace_members m
      JOIN app_users u ON u.id=m.user_id
      WHERE m.workspace_id=ANY($1::uuid[]) AND m.accepted_at IS NOT NULL
      AND u.email LIKE '%@acceptance.test'
      AND EXISTS(SELECT 1 FROM auth_identities i WHERE i.user_id=u.id AND i.provider='neon' AND i.subject='fixture:'||u.email)`,
    [[a.workspaceId, b.workspaceId]])).rows[0];
    if (membership.ready !== 7) throw new Error("fixture_membership_state_incomplete");
    await pool.query("COMMIT");
    return { ownerId, rows: Number(counts.rows) };
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  } finally { pool.release(); await seedPool.end(); }
}
