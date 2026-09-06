-- Application identity only. Managed Auth remains outside application ownership.
-- Provision sme_app_runtime as a non-owner NOLOGIN group before applying migrations.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sme_app_runtime' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolcanlogin) THEN
  RAISE EXCEPTION 'restricted_runtime_role_required';
 END IF;
 IF pg_has_role(current_user, 'sme_app_runtime', 'MEMBER') AND NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
  RAISE EXCEPTION 'migration_owner_must_be_separate';
 END IF;
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE TABLE public.app_users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.auth_identities (
 provider text NOT NULL CHECK (provider = 'neon'),
 subject text NOT NULL,
 user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
 PRIMARY KEY (provider, subject)
);
