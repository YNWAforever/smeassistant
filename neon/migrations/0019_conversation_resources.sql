-- Willy-approved Stage 2: additive resources only. No flags are enabled by this migration.
-- One append-only extract table attached to the existing private asset library.
CREATE TABLE public.conversation_document_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 -- Snapshot ID deliberately survives a deleted location; readers require that original scope still exists.
 location_id uuid,
 document_id uuid NOT NULL,
 asset_id uuid NOT NULL UNIQUE REFERENCES public.assets(id),
 version integer NOT NULL CHECK(version > 0),
 title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 140),
 extracted_text text NOT NULL CHECK(char_length(extracted_text) BETWEEN 1 AND 20000),
 truncated boolean NOT NULL,
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 uploaded_by uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(document_id,version)
);
CREATE INDEX conversation_document_versions_scope_idx ON public.conversation_document_versions(workspace_id,location_id,document_id,version DESC);

CREATE FUNCTION public.guard_conversation_document_version_insert() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE previous public.conversation_document_versions%rowtype; source public.assets%rowtype;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('conversation-document:' || NEW.document_id::text,0));
 SELECT * INTO source FROM public.assets WHERE id=NEW.asset_id FOR SHARE;
 IF NOT FOUND OR source.workspace_id IS DISTINCT FROM NEW.workspace_id
  OR source.location_id IS DISTINCT FROM NEW.location_id OR source.kind<>'document'
  OR source.filename IS DISTINCT FROM NEW.title OR source.uploaded_by IS DISTINCT FROM NEW.uploaded_by
  OR source.storage_path IS DISTINCT FROM (NEW.workspace_id::text || '/' || NEW.asset_id::text || '/__conversation_document__/' || NEW.title)
 THEN RAISE EXCEPTION 'document_asset_scope_invalid'; END IF;
 IF NEW.location_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.locations WHERE id=NEW.location_id AND workspace_id=NEW.workspace_id)
 THEN RAISE EXCEPTION 'invalid_location'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=NEW.workspace_id AND user_id=NEW.uploaded_by AND role='owner' AND accepted_at IS NOT NULL)
 THEN RAISE EXCEPTION 'document_owner_required'; END IF;
 SELECT * INTO previous FROM public.conversation_document_versions WHERE document_id=NEW.document_id ORDER BY version DESC LIMIT 1;
 IF FOUND THEN
  IF previous.workspace_id IS DISTINCT FROM NEW.workspace_id OR previous.location_id IS DISTINCT FROM NEW.location_id
   OR NEW.version <> previous.version+1 THEN RAISE EXCEPTION 'document_version_scope_invalid'; END IF;
 ELSIF NEW.version<>1 THEN RAISE EXCEPTION 'document_version_scope_invalid'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION public.guard_conversation_document_version_immutable() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.workspaces WHERE id=OLD.workspace_id) THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND OLD.uploaded_by IS NOT NULL AND NEW.uploaded_by IS NULL
  AND NOT EXISTS(SELECT 1 FROM public.app_users WHERE id=OLD.uploaded_by)
  AND (to_jsonb(NEW)-'uploaded_by')=(to_jsonb(OLD)-'uploaded_by') THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'document_version_immutable';
END $$;
-- Rights/alt text remain editable in the existing asset library. Cited provenance does not.
CREATE FUNCTION public.guard_conversation_document_asset_provenance() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.conversation_document_versions WHERE asset_id=OLD.id)
  AND (
   ROW(NEW.id,NEW.workspace_id,NEW.kind,NEW.storage_path,NEW.filename,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.workspace_id,OLD.kind,OLD.storage_path,OLD.filename,OLD.created_at)
   OR (NEW.location_id IS DISTINCT FROM OLD.location_id AND NOT (NEW.location_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.locations WHERE id=OLD.location_id)))
   OR (NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by AND NOT (NEW.uploaded_by IS NULL AND NOT EXISTS(SELECT 1 FROM public.app_users WHERE id=OLD.uploaded_by)))
  )
 THEN RAISE EXCEPTION 'document_asset_immutable'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_conversation_document_version_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_conversation_document_version_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_conversation_document_asset_provenance() FROM PUBLIC;
CREATE TRIGGER conversation_document_version_insert BEFORE INSERT ON public.conversation_document_versions FOR EACH ROW EXECUTE FUNCTION public.guard_conversation_document_version_insert();
CREATE TRIGGER conversation_document_version_immutable BEFORE UPDATE OR DELETE ON public.conversation_document_versions FOR EACH ROW EXECUTE FUNCTION public.guard_conversation_document_version_immutable();
CREATE TRIGGER conversation_document_asset_provenance BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.guard_conversation_document_asset_provenance();
ALTER TABLE public.conversation_document_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY server_read_conversation_document_versions ON public.conversation_document_versions FOR SELECT TO sme_app_runtime USING(true);
CREATE POLICY server_append_conversation_document_versions ON public.conversation_document_versions FOR INSERT TO sme_app_runtime WITH CHECK(true);
REVOKE ALL ON public.conversation_document_versions FROM PUBLIC;
REVOKE ALL ON public.conversation_document_versions FROM sme_app_runtime;
GRANT SELECT,INSERT ON public.conversation_document_versions TO sme_app_runtime;

-- A separate read-only credential; the existing GBP connection is unchanged.
ALTER TABLE public.oauth_connections DROP CONSTRAINT oauth_connections_provider_check;
ALTER TABLE public.oauth_connections ADD CONSTRAINT oauth_connections_provider_check
 CHECK(provider = ANY(ARRAY['instagram'::text,'google_gbp'::text,'ga4'::text,'google_gsc'::text]));
-- Draft for the primary agent's additive migration. No hosted settings/flags are changed.
-- Integer micro-USD (1 USD = 1,000,000 units); unknown reported cost stays NULL.
CREATE TABLE public.conversation_research_accounts (
 provider text NOT NULL CHECK(provider IN ('firecrawl','dataforseo')),
 account_key text NOT NULL CHECK(account_key ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$'),
 blocked_at timestamptz,
 block_reason text CHECK(block_reason IS NULL OR block_reason='pricing_ceiling_exceeded'),
 PRIMARY KEY(provider,account_key),
 CHECK((blocked_at IS NULL)=(block_reason IS NULL))
);
CREATE TABLE public.conversation_research_ledger (
 id uuid PRIMARY KEY,
 -- Scope snapshots deliberately survive workspace/location deletion: deleting a workspace
 -- must never refund shared-account spend. Inserts verify the then-current scope below.
 workspace_id uuid NOT NULL,
 location_id uuid,
 provider text NOT NULL,
 account_key text NOT NULL,
 month date NOT NULL CHECK(EXTRACT(DAY FROM month)=1),
 reserved_microusd bigint NOT NULL CHECK(reserved_microusd>0),
 charged_microusd bigint NOT NULL CHECK(charged_microusd>=reserved_microusd),
 reported_microusd bigint CHECK(reported_microusd>=0 AND reported_microusd<=charged_microusd),
 outcome text NOT NULL DEFAULT 'reserved' CHECK(outcome IN ('reserved','ready','partial','empty','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 FOREIGN KEY(provider,account_key) REFERENCES public.conversation_research_accounts(provider,account_key),
 CHECK((outcome='reserved')=(completed_at IS NULL))
);
CREATE INDEX conversation_research_workspace_month_idx ON public.conversation_research_ledger(workspace_id,month);
CREATE INDEX conversation_research_account_month_idx ON public.conversation_research_ledger(provider,account_key,month);
-- One unsettled call per provider account. An unrecorded outcome or failed settlement
-- requires reconciliation; it cannot silently become another paid request.
CREATE UNIQUE INDEX conversation_research_account_pending_idx ON public.conversation_research_ledger(provider,account_key) WHERE outcome='reserved';

CREATE FUNCTION public.guard_conversation_research_ledger() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.outcome<>'reserved' OR NEW.charged_microusd<>NEW.reserved_microusd
   OR NEW.reported_microusd IS NOT NULL OR NEW.completed_at IS NOT NULL
   OR NOT EXISTS(SELECT 1 FROM public.workspaces WHERE id=NEW.workspace_id)
   OR (NEW.location_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.locations WHERE id=NEW.location_id AND workspace_id=NEW.workspace_id))
  THEN RAISE EXCEPTION 'research_reservation_invalid'; END IF;
 ELSIF TG_OP='UPDATE' THEN
  IF ROW(NEW.id,NEW.workspace_id,NEW.location_id,NEW.provider,NEW.account_key,NEW.month,NEW.reserved_microusd,NEW.created_at)
   IS DISTINCT FROM ROW(OLD.id,OLD.workspace_id,OLD.location_id,OLD.provider,OLD.account_key,OLD.month,OLD.reserved_microusd,OLD.created_at)
   OR NEW.charged_microusd<OLD.charged_microusd
   OR (OLD.reported_microusd IS NOT NULL AND (NEW.reported_microusd IS NULL OR NEW.reported_microusd<OLD.reported_microusd))
   OR (OLD.outcome<>'reserved' AND NEW.outcome='reserved')
  THEN RAISE EXCEPTION 'research_ledger_immutable'; END IF;
  IF NEW.charged_microusd>NEW.reserved_microusd THEN
   UPDATE public.conversation_research_accounts SET blocked_at=COALESCE(blocked_at,now()),block_reason='pricing_ceiling_exceeded'
    WHERE provider=NEW.provider AND account_key=NEW.account_key;
  END IF;
 ELSE RAISE EXCEPTION 'research_ledger_immutable'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION public.guard_conversation_research_account() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.provider IS DISTINCT FROM OLD.provider OR NEW.account_key IS DISTINCT FROM OLD.account_key
  OR (OLD.blocked_at IS NOT NULL AND (NEW.blocked_at IS DISTINCT FROM OLD.blocked_at OR NEW.block_reason IS DISTINCT FROM OLD.block_reason))
 THEN RAISE EXCEPTION 'research_account_immutable'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_conversation_research_ledger() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_conversation_research_account() FROM PUBLIC;
CREATE TRIGGER conversation_research_ledger_guard BEFORE INSERT OR UPDATE OR DELETE ON public.conversation_research_ledger FOR EACH ROW EXECUTE FUNCTION public.guard_conversation_research_ledger();
CREATE TRIGGER conversation_research_account_guard BEFORE UPDATE ON public.conversation_research_accounts FOR EACH ROW EXECUTE FUNCTION public.guard_conversation_research_account();
ALTER TABLE public.conversation_research_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_research_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY server_read_conversation_research_accounts ON public.conversation_research_accounts FOR SELECT TO sme_app_runtime USING(true);
CREATE POLICY server_append_conversation_research_accounts ON public.conversation_research_accounts FOR INSERT TO sme_app_runtime WITH CHECK(true);
CREATE POLICY server_update_conversation_research_accounts ON public.conversation_research_accounts FOR UPDATE TO sme_app_runtime USING(true) WITH CHECK(true);
CREATE POLICY server_read_conversation_research_ledger ON public.conversation_research_ledger FOR SELECT TO sme_app_runtime USING(true);
CREATE POLICY server_append_conversation_research_ledger ON public.conversation_research_ledger FOR INSERT TO sme_app_runtime WITH CHECK(true);
CREATE POLICY server_update_conversation_research_ledger ON public.conversation_research_ledger FOR UPDATE TO sme_app_runtime USING(true) WITH CHECK(true);
REVOKE ALL ON public.conversation_research_accounts,public.conversation_research_ledger FROM PUBLIC;
REVOKE ALL ON public.conversation_research_accounts,public.conversation_research_ledger FROM sme_app_runtime;
GRANT SELECT,INSERT,UPDATE ON public.conversation_research_accounts,public.conversation_research_ledger TO sme_app_runtime;
