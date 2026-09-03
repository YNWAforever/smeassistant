import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  // lib/analytics/ sits two levels below the repo root here (upstream: four, under apps/web).
  new URL("../../supabase/migrations/20260714_trust_foundation.sql", import.meta.url),
  "utf8",
);

describe("analytics migration contract", () => {
  it("stores only validated report unlock properties and exposes whether the event was created", () => {
    expect(migration).toContain("returns table (lead_id uuid, grant_id uuid, event_created boolean)");
    expect(migration).not.toMatch(/jsonb_build_object\s*\(\s*'lead_id'/i);
    expect(migration).not.toMatch(/properties[\s\S]{0,300}'grant_id'/i);
    expect(migration).toMatch(/'report_unlocked',\s*p_event_properties,\s*encode\s*\(\s*extensions\.digest/i);
    expect(migration).toContain("analytics_event_properties_invalid");
  });

  it("persists a hashed dedupe key behind an atomic unique identity", () => {
    expect(migration).toContain("add column if not exists dedupe_key text");
    expect(migration).toMatch(/create unique index if not exists scan_events_dedupe_identity_unique_idx[\s\S]*job_id, anonymous_session_id, event_name, dedupe_key/i);
    expect(migration).toMatch(/encode\s*\(\s*extensions\.digest\s*\(\s*p_job_id::text \|\| ':' \|\| p_idempotency_key/i);
  });
});
