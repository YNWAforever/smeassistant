-- Demo workspace seed: 錦汶館 (kam-man-house), the merchant every prototype
-- page renders (lib/demo-data.ts). LOCAL QA ONLY -- apply to a Docker Postgres
-- from the integration harness, never to the shared Supabase project.
--
-- Idempotent: every row has a fixed UUID and `on conflict do nothing`, so it
-- can be pasted again after a partial run. scripts/seed-demo.ts mirrors these
-- rows (same ids) and then adds what PostgREST alone can express: two fixture
-- scans, their diff, snapshots, actions and output versions.
--
-- The owner is a PENDING workspace_members row (user_id null). A verified
-- magic-link sign-in with that email binds it (app/auth/callback), which is how
-- a developer gets into the demo workspace without touching auth.users here.

begin;

insert into public.workspaces (id, business_name, industry, district, market, tier, slug, timezone, is_demo, instagram_handle)
values (
  'd0000000-0000-4000-8000-000000000001',
  '錦汶館',
  'fnb',
  'Tin Hau',
  'hk',
  'paid',
  'kam-man-house',
  'Asia/Hong_Kong',
  true,
  'kammanhouse.hk'
)
on conflict (id) do nothing;

insert into public.locations (id, workspace_id, slug, name, address, district, place_id, ig_handle, website_url, is_primary)
values
  ('d0000000-0000-4000-8000-000000000011', 'd0000000-0000-4000-8000-000000000001', 'yik-yam-street', 'Yik Yam Street',
   '8 Yik Yam Street, Happy Valley', 'Happy Valley', 'ChIJfixture-kam-man-house', 'kammanhouse.hk', 'https://kammanhouse.example.invalid', true),
  ('d0000000-0000-4000-8000-000000000012', 'd0000000-0000-4000-8000-000000000001', 'tin-hau', 'Tin Hau',
   'Electric Road, Tin Hau', 'Tin Hau', 'ChIJfixture-kam-man-house', 'kammanhouse.hk', 'https://kammanhouse.example.invalid', false)
on conflict (id) do nothing;

insert into public.workspace_members (id, workspace_id, user_id, email, role, invited_at, accepted_at)
values ('d0000000-0000-4000-8000-000000000021', 'd0000000-0000-4000-8000-000000000001', null, 'demo-owner@example.com', 'owner', now(), null)
on conflict (id) do nothing;

insert into public.brand_profiles (workspace_id, voice, approved_claims, prohibited_terms, languages, facts)
values (
  'd0000000-0000-4000-8000-000000000001',
  'warm',
  array['每日新鮮出爐菠蘿包', '街坊價錢', 'WhatsApp 訂座'],
  array['米芝蓮', '全港最好'],
  array['zh-HK', 'en'],
  '{"opening_hours": "07:00-18:00", "signature_dishes": ["菠蘿包", "焗豬扒飯", "絲襪奶茶"], "private_dining": {"capacity": 24, "booking_lead_days": 3}}'::jsonb
)
on conflict (workspace_id) do nothing;

-- "5 of 12" approved deliveries, as the prototype sidebar shows.
insert into public.workspace_usage (workspace_id, period, approved_deliveries, allowance)
values ('d0000000-0000-4000-8000-000000000001', '2026-09', 5, 12)
on conflict (workspace_id, period) do nothing;

commit;
