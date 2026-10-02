-- P4.2 work packs (docs/superpowers/specs/2026-10-02-work-packs-design.md, 1.1, 1.2).
--
-- A work pack groups the actions a workspace starts together (today only the
-- "visibility starter": review-response, visibility-content, website-basics).
-- It is a grouping, not a ledger: no approval, delivery, run or output column
-- exists here. Each item's status is always derived from its action, the latest
-- run and the latest version, so there is no second source of truth.
--
-- At most one OPEN pack per (workspace, location, kind). The unique index
-- below is what makes "Start pack" idempotent under concurrency; a null
-- location_id is coalesced to the all-zero uuid so a workspace-wide pack is
-- unique too (a plain unique index would treat nulls as distinct).
--
-- work_packs cascade from workspaces and locations: a pack is about one
-- workspace's location and is meaningless without them. work_pack_items cascade
-- from their pack, but action_id is NO ACTION on purpose (like actions.offer_id
-- in 0011): deleting an action a pack still points to fails (23503), while
-- deleting a workspace still removes packs, items and actions. The action FK is
-- DEFERRABLE INITIALLY DEFERRED because a workspace delete cascades to actions
-- before it reaches the pack items (actions is the older table, so its cascade
-- trigger fires first); an immediate NO ACTION check would fail that cascade
-- while the items still exist. Deferred, the check runs at commit, by which
-- point the cascade has removed the items too.
CREATE TABLE IF NOT EXISTS public.work_packs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  location_id  uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  kind         text NOT NULL,
  created_by   uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  closed_at    timestamptz,
  CONSTRAINT work_packs_kind_check CHECK (kind IN ('visibility_starter'))
);

CREATE UNIQUE INDEX IF NOT EXISTS work_packs_open_idx
  ON public.work_packs (workspace_id, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid), kind)
  WHERE closed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.work_pack_items (
  pack_id      uuid NOT NULL REFERENCES public.work_packs(id) ON DELETE CASCADE,
  action_id    uuid NOT NULL CONSTRAINT work_pack_items_action_id_fkey REFERENCES public.actions(id) DEFERRABLE INITIALLY DEFERRED,
  template_key text NOT NULL,
  position     smallint NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_pack_items_pkey PRIMARY KEY (pack_id, template_key),
  CONSTRAINT work_pack_items_template_check CHECK (template_key IN ('review-response', 'visibility-content', 'website-basics')),
  CONSTRAINT work_pack_items_position_check CHECK (position BETWEEN 1 AND 3)
);

CREATE INDEX IF NOT EXISTS work_pack_items_action_idx ON public.work_pack_items (action_id);

ALTER TABLE public.work_packs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.work_packs FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.work_packs TO sme_app_runtime;
DROP POLICY IF EXISTS server_application ON public.work_packs;
CREATE POLICY server_application ON public.work_packs FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);

ALTER TABLE public.work_pack_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.work_pack_items FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.work_pack_items TO sme_app_runtime;
DROP POLICY IF EXISTS server_application ON public.work_pack_items;
CREATE POLICY server_application ON public.work_pack_items FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
