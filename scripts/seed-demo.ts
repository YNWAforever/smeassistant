/**
 * Seed the 錦汶館 demo workspace for local QA.
 *
 *   SEED_DEMO_ALLOW=true NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<port> SUPABASE_SERVICE_ROLE_KEY=<jwt> \
 *     corepack pnpm seed:demo
 *
 * Runs against the Docker Postgres + PostgREST that test/integration stands up
 * (or any other localhost Supabase-shaped stack). It refuses anything else:
 * the shared project must never carry an `is_demo` workspace (CLAUDE.md 7).
 *
 * What it writes, all idempotent on fixed ids:
 *   1. the rows supabase/seed/demo-workspace.sql declares (workspace, two
 *      locations, pending owner membership, brand profile, usage 5 / 12) --
 *      restated here because PostgREST cannot run a .sql file;
 *   2. two queued audit_jobs (share slugs demo-yik-yam, demo-tin-hau) that are
 *      then processed by the real scan engine with the kam-man-house fixture
 *      (SCAN_SOURCES=fixture semantics), so module_results / overall_score /
 *      score_coverage / audit_findings are exactly what a fixture scan writes;
 *   3. the scan_diffs row between them (the engine's own trend-diff step, with
 *      an explicit fallback if the bounded post-processing step was skipped);
 *   4. one scan_snapshots row per job (metrics = {} -- Phase 3's
 *      lib/workspace/snapshots.ts recomputes them);
 *   5. three actions and the two review-reply output versions from
 *      lib/demo-data.ts.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildTrendDiffDeps, persistScanDiff, processScan } from "@sme-scanner/scan-engine";
import { createFixtureCollector } from "../lib/scan/fixtures";
import { buildSnapshot } from "../lib/workspace/snapshots";

const WORKSPACE_ID = "d0000000-0000-4000-8000-000000000001";
const LOCATION_YIK_YAM = "d0000000-0000-4000-8000-000000000011";
const LOCATION_TIN_HAU = "d0000000-0000-4000-8000-000000000012";
const OWNER_MEMBER_ID = "d0000000-0000-4000-8000-000000000021";
const JOB_YIK_YAM = "d0000000-0000-4000-8000-000000000101";
const JOB_TIN_HAU = "d0000000-0000-4000-8000-000000000102";
const SNAPSHOT_YIK_YAM = "d0000000-0000-4000-8000-000000000201";
const SNAPSHOT_TIN_HAU = "d0000000-0000-4000-8000-000000000202";
const ACTION_REVIEW_RESPONSE = "d0000000-0000-4000-8000-000000000301";
const ACTION_SOCIAL_POST = "d0000000-0000-4000-8000-000000000302";
const ACTION_VISIBILITY_CONTENT = "d0000000-0000-4000-8000-000000000303";
const VERSION_1 = "d0000000-0000-4000-8000-000000000401";
const VERSION_2 = "d0000000-0000-4000-8000-000000000402";

const PLACE_ID = "ChIJfixture-kam-man-house";
const DAY_MS = 24 * 60 * 60 * 1000;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function guardEnvironment(): { url: string; key: string } {
  if (process.env.SEED_DEMO_ALLOW !== "true") {
    fail("seed:demo refused: set SEED_DEMO_ALLOW=true (local QA only; never against the shared project).");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail("seed:demo refused: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return fail(`seed:demo refused: NEXT_PUBLIC_SUPABASE_URL is not a URL (${url}).`);
  }
  if (host !== "localhost" && host !== "127.0.0.1") {
    fail(`seed:demo refused: ${host} is not localhost/127.0.0.1. The demo workspace is never seeded into a shared project.`);
  }
  return { url, key };
}

function unwrap<T>(step: string, result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${step}: ${result.error.message}`);
  return result.data;
}

/** Insert-if-missing on the primary key, the PostgREST spelling of `on conflict do nothing`. */
async function insertIfMissing(db: SupabaseClient, table: string, onConflict: string, rows: Record<string, unknown>[]) {
  unwrap(`insert ${table}`, await db.from(table).upsert(rows, { onConflict, ignoreDuplicates: true }));
}

// 1. The rows supabase/seed/demo-workspace.sql declares.
async function seedWorkspace(db: SupabaseClient) {
  await insertIfMissing(db, "workspaces", "id", [
    {
      id: WORKSPACE_ID,
      business_name: "錦汶館",
      industry: "fnb",
      district: "Tin Hau",
      market: "hk",
      tier: "paid",
      slug: "kam-man-house",
      timezone: "Asia/Hong_Kong",
      is_demo: true,
      instagram_handle: "kammanhouse.hk",
    },
  ]);
  await insertIfMissing(db, "locations", "id", [
    {
      id: LOCATION_YIK_YAM, workspace_id: WORKSPACE_ID, slug: "yik-yam-street", name: "Yik Yam Street",
      address: "8 Yik Yam Street, Happy Valley", district: "Happy Valley", place_id: PLACE_ID,
      ig_handle: "kammanhouse.hk", website_url: "https://kammanhouse.example.invalid", is_primary: true,
    },
    {
      id: LOCATION_TIN_HAU, workspace_id: WORKSPACE_ID, slug: "tin-hau", name: "Tin Hau",
      address: "Electric Road, Tin Hau", district: "Tin Hau", place_id: PLACE_ID,
      ig_handle: "kammanhouse.hk", website_url: "https://kammanhouse.example.invalid", is_primary: false,
    },
  ]);
  // Pending owner: bound on the next verified sign-in with this email. The
  // owner index is partial, so PostgREST cannot express the conflict target.
  const existingOwner = unwrap(
    "read workspace_members",
    await db.from("workspace_members").select("id").eq("workspace_id", WORKSPACE_ID).eq("role", "owner").maybeSingle(),
  );
  if (!existingOwner) {
    unwrap(
      "insert workspace_members",
      await db.from("workspace_members").insert({
        id: OWNER_MEMBER_ID,
        workspace_id: WORKSPACE_ID,
        user_id: null,
        email: process.env.SEED_DEMO_OWNER_EMAIL ?? "demo-owner@example.com",
        role: "owner",
        accepted_at: null,
      }),
    );
  }
  await insertIfMissing(db, "brand_profiles", "workspace_id", [
    {
      workspace_id: WORKSPACE_ID,
      voice: "warm",
      approved_claims: ["每日新鮮出爐菠蘿包", "街坊價錢", "WhatsApp 訂座"],
      prohibited_terms: ["米芝蓮", "全港最好"],
      languages: ["zh-HK", "en"],
      facts: {
        opening_hours: "07:00-18:00",
        signature_dishes: ["菠蘿包", "焗豬扒飯", "絲襪奶茶"],
        private_dining: { capacity: 24, booking_lead_days: 3 },
      },
    },
  ]);
  await insertIfMissing(db, "workspace_usage", "workspace_id,period", [
    { workspace_id: WORKSPACE_ID, period: "2026-09", approved_deliveries: 5, allowance: 12 },
  ]);
}

// 2. Two fixture scans, run through the real engine.
type JobSpec = { id: string; locationId: string; shareSlug: string; scannedAt: Date; session: string };

const JOBS: JobSpec[] = [
  { id: JOB_YIK_YAM, locationId: LOCATION_YIK_YAM, shareSlug: "demo-yik-yam", scannedAt: new Date(Date.now() - 35 * DAY_MS), session: "seed-demo-1" },
  { id: JOB_TIN_HAU, locationId: LOCATION_TIN_HAU, shareSlug: "demo-tin-hau", scannedAt: new Date(), session: "seed-demo-2" },
];

async function seedJob(db: SupabaseClient, job: JobSpec) {
  const existing = unwrap("read audit_jobs", await db.from("audit_jobs").select("id, status").eq("id", job.id).maybeSingle());
  if (existing && (existing as { status: string }).status !== "queued") {
    console.log(`    skip ${job.shareSlug}: already ${(existing as { status: string }).status}`);
    return;
  }
  if (!existing) {
    await insertIfMissing(db, "audit_jobs", "id", [
      {
        id: job.id,
        business_name: "錦汶館",
        ig_handle: "kammanhouse.hk",
        website_url: "https://kammanhouse.example.invalid",
        industry: "fnb",
        district: "Tin Hau",
        user_role: "owner",
        status: "queued",
        share_slug: job.shareSlug,
        region: "hk",
        place_id: PLACE_ID,
        place_match_confidence: "high",
        workspace_id: WORKSPACE_ID,
        location_id: job.locationId,
        created_at: job.scannedAt.toISOString(),
        input_snapshot: {
          version: 2,
          locale: "zh-HK",
          market: "hk",
          businessName: "錦汶館",
          provider: "fixture",
          manualEntry: false,
          placeId: PLACE_ID,
          instagramHandle: "kammanhouse.hk",
          industry: "fnb",
          district: "Tin Hau",
        },
      },
    ]);
  }
  // Evidence persistence uploads to Storage, which a PostgREST-only stack has
  // no endpoint for; fixtures carry no media anyway.
  const noopPersistEvidence = async () => undefined;
  const collect = createFixtureCollector("kam-man-house", { now: () => job.scannedAt });
  const result = await processScan(job.id, job.session, collect, noopPersistEvidence, db);
  console.log(`    ${job.shareSlug}: ${result.status}`);
}

// 3. The diff between the two scans.
async function ensureDiff(db: SupabaseClient): Promise<{ id: string; comparable: boolean } | null> {
  const read = async () =>
    unwrap(
      "read scan_diffs",
      await db.from("scan_diffs").select("id, comparable").eq("head_job_id", JOB_TIN_HAU).eq("base_job_id", JOB_YIK_YAM).maybeSingle(),
    ) as { id: string; comparable: boolean } | null;
  const existing = await read();
  if (existing) return existing;
  const stored = await persistScanDiff(JOB_TIN_HAU, buildTrendDiffDeps(db, JOB_TIN_HAU));
  if (!stored.stored) {
    console.warn(`    no scan_diffs row: ${stored.reason}`);
    return null;
  }
  return read();
}

// 4. One snapshot per job.
async function seedSnapshot(
  db: SupabaseClient,
  snapshotId: string,
  jobId: string,
  _locationId: string,
  _link: { comparableTo: string | null; diffId: string | null },
) {
  // lib/workspace/snapshots.ts derives module states, metrics, website checks
  // and the scan_diffs linkage from the persisted job, exactly as production
  // does after a scan. The location and link arguments are kept for the call
  // sites' readability; the builder reads both from the job and scan_diffs.
  const built = await buildSnapshot(db, jobId, { fetchWebsite: async () => ({ evaluated: 0, passed: 0, results: [] }) });
  if (built.id !== snapshotId) {
    // Pin the fixed demo id so the seeded actions can reference it idempotently.
    unwrap("pin scan_snapshots id", await db.from("scan_snapshots").update({ id: snapshotId }).eq("id", built.id));
  }
}

// 5. Actions and output versions, titles from lib/demo-data.ts.
async function seedActions(db: SupabaseClient) {
  await insertIfMissing(db, "actions", "id", [
    {
      id: ACTION_REVIEW_RESPONSE,
      workspace_id: WORKSPACE_ID,
      location_id: LOCATION_YIK_YAM,
      template_key: "review_response",
      source: "finding",
      source_finding_keys: ["gbp.no_recent_reviews"],
      source_snapshot_id: SNAPSHOT_YIK_YAM,
      title: { en: "Reply to 7 unanswered Google reviews", "zh-HK": "回覆 7 則未回應的 Google 評價" },
      summary: { en: "Seven recent customer reviews still need an owner response." },
      evidence: { en: "Response rate fell from 31% to 18%; the local comparison is 61%." },
      priority: "urgent",
      priority_score: 91,
      priority_factors: { regression: "fresh", surface: "high_intent", drafts_ready: true },
      effort_minutes: 10,
      required_inputs: ["Brand voice", "Original reviews", "Preferred language"],
      provided_inputs: {},
      action_state: "in_progress",
      measurement_state: "awaiting_comparable_scan",
      capability: "Demo",
      dedupe_key: `${WORKSPACE_ID}:${LOCATION_YIK_YAM}:review_response`,
    },
    {
      id: ACTION_SOCIAL_POST,
      workspace_id: WORKSPACE_ID,
      location_id: LOCATION_YIK_YAM,
      template_key: "social_post",
      source: "finding",
      source_finding_keys: ["ig.posting_gap"],
      source_snapshot_id: SNAPSHOT_YIK_YAM,
      title: { en: "Close a 16-day Instagram posting gap", "zh-HK": "填補 16 日的 Instagram 發帖空窗" },
      summary: { en: "Prepare this week's lunch-set post using an approved dish asset." },
      evidence: { en: "Last confirmed public post was 16 days ago; current provider coverage is partial." },
      priority: "high",
      priority_score: 74,
      priority_factors: { gap: "persistent", asset_available: true },
      effort_minutes: 8,
      required_inputs: ["Approved dish photo", "Offer details", "Alt text confirmation"],
      provided_inputs: {},
      action_state: "ready",
      measurement_state: "not_eligible",
      capability: "Demo",
      dedupe_key: `${WORKSPACE_ID}:${LOCATION_YIK_YAM}:social_post`,
    },
    {
      id: ACTION_VISIBILITY_CONTENT,
      workspace_id: WORKSPACE_ID,
      location_id: null,
      template_key: "visibility_content",
      source: "finding",
      source_finding_keys: ["aeo.not_mentioned"],
      source_snapshot_id: SNAPSHOT_TIN_HAU,
      title: { en: "Add a clear private-dining FAQ", "zh-HK": "加入清晰的包場常見問題" },
      summary: { en: "Answer the questions that were missing from three search and AI-surface checks." },
      evidence: { en: "No supported answer found for capacity, booking lead time, or vegetarian options." },
      priority: "high",
      priority_score: 68,
      priority_factors: { query_gap: "repeated", owner_facts_required: true },
      effort_minutes: 15,
      required_inputs: ["Capacity", "Booking policy", "Confirmed dietary options"],
      provided_inputs: {},
      action_state: "needs_input",
      measurement_state: "not_eligible",
      capability: "Demo",
      dedupe_key: `${WORKSPACE_ID}:all:visibility_content`,
    },
  ]);

  await insertIfMissing(db, "output_versions", "id", [
    {
      id: VERSION_1,
      workspace_id: WORKSPACE_ID,
      action_id: ACTION_REVIEW_RESPONSE,
      version_no: 1,
      body: "多謝你的寶貴意見。很抱歉午市期間讓你久等，我們會改善安排，期待你再次光臨錦汶館。",
      alt_text: null,
      meta: { agent_key: "review_reply_agent", label: "Version 1 · Generated" },
      author_type: "agent",
      approval_state: "superseded",
      delivery_state: "not_requested",
    },
    {
      id: VERSION_2,
      workspace_id: WORKSPACE_ID,
      action_id: ACTION_REVIEW_RESPONSE,
      version_no: 2,
      body: "多謝你再次到訪錦汶館，亦感謝你提到午市等候時間。星期五午市確實較繁忙，我們已調整帶位安排，希望下次能讓你更快入座。期待再為你準備一頓暖心的家常菜。",
      alt_text: null,
      meta: { label: "Version 2 · Current", edited_from_version: 1 },
      author_type: "user",
      approval_state: "draft",
      delivery_state: "not_requested",
    },
  ]);
}

async function main() {
  const { url, key } = guardEnvironment();
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  console.log("==> workspace, locations, owner, brand profile, usage");
  await seedWorkspace(db);

  console.log("==> fixture scans through the scan engine");
  for (const job of JOBS) await seedJob(db, job);

  console.log("==> scan diff");
  const diff = await ensureDiff(db);
  console.log(diff ? `    ${diff.id} comparable=${diff.comparable}` : "    none");

  console.log("==> snapshots");
  await seedSnapshot(db, SNAPSHOT_YIK_YAM, JOB_YIK_YAM, LOCATION_YIK_YAM, { comparableTo: null, diffId: null });
  await seedSnapshot(db, SNAPSHOT_TIN_HAU, JOB_TIN_HAU, LOCATION_TIN_HAU, {
    comparableTo: diff?.comparable ? SNAPSHOT_YIK_YAM : null,
    diffId: diff?.id ?? null,
  });

  console.log("==> actions and output versions");
  await seedActions(db);

  console.log("done: workspace kam-man-house is seeded (sign in with demo-owner@example.com or SEED_DEMO_OWNER_EMAIL to bind the owner row).");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
