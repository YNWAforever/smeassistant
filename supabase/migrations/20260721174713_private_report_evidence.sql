begin;

create table if not exists public.report_evidence (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.audit_jobs(id) on delete cascade,
  provider text not null check (provider in ('instagram', 'google_maps')),
  evidence_type text not null check (
    evidence_type in ('profile', 'post', 'reel', 'story', 'highlight', 'photo', 'review')
  ),
  source_id text not null,
  source_url text,
  captured_at timestamptz not null,
  published_at timestamptz,
  text_content text,
  metadata jsonb not null default '{}'::jsonb,
  storage_bucket text,
  storage_path text,
  content_sha256 text check (
    content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'
  ),
  mime_type text,
  byte_size integer check (
    byte_size is null or byte_size between 1 and 5242880
  ),
  width integer check (width is null or width between 1 and 4800),
  height integer check (height is null or height between 1 and 4800),
  collection_status text not null check (
    collection_status in ('stored', 'metadata_only', 'failed')
  ),
  limitation_code text,
  created_at timestamptz not null default now(),
  unique (job_id, provider, evidence_type, source_id)
);

create index if not exists report_evidence_job_captured_idx
  on public.report_evidence (job_id, captured_at desc);

-- Evidence metadata and objects are available only to trusted server routes.
-- No anon or authenticated policies are created for either relation.
alter table public.report_evidence enable row level security;
revoke all on table public.report_evidence from public, anon, authenticated;
grant select, insert, update, delete on table public.report_evidence to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-evidence', 'report-evidence', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

commit;
