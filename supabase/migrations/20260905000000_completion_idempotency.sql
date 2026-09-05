-- Additive only. Apply to isolated test DB first; shared rollout requires authorization.
-- Historical bigserial IDs and NULL keys remain unchanged. All new completion
-- writers use stable keys; uniqueness is enforced atomically by PostgreSQL.
begin;
alter table public.audit_events add column if not exists idempotency_key text;
create unique index if not exists audit_events_idempotency_key_idx
  on public.audit_events (idempotency_key);
commit;
