/** Historical facade fixture for retained domain tests only; never import from application runtime. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { completionId } from "@/lib/workspace/completion-id";
import type { SnapshotRepository } from "@/lib/repositories/snapshots";
import type { SnapshotJobRow, ScanSnapshotRow, ScanDiffRow, SnapshotRecord } from "@/lib/workspace/snapshots";
async function ensureSnapshotAudit(db: SupabaseClient, snapshot: SnapshotRecord): Promise<void> {
  // Preserve pre-existing randomly keyed audit rows from earlier releases.
  const { data, error } = await db.from("audit_events").select("id").eq("event", "snapshot.created").eq("entity_id", snapshot.id).limit(1);
  if (error) throw new Error("snapshot audit lookup failed");
  if (data?.length) return;
  const { error: insertError } = await db.from("audit_events").upsert({
    idempotency_key: completionId("snapshot.created", snapshot.id),
    workspace_id: snapshot.workspaceId, location_id: snapshot.locationId,
    actor_type: "scanner", actor_id: null, event: "snapshot.created",
    entity_type: "scan_snapshot", entity_id: snapshot.id,
    payload: { locale: null, coverage: snapshot.coverage, overall_score: snapshot.overallScore, job_id: snapshot.jobId },
  }, { onConflict: "idempotency_key", ignoreDuplicates: true });
  if (insertError) throw new Error("snapshot audit insert failed");
}


export function legacySnapshotRepository(db: SupabaseClient): SnapshotRepository {
 return {
 async job(jobId) { const {data,error} = await db.from("audit_jobs").select("id,workspace_id,location_id,region,status,completed_at,created_at,scoring_version,overall_score,score_coverage,module_results,module_scores,raw_data,input_snapshot,website_url").eq("id",jobId).maybeSingle<SnapshotJobRow>(); if(error) throw new Error("snapshot job lookup failed");
  if (data?.workspace_id && data.location_id) {
   const location = await db.from("locations").select("id").eq("id",data.location_id).eq("workspace_id",data.workspace_id).maybeSingle<{id:string}>();
   if(location.error) throw new Error("snapshot location lookup failed");
   if(!location.data) throw new Error("snapshot_scope_mismatch");
  }
  return data; },
 async findings(jobId) { const {data,error} = await db.from("audit_findings").select("finding_key,evidence").eq("job_id",jobId); if(error) throw new Error("snapshot findings lookup failed"); return data ?? []; },
 async aeo(jobId) { const {data,error} = await db.from("aeo_surface_snapshots").select("surface,cited,rank").eq("job_id",jobId); if(error) throw new Error("snapshot aeo lookup failed"); return data ?? []; },
 async forJob(jobId) { const {data,error} = await db.from("scan_snapshots").select("*").eq("job_id",jobId).maybeSingle<ScanSnapshotRow>(); if(error) throw new Error("snapshot lookup failed"); return data; },
 async byId(id) { const {data,error} = await db.from("scan_snapshots").select("*").eq("id",id).maybeSingle<ScanSnapshotRow>(); if(error) throw new Error("snapshot lookup failed"); return data; },
 async diff(jobId) { const {data,error} = await db.from("scan_diffs").select("*").eq("head_job_id",jobId).order("created_at",{ascending:false}).limit(1).returns<ScanDiffRow[]>(); if(error) throw new Error("diff lookup failed"); return data?.[0] ?? null; },
 async save(row) { const {data,error} = await db.from("scan_snapshots").upsert(row,{onConflict:"job_id"}).select("*").single<ScanSnapshotRow>(); if(error || !data) throw new Error("snapshot upsert failed"); return data; },
 ensureAudit: (snapshot) => ensureSnapshotAudit(db, snapshot),
 };
}
