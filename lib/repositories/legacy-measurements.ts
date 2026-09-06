/** Temporary Task 13 adapter: retain the caller's original fenced legacy client.
 * Remove when completion orchestration supplies a PostgreSQL transaction client. */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MeasurementRepository } from './measurements';
import { legacySnapshotRepository } from './legacy-snapshots';
import { loadSnapshotById } from '../workspace/snapshots';
import { completionId } from '../workspace/completion-id';
import type { MeasurableActionRow, ExportedVersionRow, MeasurementFactType } from '../workspace/measurements';
export function legacyMeasurementRepository(db: SupabaseClient): MeasurementRepository {
 return {
  base: (head) => loadSnapshotById(legacySnapshotRepository(db), head.comparableTo!),
  async headJob(head) { const {data,error}=await db.from('audit_jobs').select('created_at').eq('id',head.jobId).maybeSingle<{created_at:string}>(); if(error) throw new Error('measurement job lookup failed'); return data; },
  async actions(head,states) { let q=db.from('actions').select('id, template_key, location_id').eq('workspace_id',head.workspaceId).in('action_state',states); q=head.locationId?q.or(`location_id.eq.${head.locationId},location_id.is.null`):q.is('location_id',null); const {data,error}=await q.returns<MeasurableActionRow[]>(); if(error) throw new Error('measurement actions lookup failed'); return data ?? []; },
  async existing(head,ids) { const {data,error}=await db.from('action_measurements').select('action_id, fact_type').eq('after_snapshot_id',head.id).in('action_id',ids).returns<Array<{action_id:string;fact_type:MeasurementFactType}>>(); if(error) throw new Error('measurement lookup failed'); return data ?? []; },
  async exports(_head,ids) { const {data,error}=await db.from('output_versions').select('action_id, first_exported_at').in('action_id',ids).not('first_exported_at','is',null).returns<ExportedVersionRow[]>(); if(error) throw new Error('measurement exports lookup failed'); return data ?? []; },
  async insert(rows,head) { const {data,error}=await db.from('action_measurements').upsert(rows.map(row=>({...row,id:completionId('measurement',row.action_id,head.id)})),{onConflict:'id',ignoreDuplicates:true}).select('id'); if(error) throw new Error('measurement insert failed'); return data?.length ?? 0; },
  async latest(head) { let q=db.from('scan_snapshots').select('id').eq('workspace_id',head.workspaceId); q=head.locationId?q.eq('location_id',head.locationId):q.is('location_id',null); const {data,error}=await q.order('observed_at',{ascending:false}).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(1).maybeSingle<{id:string}>(); if(error) throw new Error('measurement latest snapshot lookup failed'); return data; },
  async updateState(_head,ids,state,now) { const {error}=await db.from('actions').update({measurement_state:state,updated_at:now}).in('id',ids); if(error) throw new Error('measurement state update failed'); },
 };
}
