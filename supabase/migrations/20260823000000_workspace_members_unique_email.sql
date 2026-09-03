-- workspace_members_pending_email_idx (20260822000000_workspace_members.sql) only
-- prevented a second PENDING row for the same (workspace, email) -- it never
-- prevented a new pending row from colliding with an email that ALREADY has an
-- ACCEPTED row on the same workspace. That gap let POST /api/owner/workspaces/
-- [workspaceId]/members create a poisoned second row for an already-member
-- email (e.g. a self-invite, or re-inviting an already-bound teammate).
-- bindPendingMembership's single unbounded UPDATE ... WHERE email=? AND
-- user_id IS NULL then collides with workspace_members_user_workspace_idx on
-- that person's next sign-in, aborting the ENTIRE statement -- silently
-- blocking every other pending invite that email holds, on every workspace,
-- forever, with the failure swallowed by bindWorkspaceToUser's fail-closed
-- posture. A full (non-partial) unique index closes this at the only layer
-- that can guarantee it without a check-then-insert race: the only legitimate
-- way to need a second row for the same (workspace, email) pair is after the
-- first was actually DELETEd (member removed), which frees the slot for real.

begin;

drop index if exists public.workspace_members_pending_email_idx;

create unique index if not exists workspace_members_email_idx_unique
  on public.workspace_members (workspace_id, lower(email));

commit;
