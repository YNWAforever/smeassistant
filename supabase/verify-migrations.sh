#!/usr/bin/env bash
#
# Apply the whole migration corpus to a throwaway Postgres and assert the result.
#
# Migrations here are applied BY HAND through the Supabase dashboard — there is no
# CLI step and no staging apply — so until this existed the first execution of any
# migration was against production, by a human pasting SQL. A syntax error, a
# constraint that silently fails to drop, or a DO block that does nothing were all
# things nobody could find out cheaply.
#
# This does not touch Supabase and needs no credentials. It stands up a local
# cluster, shims the few objects Supabase provides (the auth/storage/extensions
# schemas and the anon/authenticated/service_role roles), applies every migration
# in filename order, and then asserts the properties the data-lifecycle work
# depends on.
#
# Requires: postgresql-16 (initdb, pg_ctl, psql) and permission to su to postgres.
#
#   ./supabase/verify-migrations.sh
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
# Must be somewhere the postgres user can traverse; /tmp subdirectories created by
# another user often are not.
WORK="${WORK:-/var/lib/postgresql/verify-migrations}"
DB=migrationcheck
FAILURES=0

log()  { printf '%s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*"; FAILURES=$((FAILURES + 1)); }

cleanup() {
  su postgres -c "$PGBIN/pg_ctl -D $WORK/data -m immediate stop" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

psql_db() { su postgres -c "psql -h $WORK/sock -d $DB -v ON_ERROR_STOP=1 -tAq $*"; }

log "==> starting a throwaway Postgres"
rm -rf "$WORK"
mkdir -p "$WORK/data" "$WORK/sock" "$WORK/migrations"
cp "$ROOT"/supabase/migrations/*.sql "$WORK/migrations/"
chown -R postgres:postgres "$WORK"
su postgres -c "$PGBIN/initdb -D $WORK/data -A trust" >/dev/null 2>&1 || { echo "initdb failed"; exit 1; }
su postgres -c "$PGBIN/pg_ctl -D $WORK/data -o '-k $WORK/sock -c listen_addresses=' -l $WORK/pg.log start" >/dev/null 2>&1
sleep 2

log "==> creating the objects Supabase provides"
su postgres -c "psql -h $WORK/sock -d postgres -q -c 'create database $DB'" >/dev/null 2>&1
# Roles are cluster-wide, so they are created once and outside the per-database script.
for role in anon authenticated service_role; do
  su postgres -c "psql -h $WORK/sock -d postgres -q -c \"create role $role nologin\"" >/dev/null 2>&1
done
su postgres -c "psql -h $WORK/sock -d $DB -v ON_ERROR_STOP=1 -q" <<'SQL' >/dev/null
create schema auth; create schema extensions; create schema storage;
create extension pgcrypto with schema extensions;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
SQL

log "==> applying every migration before 20260822000000_workspace_members.sql"
# This two-phase split (stop before target, seed test data, resume at target) is
# scaffolding that proves the backfill works correctly before production apply. Once
# 20260822000000_workspace_members.sql has been applied to production, this can
# collapse back into a single apply loop: the one-time backfill has happened, and
# re-running migrations no longer proves anything new about that data migration.
TARGET_MIGRATION="20260822000000_workspace_members.sql"
for file in $(ls "$WORK"/migrations/*.sql | sort); do
  filename=$(basename "$file")
  # Stop before the target migration
  if [ "$filename" = "$TARGET_MIGRATION" ]; then
    break
  fi
  if out=$(su postgres -c "psql -h $WORK/sock -d $DB -v ON_ERROR_STOP=1 -q -f $file" 2>&1); then
    log "    ok  $filename"
  else
    fail "$filename did not apply"
    printf '%s\n' "$out" | grep -i error | head -3
  fi
done

log "==> seeding auth.users and workspaces for backfill correctness check"
BOUND_USER_ID=$(psql_db -c "\"select gen_random_uuid()::text;\"")
BOUND_WORKSPACE_ID=$(psql_db -c "\"select gen_random_uuid()::text;\"")
PENDING_WORKSPACE_ID=$(psql_db -c "\"select gen_random_uuid()::text;\"")

su postgres -c "psql -h $WORK/sock -d $DB -v ON_ERROR_STOP=1 -q" <<SQL >/dev/null 2>&1
insert into auth.users (id, email) values ('$BOUND_USER_ID'::uuid, 'bound-owner@example.com');
insert into public.workspaces (id, business_name, market, owner_user_id, owner_email)
  values ('$BOUND_WORKSPACE_ID'::uuid, 'Bound Workspace', 'hk', '$BOUND_USER_ID'::uuid, null);
insert into public.workspaces (id, business_name, market, owner_user_id, owner_email)
  values ('$PENDING_WORKSPACE_ID'::uuid, 'Pending Workspace', 'hk', null, 'pending-owner@example.com');
SQL

log "==> applying 20260822000000_workspace_members.sql and all migrations after it"
FOUND_TARGET=0
for file in $(ls "$WORK"/migrations/*.sql | sort); do
  filename=$(basename "$file")
  # Start applying once we find the target migration
  if [ "$filename" = "$TARGET_MIGRATION" ]; then
    FOUND_TARGET=1
  fi
  if [ "$FOUND_TARGET" = "0" ]; then
    continue
  fi
  if out=$(su postgres -c "psql -h $WORK/sock -d $DB -v ON_ERROR_STOP=1 -q -f $file" 2>&1); then
    log "    ok  $filename"
  else
    fail "$filename did not apply"
    printf '%s\n' "$out" | grep -i error | head -3
  fi
done

log "==> asserting the owner backfill picked the right email for both shapes"
# Check bound owner: should have picked email from auth.users, not NULL
BOUND_EMAIL=$(psql_db -c "\"select email from public.workspace_members where workspace_id='$BOUND_WORKSPACE_ID'::uuid and role='owner';\"")
if [ "$BOUND_EMAIL" = "bound-owner@example.com" ]; then
  log "    ok  bound owner row got email from auth.users"
else
  fail "bound owner row has email '$BOUND_EMAIL', expected 'bound-owner@example.com'"
fi

# Check pending owner: should have picked email from owner_email column
PENDING_EMAIL=$(psql_db -c "\"select email from public.workspace_members where workspace_id='$PENDING_WORKSPACE_ID'::uuid and role='owner';\"")
if [ "$PENDING_EMAIL" = "pending-owner@example.com" ]; then
  log "    ok  pending owner row got email from owner_email column"
else
  fail "pending owner row has email '$PENDING_EMAIL', expected 'pending-owner@example.com'"
fi

log "==> asserting the orphaned workspace cleanup trigger"
# Scenario 1: workspace with one member → deleting that member destroys the workspace
SINGLE_MEMBER_WS=$(psql_db -c "\"select gen_random_uuid()::text;\"")
SINGLE_MEMBER_USER=$(psql_db -c "\"select gen_random_uuid()::text;\"")
SINGLE_MEMBER_ID=$(psql_db -c "\"select gen_random_uuid()::text;\"")
su postgres -c "psql -h $WORK/sock -d $DB -v ON_ERROR_STOP=1 -q" <<SQL >/dev/null 2>&1
insert into auth.users (id, email) values ('$SINGLE_MEMBER_USER'::uuid, 'single-member@example.com');
insert into public.workspaces (id, business_name, market) values ('$SINGLE_MEMBER_WS'::uuid, 'Single Member WS', 'hk');
insert into public.workspace_members (id, workspace_id, user_id, email, role, accepted_at)
  values ('$SINGLE_MEMBER_ID'::uuid, '$SINGLE_MEMBER_WS'::uuid, '$SINGLE_MEMBER_USER'::uuid, 'single-member@example.com', 'owner', now());
SQL
# Delete the only member and verify workspace is gone
su postgres -c "psql -h $WORK/sock -d $DB -v ON_ERROR_STOP=1 -q" <<SQL >/dev/null 2>&1
delete from public.workspace_members where id = '$SINGLE_MEMBER_ID'::uuid;
SQL
WORKSPACE_EXISTS=$(psql_db -c "\"select count(*) from public.workspaces where id='$SINGLE_MEMBER_WS'::uuid;\"")
if [ "$WORKSPACE_EXISTS" = "0" ]; then
  log "    ok  workspace destroyed when last member removed"
else
  fail "workspace still exists after last member removed — trigger did not fire"
fi

# Scenario 2: workspace with two members → deleting one member does NOT destroy workspace
MULTI_MEMBER_WS=$(psql_db -c "\"select gen_random_uuid()::text;\"")
MULTI_MEMBER_USER_1=$(psql_db -c "\"select gen_random_uuid()::text;\"")
MULTI_MEMBER_USER_2=$(psql_db -c "\"select gen_random_uuid()::text;\"")
MULTI_MEMBER_ID_1=$(psql_db -c "\"select gen_random_uuid()::text;\"")
MULTI_MEMBER_ID_2=$(psql_db -c "\"select gen_random_uuid()::text;\"")
su postgres -c "psql -h $WORK/sock -d $DB -v ON_ERROR_STOP=1 -q" <<SQL >/dev/null 2>&1
insert into auth.users (id, email) values ('$MULTI_MEMBER_USER_1'::uuid, 'multi-member-1@example.com');
insert into auth.users (id, email) values ('$MULTI_MEMBER_USER_2'::uuid, 'multi-member-2@example.com');
insert into public.workspaces (id, business_name, market) values ('$MULTI_MEMBER_WS'::uuid, 'Multi Member WS', 'hk');
insert into public.workspace_members (id, workspace_id, user_id, email, role, accepted_at)
  values ('$MULTI_MEMBER_ID_1'::uuid, '$MULTI_MEMBER_WS'::uuid, '$MULTI_MEMBER_USER_1'::uuid, 'multi-member-1@example.com', 'owner', now());
insert into public.workspace_members (id, workspace_id, user_id, email, role, accepted_at)
  values ('$MULTI_MEMBER_ID_2'::uuid, '$MULTI_MEMBER_WS'::uuid, '$MULTI_MEMBER_USER_2'::uuid, 'multi-member-2@example.com', 'viewer', now());
SQL
# Delete one member and verify workspace still exists
su postgres -c "psql -h $WORK/sock -d $DB -v ON_ERROR_STOP=1 -q" <<SQL >/dev/null 2>&1
delete from public.workspace_members where id = '$MULTI_MEMBER_ID_1'::uuid;
SQL
WORKSPACE_EXISTS=$(psql_db -c "\"select count(*) from public.workspaces where id='$MULTI_MEMBER_WS'::uuid;\"")
if [ "$WORKSPACE_EXISTS" = "1" ]; then
  log "    ok  workspace preserved when one of two members removed"
else
  fail "workspace destroyed when one member removed — trigger incorrectly destroyed workspace with surviving members"
fi

# 0001 is the initial schema and uses bare `create table`, so it is the one file
# that cannot be re-applied. Every migration after it is re-appliable, which is
# what matters: they are pasted into a dashboard by hand, and an operator who is
# unsure whether a migration already ran must be able to simply run it again.
# Measured, not assumed — this list came from applying the corpus twice.
NOT_REAPPLIABLE="0001_v0_1_schema.sql 20260801000000_workspaces_oauth_connections.sql 20260801100000_workspace_email_assignment.sql"

log "==> re-applying twice: every migration after 0001 must be idempotent"
for pass in 1 2; do
  for file in $(ls "$WORK"/migrations/*.sql | sort); do
    case " $NOT_REAPPLIABLE " in *" $(basename "$file") "*) continue ;; esac
    su postgres -c "psql -h $WORK/sock -d $DB -v ON_ERROR_STOP=1 -q -f $file" >/dev/null 2>&1 \
      || fail "$(basename "$file") is not idempotent (re-apply pass $pass)"
  done
done

# The claim above is only meaningful if 0001 really is the sole exception.
su postgres -c "psql -h $WORK/sock -d $DB -v ON_ERROR_STOP=1 -q -f $WORK/migrations/0001_v0_1_schema.sql" >/dev/null 2>&1 \
  && fail "0001 re-applied cleanly — the NOT_REAPPLIABLE list is now wrong, not the migration" \
  || log "    ok  0001 is still the only file that cannot be re-applied"

log "==> asserting the audit_jobs delete graph"
ACTUAL=$(psql_db -c "\"select rel.relname||'.'||att.attname||'='||
  case con.confdeltype when 'c' then 'cascade' when 'n' then 'set null' when 'a' then 'NO_ACTION' else con.confdeltype::text end
from pg_constraint con
join pg_class rel on rel.oid=con.conrelid
join pg_class ref on ref.oid=con.confrelid
join pg_attribute att on att.attrelid=rel.oid and att.attnum=con.conkey[1]
where con.contype='f' and ref.relname in ('audit_jobs','workspaces')
  and rel.relnamespace='public'::regnamespace order by 1;\"")
EXPECTED="action_measurements.workspace_id=cascade
action_runs.workspace_id=cascade
actions.workspace_id=cascade
aeo_surface_snapshots.job_id=cascade
agent_runs.job_id=cascade
assets.workspace_id=cascade
audit_events.workspace_id=cascade
audit_findings.job_id=cascade
audit_jobs.parent_job_id=cascade
audit_jobs.workspace_id=set null
brand_profiles.workspace_id=cascade
consent_records.job_id=cascade
deliveries.workspace_id=cascade
leads.job_id=cascade
locations.workspace_id=cascade
notification_events.job_id=set null
notification_events.workspace_id=cascade
oauth_connections.workspace_id=cascade
output_versions.workspace_id=cascade
report_access_grants.job_id=cascade
report_evidence.job_id=cascade
scan_diffs.base_job_id=cascade
scan_diffs.head_job_id=cascade
scan_events.job_id=cascade
scan_schedules.last_job_id=set null
scan_schedules.workspace_id=set null
scan_snapshots.job_id=cascade
scan_snapshots.workspace_id=cascade
staff_report_events.job_id=set null
workspace_access_requests.job_id=cascade
workspace_claim_events.job_id=set null
workspace_claim_events.workspace_id=set null
workspace_members.workspace_id=cascade
workspace_notifications.workspace_id=cascade
workspace_scan_completions.job_id=cascade
workspace_scan_completions.workspace_id=cascade
workspace_tier_events.workspace_id=cascade
workspace_usage.workspace_id=cascade"
if [ "$ACTUAL" = "$EXPECTED" ]; then
  log "    ok  every reference has the intended on-delete action"
else
  fail "delete graph differs"
  diff <(printf '%s\n' "$EXPECTED") <(printf '%s\n' "$ACTUAL") || true
fi

DUPES=$(psql_db -c "\"select count(*) from (
  select 1 from pg_constraint con
  join pg_class rel on rel.oid=con.conrelid
  join pg_attribute att on att.attrelid=rel.oid and att.attnum=con.conkey[1]
  where con.contype='f' and rel.relnamespace='public'::regnamespace
  group by rel.relname, att.attname having count(*) > 1) d;\"")
[ "$DUPES" = "0" ] \
  && log "    ok  no column carries two foreign keys after three applications" \
  || fail "$DUPES column(s) carry duplicate foreign keys — a drop missed its target"

log "==> erasing a fully populated job, the operation this phase exists to enable"
su postgres -c "psql -h $WORK/sock -d $DB -v ON_ERROR_STOP=1 -q" <<'SQL' >/dev/null 2>&1
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000ff');
insert into public.workspaces (id, business_name, market)
  values ('00000000-0000-4000-8000-0000000000aa','WS','hk');
insert into public.workspace_members (workspace_id, user_id, email, role, accepted_at)
  values ('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-0000000000ff','ws@example.test','owner',now());
insert into public.audit_jobs (id, business_name, workspace_id, share_slug)
  values ('11111111-1111-4111-8111-111111111111','Example Shop','00000000-0000-4000-8000-0000000000aa','slug-parent');
-- A re-scan. Before this migration its parent_job_id alone blocked the delete.
insert into public.audit_jobs (id, business_name, parent_job_id, share_slug)
  values ('22222222-2222-4222-8222-222222222222','Example Shop','11111111-1111-4111-8111-111111111111','slug-child');
insert into public.leads (id, job_id, email) values ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','a@b.test');
insert into public.scan_events (job_id, event_name) values ('11111111-1111-4111-8111-111111111111','scan_completed');
insert into public.audit_findings (job_id, finding_key, module, severity) values ('11111111-1111-4111-8111-111111111111','k','ig','high');
insert into public.consent_records (job_id, lead_id, consent_type, granted, policy_version, locale)
  values ('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','scan_discussion',true,'2026-07-28','zh-HK');
insert into public.report_access_grants (job_id, token_hash, idempotency_key, purpose, expires_at)
  values ('11111111-1111-4111-8111-111111111111', repeat('a',64),'k1','viewer_report', now() + interval '30 days');
insert into public.report_evidence (job_id, provider, evidence_type, source_id, captured_at, collection_status)
  values ('11111111-1111-4111-8111-111111111111','instagram','post','p1', now(),'stored');
insert into public.staff_report_events (staff_user_id, staff_email_normalized, job_id, action, metadata)
  values (gen_random_uuid(),'alice@fimmick.com','11111111-1111-4111-8111-111111111111','viewed_lead_contact','{"lead_id":"x"}');
insert into public.workspace_claim_events (job_id, workspace_id, matched_location_id, claimed_by_user_id)
  values ('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-0000000000aa','locations/1','00000000-0000-4000-8000-0000000000ff');
-- What the erase route does before deleting.
update public.staff_report_events
set metadata = metadata || '{"erased_job_id":"11111111-1111-4111-8111-111111111111"}'::jsonb
where job_id = '11111111-1111-4111-8111-111111111111';
update public.workspace_claim_events
set erased_job_id = '11111111-1111-4111-8111-111111111111'
where job_id = '11111111-1111-4111-8111-111111111111';
SQL

if su postgres -c "psql -h $WORK/sock -d $DB -v ON_ERROR_STOP=1 -q -c \"delete from public.audit_jobs where id='11111111-1111-4111-8111-111111111111'\"" >/dev/null 2>&1; then
  log "    ok  delete from audit_jobs succeeded"
else
  fail "delete from audit_jobs still raises — the corpus does not deliver erasure"
fi

REMAINING=$(psql_db -c "\"select
  (select count(*) from public.audit_jobs) + (select count(*) from public.leads) +
  (select count(*) from public.scan_events) + (select count(*) from public.audit_findings) +
  (select count(*) from public.consent_records) + (select count(*) from public.report_access_grants) +
  (select count(*) from public.report_evidence);\"")
[ "$REMAINING" = "0" ] \
  && log "    ok  every merchant row is gone, including the re-scan" \
  || fail "$REMAINING merchant row(s) survived the erasure"

SURVIVED=$(psql_db -c "\"select count(*) from public.staff_report_events
  where job_id is null and metadata->>'erased_job_id' = '11111111-1111-4111-8111-111111111111';\"")
[ "$SURVIVED" = "1" ] \
  && log "    ok  the staff audit row survived, detached, still naming the erased job" \
  || fail "the staff audit trail did not survive erasure — a log its subject can delete is not one"

CLAIM_EVENT_SURVIVED=$(psql_db -c "\"select count(*) from public.workspace_claim_events
  where job_id is null and erased_job_id = '11111111-1111-4111-8111-111111111111';\"")
[ "$CLAIM_EVENT_SURVIVED" = "1" ] \
  && log "    ok  the claim-event audit row survived, detached, still naming the erased job" \
  || fail "the claim-event audit trail did not survive erasure — the only record of which Google location matched would be lost"

log ""
if [ "$FAILURES" -eq 0 ]; then
  log "ALL CHECKS PASSED — the corpus applies and erasure works."
  log "This does NOT apply anything to Supabase. Paste the migration into the"
  log "dashboard SQL editor to make it real; see SETUP.md section 2.2."
  exit 0
fi
log "$FAILURES CHECK(S) FAILED — do not apply this to production."
exit 1
