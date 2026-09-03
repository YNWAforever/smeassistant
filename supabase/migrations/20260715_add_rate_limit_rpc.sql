-- Atomic, server-only token bucket for abuse controls.
-- The bucket key is already HMAC'd by the application; this function never
-- receives or stores a raw IP address, email address, or contact value.

begin;
alter table public.rate_limit_buckets
  add column if not exists expires_at timestamptz;

update public.rate_limit_buckets
set expires_at = updated_at + interval '1 hour'
where expires_at is null;

alter table public.rate_limit_buckets
  alter column expires_at set not null;

create index if not exists rate_limit_buckets_expires_at_idx
  on public.rate_limit_buckets (expires_at);

create or replace function public.consume_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_bucket public.rate_limit_buckets%rowtype;
  now_at timestamptz := clock_timestamp();
  window_ends_at timestamptz;
begin
  if btrim(coalesce(p_bucket_key, '')) = '' then
    raise exception 'bucket_key_required' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 then
    raise exception 'limit_must_be_positive' using errcode = '22023';
  end if;
  if p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'window_must_be_positive' using errcode = '22023';
  end if;

  -- Bound cleanup work while ensuring expired attacker-created keys do not
  -- remain as permanent storage.
  with expired as (
    select bucket_key
    from public.rate_limit_buckets
    where expires_at <= now_at
      and bucket_key <> p_bucket_key
    order by expires_at
    limit 100
    for update skip locked
  )
  delete from public.rate_limit_buckets as bucket
  using expired
  where bucket.bucket_key = expired.bucket_key;

  -- Serialize the missing-row and existing-row cases alike. The key is a
  -- digest, so using it as an advisory lock does not reveal raw identity.
  perform pg_advisory_xact_lock(hashtextextended(p_bucket_key, 0::bigint));
  select *
  into current_bucket
  from public.rate_limit_buckets
  where bucket_key = p_bucket_key
  for update;

  if not found then
    insert into public.rate_limit_buckets (bucket_key, window_started_at, request_count, updated_at, expires_at)
    values (p_bucket_key, now_at, 1, now_at, now_at + (p_window_seconds * interval '1 second'));
    return query select true, 0;
    return;
  end if;

  window_ends_at := current_bucket.window_started_at + (p_window_seconds * interval '1 second');
  if window_ends_at <= now_at then
    update public.rate_limit_buckets
    set
      window_started_at = now_at,
      request_count = 1,
      updated_at = now_at,
      expires_at = now_at + (p_window_seconds * interval '1 second')
    where bucket_key = p_bucket_key;
    return query select true, 0;
    return;
  end if;

  if current_bucket.request_count < p_limit then
    update public.rate_limit_buckets
    set
      request_count = current_bucket.request_count + 1,
      updated_at = now_at,
      expires_at = window_ends_at
    where bucket_key = p_bucket_key;
    return query select true, 0;
    return;
  end if;

  return query select false, greatest(1, ceil(extract(epoch from (window_ends_at - now_at)))::integer);
end;
$$;

revoke execute on function public.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer)
  to service_role;

commit;
