-- Effective final business DDL from the 33 source migrations.
-- Reference: test/integration/fixtures/legacy-final-catalog.json and provenance manifest.
-- Identity references intentionally point to app_users; no legacy backfills or seeds.

CREATE TABLE public."action_measurements" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "workspace_id" uuid NOT NULL,
 "action_id" uuid NOT NULL,
 "before_snapshot_id" uuid,
 "after_snapshot_id" uuid,
 "metric_key" text NOT NULL,
 "before_value" numeric,
 "after_value" numeric,
 "delta" numeric,
 "fact_type" text NOT NULL,
 "window_days" integer,
 "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."action_runs" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "workspace_id" uuid NOT NULL,
 "action_id" uuid NOT NULL,
 "agent_key" text NOT NULL,
 "state" text NOT NULL DEFAULT 'queued'::text,
 "input" jsonb,
 "output" jsonb,
 "model" text,
 "prompt_version" text,
 "error" text,
 "input_tokens" integer,
 "output_tokens" integer,
 "cost_usd" numeric,
 "requested_by" uuid,
 "created_at" timestamp with time zone NOT NULL DEFAULT now(),
 "started_at" timestamp with time zone,
 "finished_at" timestamp with time zone
);

CREATE TABLE public."actions" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "workspace_id" uuid NOT NULL,
 "location_id" uuid,
 "template_key" text NOT NULL,
 "source" text NOT NULL DEFAULT 'finding'::text,
 "source_finding_keys" text[] NOT NULL DEFAULT '{}'::text[],
 "source_snapshot_id" uuid,
 "title" jsonb NOT NULL,
 "summary" jsonb NOT NULL,
 "evidence" jsonb NOT NULL,
 "priority" text NOT NULL,
 "priority_score" numeric NOT NULL,
 "priority_factors" jsonb NOT NULL,
 "effort_minutes" integer NOT NULL,
 "required_inputs" jsonb NOT NULL DEFAULT '[]'::jsonb,
 "provided_inputs" jsonb NOT NULL DEFAULT '{}'::jsonb,
 "assignee_user_id" uuid,
 "due_at" timestamp with time zone,
 "action_state" text NOT NULL DEFAULT 'recommended'::text,
 "measurement_state" text NOT NULL DEFAULT 'not_eligible'::text,
 "capability" text NOT NULL,
 "dedupe_key" text NOT NULL,
 "created_at" timestamp with time zone NOT NULL DEFAULT now(),
 "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
 "completed_at" timestamp with time zone
);

CREATE TABLE public."aeo_surface_snapshots" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "job_id" uuid NOT NULL,
 "place_id" text NOT NULL,
 "surface" text NOT NULL,
 "query_text" text NOT NULL,
 "locale" text NOT NULL,
 "market" text NOT NULL,
 "cited" boolean NOT NULL,
 "rank" integer,
 "competitors" jsonb NOT NULL DEFAULT '[]'::jsonb,
 "excerpt" text,
 "captured_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."agent_runs" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "job_id" uuid NOT NULL,
 "finding_key" text NOT NULL,
 "agent_key" text NOT NULL,
 "status" text NOT NULL DEFAULT 'draft'::text,
 "output" jsonb NOT NULL,
 "input_tokens" integer,
 "output_tokens" integer,
 "cost_usd" numeric,
 "reviewed_by" uuid,
 "reviewed_at" timestamp with time zone,
 "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."assets" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "workspace_id" uuid NOT NULL,
 "location_id" uuid,
 "kind" text NOT NULL,
 "storage_path" text NOT NULL,
 "filename" text NOT NULL,
 "alt_text" text,
 "rights_status" text NOT NULL DEFAULT 'needs_review'::text,
 "rights_confirmed_at" timestamp with time zone,
 "uploaded_by" uuid,
 "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."audit_events" (
 "id" bigserial NOT NULL,
 "workspace_id" uuid,
 "location_id" uuid,
 "actor_type" text NOT NULL,
 "actor_id" uuid,
 "event" text NOT NULL,
 "entity_type" text,
 "entity_id" uuid,
 "payload" jsonb,
 "created_at" timestamp with time zone NOT NULL DEFAULT now(),
 "idempotency_key" text
);

CREATE TABLE public."audit_findings" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "job_id" uuid,
 "workspace_id" uuid,
 "finding_key" text NOT NULL,
 "module" text NOT NULL,
 "severity" text NOT NULL,
 "score_impact" numeric,
 "owner_message_zh" text,
 "evidence" jsonb,
 "v02_agent_hint" text,
 "created_at" timestamp with time zone DEFAULT now(),
 "owner_message_en" text,
 "owner_message_tw" text,
 "owner_action_zh" text,
 "owner_action_en" text
);

CREATE TABLE public."audit_jobs" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "workspace_id" uuid,
 "business_name" text NOT NULL,
 "ig_handle" text,
 "website_url" text,
 "industry" text,
 "district" text,
 "user_role" text,
 "status" text NOT NULL DEFAULT 'queued'::text,
 "raw_payload" jsonb,
 "overall_score" numeric,
 "module_scores" jsonb,
 "share_slug" text,
 "unlocked" boolean DEFAULT false,
 "created_at" timestamp with time zone DEFAULT now(),
 "completed_at" timestamp with time zone,
 "raw_data" jsonb,
 "summary_en" text,
 "summary_zh" text,
 "summary_tw" text,
 "region" text NOT NULL DEFAULT 'hk'::text,
 "processing_stage" text,
 "module_results" jsonb,
 "score_coverage" numeric,
 "scoring_version" text,
 "input_snapshot" jsonb,
 "failure_category" text,
 "failure_correlation_id" uuid,
 "attempt_count" integer NOT NULL DEFAULT 0,
 "last_attempt_at" timestamp with time zone,
 "business_objective" text,
 "place_id" text,
 "place_match_confidence" text,
 "parent_job_id" uuid,
 "location_id" uuid
);

CREATE TABLE public."brand_profiles" (
 "workspace_id" uuid NOT NULL,
 "voice" text NOT NULL DEFAULT 'warm'::text,
 "approved_claims" text[] NOT NULL DEFAULT '{}'::text[],
 "prohibited_terms" text[] NOT NULL DEFAULT '{}'::text[],
 "languages" text[] NOT NULL DEFAULT '{zh-HK}'::text[],
 "facts" jsonb NOT NULL DEFAULT '{}'::jsonb,
 "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."consent_records" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "job_id" uuid NOT NULL,
 "lead_id" uuid,
 "consent_type" text NOT NULL,
 "granted" boolean NOT NULL,
 "policy_version" text NOT NULL,
 "locale" text NOT NULL,
 "recorded_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."deliveries" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "workspace_id" uuid NOT NULL,
 "version_id" uuid NOT NULL,
 "mode" text NOT NULL,
 "channel" text,
 "state" text NOT NULL,
 "counted" boolean NOT NULL DEFAULT false,
 "idempotency_key" text NOT NULL,
 "payload" jsonb,
 "created_by" uuid,
 "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."erasure_events" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "erased_job_id" uuid NOT NULL,
 "staff_user_id" uuid NOT NULL,
 "staff_email_normalized" text NOT NULL,
 "reason" text NOT NULL,
 "removed_counts" jsonb NOT NULL,
 "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."leads" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "job_id" uuid,
 "workspace_id" uuid,
 "whatsapp" text,
 "email" text,
 "consent_bd_contact" boolean,
 "lead_score" integer,
 "routed_to" text,
 "routed_at" timestamp with time zone,
 "created_at" timestamp with time zone DEFAULT now(),
 "preferred_contact_channel" text,
 "contact_identifier" text,
 "business_objective" text
);

CREATE TABLE public."locations" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "workspace_id" uuid NOT NULL,
 "slug" text NOT NULL,
 "name" text NOT NULL,
 "address" text,
 "district" text,
 "place_id" text,
 "ig_handle" text,
 "website_url" text,
 "is_primary" boolean NOT NULL DEFAULT false,
 "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."notification_events" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "workspace_id" uuid NOT NULL,
 "job_id" uuid,
 "sections_included" text[] NOT NULL,
 "resend_message_id" text,
 "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."oauth_connections" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "workspace_id" uuid NOT NULL,
 "provider" text NOT NULL,
 "account_ref" text,
 "access_token_encrypted" text NOT NULL,
 "refresh_token_encrypted" text,
 "scopes" text[] NOT NULL DEFAULT '{}'::text[],
 "expires_at" timestamp with time zone,
 "status" text NOT NULL DEFAULT 'active'::text,
 "connected_at" timestamp with time zone NOT NULL DEFAULT now(),
 "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."output_versions" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "workspace_id" uuid NOT NULL,
 "action_id" uuid NOT NULL,
 "version_no" integer NOT NULL,
 "body" text NOT NULL,
 "alt_text" text,
 "meta" jsonb NOT NULL DEFAULT '{}'::jsonb,
 "author_type" text NOT NULL,
 "author_user_id" uuid,
 "action_run_id" uuid,
 "approval_state" text NOT NULL DEFAULT 'draft'::text,
 "approved_by" uuid,
 "approved_at" timestamp with time zone,
 "reviewer_comment" text,
 "delivery_state" text NOT NULL DEFAULT 'not_requested'::text,
 "first_exported_at" timestamp with time zone,
 "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."rate_limit_buckets" (
 "bucket_key" text NOT NULL,
 "window_started_at" timestamp with time zone NOT NULL,
 "request_count" integer NOT NULL DEFAULT 0,
 "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
 "expires_at" timestamp with time zone NOT NULL
);

CREATE TABLE public."report_access_grants" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "job_id" uuid NOT NULL,
 "lead_id" uuid,
 "token_hash" text NOT NULL,
 "idempotency_key" text NOT NULL,
 "purpose" text NOT NULL,
 "email_normalized" text,
 "expires_at" timestamp with time zone NOT NULL,
 "redeemed_at" timestamp with time zone,
 "revoked_at" timestamp with time zone,
 "last_used_at" timestamp with time zone,
 "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."report_evidence" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "job_id" uuid NOT NULL,
 "provider" text NOT NULL,
 "evidence_type" text NOT NULL,
 "source_id" text NOT NULL,
 "source_url" text,
 "captured_at" timestamp with time zone NOT NULL,
 "published_at" timestamp with time zone,
 "text_content" text,
 "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
 "storage_bucket" text,
 "storage_path" text,
 "content_sha256" text,
 "mime_type" text,
 "byte_size" integer,
 "width" integer,
 "height" integer,
 "collection_status" text NOT NULL,
 "limitation_code" text,
 "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."scan_diffs" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "base_job_id" uuid NOT NULL,
 "head_job_id" uuid NOT NULL,
 "comparable" boolean NOT NULL,
 "incomparable_reason" text,
 "composite_withheld_reason" text,
 "intersection_modules" text[] NOT NULL DEFAULT '{}'::text[],
 "composite_base" numeric,
 "composite_head" numeric,
 "composite_delta" numeric,
 "resolved_findings" text[] NOT NULL DEFAULT '{}'::text[],
 "regressed_findings" text[] NOT NULL DEFAULT '{}'::text[],
 "decayed_findings" text[] NOT NULL DEFAULT '{}'::text[],
 "lost_coverage" text[] NOT NULL DEFAULT '{}'::text[],
 "gained_coverage" text[] NOT NULL DEFAULT '{}'::text[],
 "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."scan_events" (
 "id" bigserial NOT NULL,
 "job_id" uuid,
 "event_name" text,
 "payload" jsonb,
 "created_at" timestamp with time zone DEFAULT now(),
 "anonymous_session_id" text,
 "properties" jsonb,
 "dedupe_key" text
);

CREATE TABLE public."scan_schedules" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "place_id" text NOT NULL,
 "input_snapshot" jsonb NOT NULL,
 "cadence" text NOT NULL DEFAULT 'monthly'::text,
 "anniversary_day" smallint NOT NULL,
 "last_job_id" uuid,
 "next_run_at" timestamp with time zone NOT NULL,
 "created_by" uuid NOT NULL,
 "created_at" timestamp with time zone NOT NULL DEFAULT now(),
 "workspace_id" uuid
);

CREATE TABLE public."scan_snapshots" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "job_id" uuid NOT NULL,
 "workspace_id" uuid,
 "location_id" uuid,
 "market" text NOT NULL,
 "observed_at" timestamp with time zone NOT NULL,
 "scoring_version" text,
 "overall_score" numeric,
 "coverage" numeric NOT NULL,
 "module_states" jsonb NOT NULL,
 "metrics" jsonb NOT NULL,
 "website_checks" jsonb,
 "comparable_to" uuid,
 "diff_id" uuid,
 "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."staff_report_events" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "staff_user_id" uuid NOT NULL,
 "staff_email_normalized" text NOT NULL,
 "job_id" uuid,
 "action" text NOT NULL,
 "metadata" jsonb,
 "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."workspace_access_requests" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "job_id" uuid NOT NULL,
 "user_id" uuid NOT NULL,
 "requested_at" timestamp with time zone NOT NULL DEFAULT now(),
 "resolved_at" timestamp with time zone,
 "resolved_by_staff_user_id" uuid
);

CREATE TABLE public."workspace_claim_events" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "job_id" uuid,
 "erased_job_id" text,
 "workspace_id" uuid,
 "erased_workspace_id" text,
 "matched_location_id" text NOT NULL,
 "claimed_by_user_id" uuid NOT NULL,
 "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."workspace_members" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "workspace_id" uuid NOT NULL,
 "user_id" uuid,
 "email" text NOT NULL,
 "role" text NOT NULL,
 "invited_by" uuid,
 "invited_at" timestamp with time zone NOT NULL DEFAULT now(),
 "accepted_at" timestamp with time zone,
 "created_at" timestamp with time zone NOT NULL DEFAULT now(),
 "location_scope" uuid[]
);

CREATE TABLE public."workspace_notifications" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "workspace_id" uuid NOT NULL,
 "user_id" uuid,
 "kind" text NOT NULL,
 "title" jsonb NOT NULL,
 "body" jsonb,
 "href" text,
 "read_at" timestamp with time zone,
 "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."workspace_scan_completions" (
 "job_id" uuid NOT NULL,
 "workspace_id" uuid NOT NULL,
 "state" text NOT NULL,
 "attempts" integer NOT NULL DEFAULT 0,
 "lease_token" uuid,
 "lease_until" timestamp with time zone,
 "next_attempt_at" timestamp with time zone NOT NULL DEFAULT now(),
 "last_error" text,
 "completed_at" timestamp with time zone,
 "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."workspace_tier_events" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "workspace_id" uuid NOT NULL,
 "tier" text NOT NULL,
 "source" text NOT NULL,
 "staff_user_id" uuid,
 "stripe_event_id" text,
 "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."workspace_usage" (
 "workspace_id" uuid NOT NULL,
 "period" text NOT NULL,
 "approved_deliveries" integer NOT NULL DEFAULT 0,
 "allowance" integer
);

CREATE TABLE public."workspaces" (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "business_name" text,
 "industry" text,
 "district" text,
 "market" text,
 "tier" text NOT NULL DEFAULT 'lite'::text,
 "created_at" timestamp with time zone NOT NULL DEFAULT now(),
 "stripe_customer_id" text,
 "notify_rescan_complete" boolean NOT NULL DEFAULT true,
 "notify_regression_alert" boolean NOT NULL DEFAULT true,
 "notify_monthly_digest" boolean NOT NULL DEFAULT true,
 "instagram_handle" text,
 "slug" text,
 "timezone" text NOT NULL DEFAULT 'Asia/Hong_Kong'::text,
 "is_demo" boolean NOT NULL DEFAULT false
);
ALTER TABLE public."action_measurements" ADD CONSTRAINT "action_measurements_fact_type_check" CHECK ((fact_type = ANY (ARRAY['Observed'::text, 'Attributed'::text, 'Unknown'::text])));
ALTER TABLE public."action_measurements" ADD CONSTRAINT "action_measurements_pkey" PRIMARY KEY (id);
ALTER TABLE public."action_runs" ADD CONSTRAINT "action_runs_pkey" PRIMARY KEY (id);
ALTER TABLE public."action_runs" ADD CONSTRAINT "action_runs_state_check" CHECK ((state = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text, 'timed_out'::text])));
ALTER TABLE public."actions" ADD CONSTRAINT "actions_action_state_check" CHECK ((action_state = ANY (ARRAY['recommended'::text, 'needs_input'::text, 'ready'::text, 'in_progress'::text, 'completed'::text, 'dismissed'::text, 'cancelled'::text, 'expired'::text])));
ALTER TABLE public."actions" ADD CONSTRAINT "actions_capability_check" CHECK ((capability = ANY (ARRAY['Live'::text, 'Beta'::text, 'Demo'::text, 'Requires connection'::text, 'Planned'::text])));
ALTER TABLE public."actions" ADD CONSTRAINT "actions_measurement_state_check" CHECK ((measurement_state = ANY (ARRAY['not_eligible'::text, 'awaiting_comparable_scan'::text, 'measured'::text, 'insufficient_coverage'::text])));
ALTER TABLE public."actions" ADD CONSTRAINT "actions_pkey" PRIMARY KEY (id);
ALTER TABLE public."actions" ADD CONSTRAINT "actions_priority_check" CHECK ((priority = ANY (ARRAY['urgent'::text, 'high'::text, 'medium'::text, 'low'::text])));
ALTER TABLE public."actions" ADD CONSTRAINT "actions_source_check" CHECK ((source = ANY (ARRAY['finding'::text, 'owner_objective'::text, 'system'::text])));
ALTER TABLE public."aeo_surface_snapshots" ADD CONSTRAINT "aeo_surface_snapshots_job_id_surface_query_text_key" UNIQUE (job_id, surface, query_text);
ALTER TABLE public."aeo_surface_snapshots" ADD CONSTRAINT "aeo_surface_snapshots_pkey" PRIMARY KEY (id);
ALTER TABLE public."aeo_surface_snapshots" ADD CONSTRAINT "aeo_surface_snapshots_surface_check" CHECK ((surface = ANY (ARRAY['ai_overview'::text, 'ai_mode'::text, 'organic'::text])));
ALTER TABLE public."agent_runs" ADD CONSTRAINT "agent_runs_agent_key_check" CHECK ((agent_key = ANY (ARRAY['review_reply_agent'::text, 'gbp_post_agent'::text])));
ALTER TABLE public."agent_runs" ADD CONSTRAINT "agent_runs_pkey" PRIMARY KEY (id);
ALTER TABLE public."agent_runs" ADD CONSTRAINT "agent_runs_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE public."assets" ADD CONSTRAINT "assets_kind_check" CHECK ((kind = ANY (ARRAY['image'::text, 'document'::text, 'menu'::text])));
ALTER TABLE public."assets" ADD CONSTRAINT "assets_pkey" PRIMARY KEY (id);
ALTER TABLE public."assets" ADD CONSTRAINT "assets_rights_status_check" CHECK ((rights_status = ANY (ARRAY['approved'::text, 'needs_review'::text, 'rejected'::text])));
ALTER TABLE public."audit_events" ADD CONSTRAINT "audit_events_actor_type_check" CHECK ((actor_type = ANY (ARRAY['user'::text, 'agent'::text, 'system'::text, 'scanner'::text])));
ALTER TABLE public."audit_events" ADD CONSTRAINT "audit_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."audit_findings" ADD CONSTRAINT "audit_findings_pkey" PRIMARY KEY (id);
ALTER TABLE public."audit_jobs" ADD CONSTRAINT "audit_jobs_pkey" PRIMARY KEY (id);
ALTER TABLE public."audit_jobs" ADD CONSTRAINT "audit_jobs_share_slug_key" UNIQUE (share_slug);
ALTER TABLE public."audit_jobs" ADD CONSTRAINT "audit_jobs_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'collecting'::text, 'scoring'::text, 'persisting'::text, 'done'::text, 'partial'::text, 'failed'::text])));
ALTER TABLE public."brand_profiles" ADD CONSTRAINT "brand_profiles_pkey" PRIMARY KEY (workspace_id);
ALTER TABLE public."consent_records" ADD CONSTRAINT "consent_records_pkey" PRIMARY KEY (id);
ALTER TABLE public."deliveries" ADD CONSTRAINT "deliveries_idempotency_key_key" UNIQUE (idempotency_key);
ALTER TABLE public."deliveries" ADD CONSTRAINT "deliveries_mode_check" CHECK ((mode = ANY (ARRAY['export'::text, 'copy'::text, 'publish'::text])));
ALTER TABLE public."deliveries" ADD CONSTRAINT "deliveries_pkey" PRIMARY KEY (id);
ALTER TABLE public."deliveries" ADD CONSTRAINT "deliveries_state_check" CHECK ((state = ANY (ARRAY['export_ready'::text, 'exported'::text, 'scheduled'::text, 'publishing'::text, 'published'::text, 'failed'::text, 'cancelled'::text])));
ALTER TABLE public."erasure_events" ADD CONSTRAINT "erasure_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."leads" ADD CONSTRAINT "leads_pkey" PRIMARY KEY (id);
ALTER TABLE public."locations" ADD CONSTRAINT "locations_pkey" PRIMARY KEY (id);
ALTER TABLE public."locations" ADD CONSTRAINT "locations_workspace_id_slug_key" UNIQUE (workspace_id, slug);
ALTER TABLE public."notification_events" ADD CONSTRAINT "notification_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."oauth_connections" ADD CONSTRAINT "oauth_connections_pkey" PRIMARY KEY (id);
ALTER TABLE public."oauth_connections" ADD CONSTRAINT "oauth_connections_provider_check" CHECK ((provider = ANY (ARRAY['instagram'::text, 'google_gbp'::text, 'ga4'::text])));
ALTER TABLE public."oauth_connections" ADD CONSTRAINT "oauth_connections_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'expired'::text, 'revoked'::text, 'error'::text])));
ALTER TABLE public."output_versions" ADD CONSTRAINT "output_versions_action_id_version_no_key" UNIQUE (action_id, version_no);
ALTER TABLE public."output_versions" ADD CONSTRAINT "output_versions_approval_state_check" CHECK ((approval_state = ANY (ARRAY['draft'::text, 'changes_requested'::text, 'approved'::text, 'rejected'::text, 'superseded'::text])));
ALTER TABLE public."output_versions" ADD CONSTRAINT "output_versions_author_type_check" CHECK ((author_type = ANY (ARRAY['user'::text, 'agent'::text])));
ALTER TABLE public."output_versions" ADD CONSTRAINT "output_versions_delivery_state_check" CHECK ((delivery_state = ANY (ARRAY['not_requested'::text, 'export_ready'::text, 'exported'::text, 'scheduled'::text, 'publishing'::text, 'published'::text, 'failed'::text, 'cancelled'::text])));
ALTER TABLE public."output_versions" ADD CONSTRAINT "output_versions_pkey" PRIMARY KEY (id);
ALTER TABLE public."rate_limit_buckets" ADD CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY (bucket_key);
ALTER TABLE public."rate_limit_buckets" ADD CONSTRAINT "rate_limit_buckets_request_count_check" CHECK ((request_count >= 0));
ALTER TABLE public."report_access_grants" ADD CONSTRAINT "report_access_grants_idempotency_key_check" CHECK ((btrim(idempotency_key) <> ''::text));
ALTER TABLE public."report_access_grants" ADD CONSTRAINT "report_access_grants_pkey" PRIMARY KEY (id);
ALTER TABLE public."report_access_grants" ADD CONSTRAINT "report_access_grants_token_hash_sha256_check" CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text));
ALTER TABLE public."report_evidence" ADD CONSTRAINT "report_evidence_byte_size_check" CHECK (((byte_size IS NULL) OR ((byte_size >= 1) AND (byte_size <= 5242880))));
ALTER TABLE public."report_evidence" ADD CONSTRAINT "report_evidence_collection_status_check" CHECK ((collection_status = ANY (ARRAY['stored'::text, 'metadata_only'::text, 'failed'::text])));
ALTER TABLE public."report_evidence" ADD CONSTRAINT "report_evidence_content_sha256_check" CHECK (((content_sha256 IS NULL) OR (content_sha256 ~ '^[0-9a-f]{64}$'::text)));
ALTER TABLE public."report_evidence" ADD CONSTRAINT "report_evidence_evidence_type_check" CHECK ((evidence_type = ANY (ARRAY['profile'::text, 'post'::text, 'reel'::text, 'story'::text, 'highlight'::text, 'photo'::text, 'review'::text])));
ALTER TABLE public."report_evidence" ADD CONSTRAINT "report_evidence_height_check" CHECK (((height IS NULL) OR ((height >= 1) AND (height <= 4800))));
ALTER TABLE public."report_evidence" ADD CONSTRAINT "report_evidence_job_id_provider_evidence_type_source_id_key" UNIQUE (job_id, provider, evidence_type, source_id);
ALTER TABLE public."report_evidence" ADD CONSTRAINT "report_evidence_pkey" PRIMARY KEY (id);
ALTER TABLE public."report_evidence" ADD CONSTRAINT "report_evidence_provider_check" CHECK ((provider = ANY (ARRAY['instagram'::text, 'google_maps'::text])));
ALTER TABLE public."report_evidence" ADD CONSTRAINT "report_evidence_width_check" CHECK (((width IS NULL) OR ((width >= 1) AND (width <= 4800))));
ALTER TABLE public."scan_diffs" ADD CONSTRAINT "scan_diffs_base_job_id_head_job_id_key" UNIQUE (base_job_id, head_job_id);
ALTER TABLE public."scan_diffs" ADD CONSTRAINT "scan_diffs_pkey" PRIMARY KEY (id);
ALTER TABLE public."scan_events" ADD CONSTRAINT "scan_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."scan_schedules" ADD CONSTRAINT "scan_schedules_anniversary_day_check" CHECK (((anniversary_day >= 1) AND (anniversary_day <= 28)));
ALTER TABLE public."scan_schedules" ADD CONSTRAINT "scan_schedules_cadence_check" CHECK ((cadence = ANY (ARRAY['monthly'::text, 'paused'::text])));
ALTER TABLE public."scan_schedules" ADD CONSTRAINT "scan_schedules_pkey" PRIMARY KEY (id);
ALTER TABLE public."scan_schedules" ADD CONSTRAINT "scan_schedules_place_id_key" UNIQUE (place_id);
ALTER TABLE public."scan_snapshots" ADD CONSTRAINT "scan_snapshots_job_id_key" UNIQUE (job_id);
ALTER TABLE public."scan_snapshots" ADD CONSTRAINT "scan_snapshots_pkey" PRIMARY KEY (id);
ALTER TABLE public."staff_report_events" ADD CONSTRAINT "staff_report_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."workspace_access_requests" ADD CONSTRAINT "workspace_access_requests_pkey" PRIMARY KEY (id);
ALTER TABLE public."workspace_claim_events" ADD CONSTRAINT "workspace_claim_events_matched_location_id_check" CHECK ((matched_location_id ~~ 'locations/%'::text));
ALTER TABLE public."workspace_claim_events" ADD CONSTRAINT "workspace_claim_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."workspace_members" ADD CONSTRAINT "workspace_members_pkey" PRIMARY KEY (id);
ALTER TABLE public."workspace_members" ADD CONSTRAINT "workspace_members_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'manager'::text, 'viewer'::text])));
ALTER TABLE public."workspace_notifications" ADD CONSTRAINT "workspace_notifications_pkey" PRIMARY KEY (id);
ALTER TABLE public."workspace_scan_completions" ADD CONSTRAINT "workspace_scan_completions_pkey" PRIMARY KEY (job_id);
ALTER TABLE public."workspace_scan_completions" ADD CONSTRAINT "workspace_scan_completions_state_check" CHECK ((state = ANY (ARRAY['running'::text, 'retry'::text, 'completed'::text])));
ALTER TABLE public."workspace_tier_events" ADD CONSTRAINT "workspace_tier_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."workspace_tier_events" ADD CONSTRAINT "workspace_tier_events_source_check" CHECK ((source = ANY (ARRAY['stripe_webhook'::text, 'staff_grant'::text])));
ALTER TABLE public."workspace_tier_events" ADD CONSTRAINT "workspace_tier_events_tier_check" CHECK ((tier = ANY (ARRAY['lite'::text, 'paid'::text])));
ALTER TABLE public."workspace_usage" ADD CONSTRAINT "workspace_usage_pkey" PRIMARY KEY (workspace_id, period);
ALTER TABLE public."workspaces" ADD CONSTRAINT "workspaces_market_check" CHECK ((market = ANY (ARRAY['hk'::text, 'tw'::text])));
ALTER TABLE public."workspaces" ADD CONSTRAINT "workspaces_pkey" PRIMARY KEY (id);
ALTER TABLE public."workspaces" ADD CONSTRAINT "workspaces_tier_check" CHECK ((tier = ANY (ARRAY['lite'::text, 'paid'::text])));
ALTER TABLE public."action_measurements" ADD CONSTRAINT "action_measurements_action_id_fkey" FOREIGN KEY (action_id) REFERENCES actions(id) ON DELETE CASCADE;
ALTER TABLE public."action_measurements" ADD CONSTRAINT "action_measurements_after_snapshot_id_fkey" FOREIGN KEY (after_snapshot_id) REFERENCES scan_snapshots(id) ON DELETE SET NULL;
ALTER TABLE public."action_measurements" ADD CONSTRAINT "action_measurements_before_snapshot_id_fkey" FOREIGN KEY (before_snapshot_id) REFERENCES scan_snapshots(id) ON DELETE SET NULL;
ALTER TABLE public."action_measurements" ADD CONSTRAINT "action_measurements_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."action_runs" ADD CONSTRAINT "action_runs_action_id_fkey" FOREIGN KEY (action_id) REFERENCES actions(id) ON DELETE CASCADE;
ALTER TABLE public."action_runs" ADD CONSTRAINT "action_runs_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE public."action_runs" ADD CONSTRAINT "action_runs_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."actions" ADD CONSTRAINT "actions_assignee_user_id_fkey" FOREIGN KEY (assignee_user_id) REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE public."actions" ADD CONSTRAINT "actions_location_id_fkey" FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;
ALTER TABLE public."actions" ADD CONSTRAINT "actions_source_snapshot_id_fkey" FOREIGN KEY (source_snapshot_id) REFERENCES scan_snapshots(id) ON DELETE SET NULL;
ALTER TABLE public."actions" ADD CONSTRAINT "actions_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."aeo_surface_snapshots" ADD CONSTRAINT "aeo_surface_snapshots_job_id_fkey" FOREIGN KEY (job_id) REFERENCES audit_jobs(id) ON DELETE CASCADE;
ALTER TABLE public."agent_runs" ADD CONSTRAINT "agent_runs_job_id_fkey" FOREIGN KEY (job_id) REFERENCES audit_jobs(id) ON DELETE CASCADE;
ALTER TABLE public."agent_runs" ADD CONSTRAINT "agent_runs_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES app_users(id);
ALTER TABLE public."assets" ADD CONSTRAINT "assets_location_id_fkey" FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;
ALTER TABLE public."assets" ADD CONSTRAINT "assets_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE public."assets" ADD CONSTRAINT "assets_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."audit_events" ADD CONSTRAINT "audit_events_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."audit_findings" ADD CONSTRAINT "audit_findings_job_id_fkey" FOREIGN KEY (job_id) REFERENCES audit_jobs(id) ON DELETE CASCADE;
ALTER TABLE public."audit_jobs" ADD CONSTRAINT "audit_jobs_location_id_fkey" FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;
ALTER TABLE public."audit_jobs" ADD CONSTRAINT "audit_jobs_parent_job_id_fkey" FOREIGN KEY (parent_job_id) REFERENCES audit_jobs(id) ON DELETE CASCADE;
ALTER TABLE public."audit_jobs" ADD CONSTRAINT "audit_jobs_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE public."brand_profiles" ADD CONSTRAINT "brand_profiles_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."consent_records" ADD CONSTRAINT "consent_records_job_id_fkey" FOREIGN KEY (job_id) REFERENCES audit_jobs(id) ON DELETE CASCADE;
ALTER TABLE public."consent_records" ADD CONSTRAINT "consent_records_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE public."deliveries" ADD CONSTRAINT "deliveries_created_by_fkey" FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE public."deliveries" ADD CONSTRAINT "deliveries_version_id_fkey" FOREIGN KEY (version_id) REFERENCES output_versions(id) ON DELETE CASCADE;
ALTER TABLE public."deliveries" ADD CONSTRAINT "deliveries_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."leads" ADD CONSTRAINT "leads_job_id_fkey" FOREIGN KEY (job_id) REFERENCES audit_jobs(id) ON DELETE CASCADE;
ALTER TABLE public."locations" ADD CONSTRAINT "locations_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."notification_events" ADD CONSTRAINT "notification_events_job_id_fkey" FOREIGN KEY (job_id) REFERENCES audit_jobs(id) ON DELETE SET NULL;
ALTER TABLE public."notification_events" ADD CONSTRAINT "notification_events_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."oauth_connections" ADD CONSTRAINT "oauth_connections_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."output_versions" ADD CONSTRAINT "output_versions_action_id_fkey" FOREIGN KEY (action_id) REFERENCES actions(id) ON DELETE CASCADE;
ALTER TABLE public."output_versions" ADD CONSTRAINT "output_versions_action_run_id_fkey" FOREIGN KEY (action_run_id) REFERENCES action_runs(id) ON DELETE SET NULL;
ALTER TABLE public."output_versions" ADD CONSTRAINT "output_versions_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE public."output_versions" ADD CONSTRAINT "output_versions_author_user_id_fkey" FOREIGN KEY (author_user_id) REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE public."output_versions" ADD CONSTRAINT "output_versions_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."report_access_grants" ADD CONSTRAINT "report_access_grants_job_id_fkey" FOREIGN KEY (job_id) REFERENCES audit_jobs(id) ON DELETE CASCADE;
ALTER TABLE public."report_access_grants" ADD CONSTRAINT "report_access_grants_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE public."report_evidence" ADD CONSTRAINT "report_evidence_job_id_fkey" FOREIGN KEY (job_id) REFERENCES audit_jobs(id) ON DELETE CASCADE;
ALTER TABLE public."scan_diffs" ADD CONSTRAINT "scan_diffs_base_job_id_fkey" FOREIGN KEY (base_job_id) REFERENCES audit_jobs(id) ON DELETE CASCADE;
ALTER TABLE public."scan_diffs" ADD CONSTRAINT "scan_diffs_head_job_id_fkey" FOREIGN KEY (head_job_id) REFERENCES audit_jobs(id) ON DELETE CASCADE;
ALTER TABLE public."scan_events" ADD CONSTRAINT "scan_events_job_id_fkey" FOREIGN KEY (job_id) REFERENCES audit_jobs(id) ON DELETE CASCADE;
ALTER TABLE public."scan_schedules" ADD CONSTRAINT "scan_schedules_created_by_fkey" FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT;
ALTER TABLE public."scan_schedules" ADD CONSTRAINT "scan_schedules_last_job_id_fkey" FOREIGN KEY (last_job_id) REFERENCES audit_jobs(id) ON DELETE SET NULL;
ALTER TABLE public."scan_schedules" ADD CONSTRAINT "scan_schedules_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE public."scan_snapshots" ADD CONSTRAINT "scan_snapshots_comparable_to_fkey" FOREIGN KEY (comparable_to) REFERENCES scan_snapshots(id) ON DELETE SET NULL;
ALTER TABLE public."scan_snapshots" ADD CONSTRAINT "scan_snapshots_diff_id_fkey" FOREIGN KEY (diff_id) REFERENCES scan_diffs(id) ON DELETE SET NULL;
ALTER TABLE public."scan_snapshots" ADD CONSTRAINT "scan_snapshots_job_id_fkey" FOREIGN KEY (job_id) REFERENCES audit_jobs(id) ON DELETE CASCADE;
ALTER TABLE public."scan_snapshots" ADD CONSTRAINT "scan_snapshots_location_id_fkey" FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;
ALTER TABLE public."scan_snapshots" ADD CONSTRAINT "scan_snapshots_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."staff_report_events" ADD CONSTRAINT "staff_report_events_job_id_fkey" FOREIGN KEY (job_id) REFERENCES audit_jobs(id) ON DELETE SET NULL;
ALTER TABLE public."workspace_access_requests" ADD CONSTRAINT "workspace_access_requests_job_id_fkey" FOREIGN KEY (job_id) REFERENCES audit_jobs(id) ON DELETE CASCADE;
ALTER TABLE public."workspace_access_requests" ADD CONSTRAINT "workspace_access_requests_resolved_by_staff_user_id_fkey" FOREIGN KEY (resolved_by_staff_user_id) REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE public."workspace_access_requests" ADD CONSTRAINT "workspace_access_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE;
ALTER TABLE public."workspace_claim_events" ADD CONSTRAINT "workspace_claim_events_job_id_fkey" FOREIGN KEY (job_id) REFERENCES audit_jobs(id) ON DELETE SET NULL;
ALTER TABLE public."workspace_claim_events" ADD CONSTRAINT "workspace_claim_events_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE public."workspace_members" ADD CONSTRAINT "workspace_members_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE public."workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE;
ALTER TABLE public."workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."workspace_notifications" ADD CONSTRAINT "workspace_notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE;
ALTER TABLE public."workspace_notifications" ADD CONSTRAINT "workspace_notifications_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."workspace_scan_completions" ADD CONSTRAINT "workspace_scan_completions_job_id_fkey" FOREIGN KEY (job_id) REFERENCES audit_jobs(id) ON DELETE CASCADE;
ALTER TABLE public."workspace_scan_completions" ADD CONSTRAINT "workspace_scan_completions_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."workspace_tier_events" ADD CONSTRAINT "workspace_tier_events_staff_user_id_fkey" FOREIGN KEY (staff_user_id) REFERENCES app_users(id);
ALTER TABLE public."workspace_tier_events" ADD CONSTRAINT "workspace_tier_events_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."workspace_usage" ADD CONSTRAINT "workspace_usage_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX actions_open_dedupe_idx ON public.actions USING btree (dedupe_key) WHERE (action_state <> ALL (ARRAY['completed'::text, 'dismissed'::text, 'cancelled'::text, 'expired'::text]));
CREATE INDEX aeo_surface_snapshots_job_idx ON public.aeo_surface_snapshots USING btree (job_id);
CREATE INDEX aeo_surface_snapshots_place_surface_idx ON public.aeo_surface_snapshots USING btree (place_id, surface, captured_at DESC);
CREATE INDEX agent_runs_job_status_idx ON public.agent_runs USING btree (job_id, status);
CREATE UNIQUE INDEX audit_events_idempotency_key_idx ON public.audit_events USING btree (idempotency_key);
CREATE INDEX audit_events_workspace_idx ON public.audit_events USING btree (workspace_id, created_at DESC);
CREATE UNIQUE INDEX audit_findings_job_finding_key_unique_idx ON public.audit_findings USING btree (job_id, finding_key);
CREATE INDEX audit_findings_job_id_finding_key_idx ON public.audit_findings USING btree (job_id, finding_key);
CREATE INDEX audit_jobs_place_created_idx ON public.audit_jobs USING btree (place_id, created_at DESC);
CREATE INDEX audit_jobs_share_slug_idx ON public.audit_jobs USING btree (share_slug);
CREATE INDEX audit_jobs_stale_claim_idx ON public.audit_jobs USING btree (last_attempt_at) WHERE (status = ANY (ARRAY['collecting'::text, 'scoring'::text, 'persisting'::text]));
CREATE INDEX consent_records_job_id_idx ON public.consent_records USING btree (job_id);
CREATE INDEX erasure_events_created_at_idx ON public.erasure_events USING btree (created_at DESC);
CREATE UNIQUE INDEX notification_events_job_id_key ON public.notification_events USING btree (job_id) WHERE (job_id IS NOT NULL);
CREATE INDEX notification_events_workspace_idx ON public.notification_events USING btree (workspace_id, created_at DESC);
CREATE UNIQUE INDEX oauth_connections_active_provider_key ON public.oauth_connections USING btree (workspace_id, provider) WHERE (status = 'active'::text);
CREATE INDEX oauth_connections_workspace_idx ON public.oauth_connections USING btree (workspace_id);
CREATE INDEX rate_limit_buckets_expires_at_idx ON public.rate_limit_buckets USING btree (expires_at);
CREATE INDEX report_access_grants_job_id_idx ON public.report_access_grants USING btree (job_id);
CREATE UNIQUE INDEX report_access_grants_job_idempotency_key_unique_idx ON public.report_access_grants USING btree (job_id, idempotency_key);
CREATE UNIQUE INDEX report_access_grants_token_hash_unique_idx ON public.report_access_grants USING btree (token_hash);
CREATE INDEX report_evidence_job_captured_idx ON public.report_evidence USING btree (job_id, captured_at DESC);
CREATE INDEX scan_diffs_head_idx ON public.scan_diffs USING btree (head_job_id);
CREATE UNIQUE INDEX scan_events_dedupe_identity_unique_idx ON public.scan_events USING btree (job_id, anonymous_session_id, event_name, dedupe_key);
CREATE INDEX scan_events_job_id_created_at_idx ON public.scan_events USING btree (job_id, created_at DESC);
CREATE INDEX scan_events_job_id_event_name_idx ON public.scan_events USING btree (job_id, event_name);
CREATE INDEX scan_schedules_due_idx ON public.scan_schedules USING btree (next_run_at) WHERE (cadence = 'monthly'::text);
CREATE INDEX scan_schedules_workspace_idx ON public.scan_schedules USING btree (workspace_id);
CREATE INDEX staff_report_events_job_id_created_at_idx ON public.staff_report_events USING btree (job_id, created_at DESC);
CREATE UNIQUE INDEX workspace_access_requests_open_idx ON public.workspace_access_requests USING btree (job_id, user_id) WHERE (resolved_at IS NULL);
CREATE INDEX workspace_access_requests_pending_idx ON public.workspace_access_requests USING btree (requested_at DESC) WHERE (resolved_at IS NULL);
CREATE INDEX workspace_claim_events_claimed_by_idx ON public.workspace_claim_events USING btree (claimed_by_user_id);
CREATE INDEX workspace_claim_events_job_idx ON public.workspace_claim_events USING btree (job_id, created_at DESC);
CREATE INDEX workspace_claim_events_workspace_idx ON public.workspace_claim_events USING btree (workspace_id, created_at DESC);
CREATE INDEX workspace_members_email_idx ON public.workspace_members USING btree (lower(email));
CREATE UNIQUE INDEX workspace_members_email_idx_unique ON public.workspace_members USING btree (workspace_id, lower(email));
CREATE UNIQUE INDEX workspace_members_one_owner_idx ON public.workspace_members USING btree (workspace_id) WHERE (role = 'owner'::text);
CREATE UNIQUE INDEX workspace_members_user_workspace_idx ON public.workspace_members USING btree (workspace_id, user_id) WHERE (user_id IS NOT NULL);
CREATE UNIQUE INDEX workspace_tier_events_stripe_event_id_key ON public.workspace_tier_events USING btree (stripe_event_id) WHERE (stripe_event_id IS NOT NULL);
CREATE INDEX workspace_tier_events_workspace_idx ON public.workspace_tier_events USING btree (workspace_id, created_at DESC);
CREATE UNIQUE INDEX workspaces_slug_key ON public.workspaces USING btree (slug) WHERE (slug IS NOT NULL);
