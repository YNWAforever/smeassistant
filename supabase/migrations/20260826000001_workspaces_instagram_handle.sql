-- Owner onboarding checklist: a plain, eyeball-confirmed Instagram handle for
-- a claimed workspace. NOT an OAuth connection -- there is no Instagram OAuth
-- in this repo (oauth_connections.provider's 'instagram' value is reserved
-- but explicitly "accepted but unimplemented", per its own migration
-- comment). This column is the same eyeball-confirmation trust tier the
-- scan-time InstagramCandidatePicker already establishes for anonymous
-- visitors, now offered to a signed-in owner for their claimed workspace.
--
-- Nullable, no FK, no uniqueness constraint: a workspace with no confirmed
-- handle yet is the normal, common state, and two workspaces sharing a
-- handle (e.g. a re-claimed duplicate) is not an error this column should
-- enforce against.

begin;

alter table public.workspaces add column if not exists instagram_handle text;

commit;
