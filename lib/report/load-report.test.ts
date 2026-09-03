import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createViewerToken,
  encodeViewerGrantCookie,
  type PresentedViewerToken,
} from "@/lib/report-access/token";
import type {
  ReportWorkspaceMembership,
  StaffSessionUser,
  ViewerGrantRecord,
} from "@/lib/report-access/authorize-report";
import type { ReportLanguageService } from "./language-service";
import type {
  AuthorizedJobData,
  LoadedAuthorizedFinding,
  PublicReportJob,
  ReportStore,
} from "./store";
import type { EvidenceGalleryModel } from "./view-model";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  llmConfigured: true,
  generatedSummary: "GENERATED_SUMMARY",
  afterCallbacks: [] as Array<() => Promise<void>>,
  viewerCookie: undefined as string | undefined,
  staffUser: null as StaffSessionUser | null,
  viewerGrant: null as ViewerGrantRecord | null,
  grantLookupError: null as null | { code?: string; message: string },
  grantUsageError: null as null | { code?: string; message: string },
  summaryCacheError: null as null | { code: string; message: string },
  selections: [] as Array<{ table: string; columns: string }>,
  jobError: null as null | { code: string; message: string },
  authorizedJobError: null as null | { code: string; message: string },
  publicFindingError: null as null | { code: string; message: string },
  countError: null as null | { code: string; message: string },
  authorizedFindingError: null as null | { code: string; message: string },
  agentRuns: [] as Array<{ finding_key: string; agent_key: string; output: Record<string, unknown> }>,
  job: {
    id: "job-1",
    share_slug: "shop",
    business_name: "Example Shop",
    district: "Central",
    industry: "Cafe",
    status: "partial",
    overall_score: 64,
    module_scores: null,
    module_results: {
      ig: {
        status: "measured",
        score: 70,
        confidence: "high",
        evidenceCollectedAt: "2026-08-01T00:00:00.000Z",
        limitationCode: null,
      },
    },
    score_coverage: 0.3,
    region: "hk",
    scoring_version: "2026-08-02",
  },
  authorizedJob: {
    summary_en: "CACHED_SUMMARY",
    summary_zh: "快取摘要",
    summary_tw: "快取摘要TW",
    raw_data: {
      ig: {
        profile: {
          username: "proof_ig",
          full_name: "Proof IG",
          bio: "bio",
          followers: 120,
          following: 30,
          posts_count: 9,
          profile_pic_url: "PRIVATE_IMAGE",
          is_verified: true,
          external_url: "https://example.com",
        },
        posts: [
          {
            id: "p1",
            caption: "post proof",
            media_type: "image",
            like_count: 5,
            comment_count: 2,
            posted_at: "2026-07-15",
            thumbnail_url: "PRIVATE_THUMB",
          },
        ],
        reels: [],
        highlights: [{ id: "h1", title: "Menu", cover_url: "PRIVATE_COVER" }],
        stories_count: 1,
        debug_posts_api_keys: ["RAW_DEBUG_SECRET"],
      },
      gbp: {
        name: "PROOF_GBP",
        place_id: "PRIVATE_PLACE",
        address: "1 Proof Street",
        maps_url: "https://maps.google.com/?cid=proof",
        rating: 4.2,
        reviews_count: 31,
        categories: ["Cafe"],
        reviews: [{ rating: 5, text: "great", time: "2026-07-14", owner_response: "thanks" }],
      },
      aeo: {
        serpapi_runs: [
          {
            query: "PROOF_AEO_QUERY",
            engine: "google",
            ai_overview: { text: "RAW_AI_TEXT", brand_mentioned: true, sources: ["RAW_SOURCE"] },
            ai_mode: { text: "RAW_MODE_TEXT", brand_mentioned: false },
            organic_results: [],
            brand_organic_rank: 3,
            competitors_mentioned: [],
            available: true,
          },
        ],
        website: null,
        merchant_performance: {
          version: "2026-06-18",
          generated_at: "2026-07-15T00:00:00Z",
          entity: { business_name: "Example Shop" },
          runs: [
            {
              id: "m1",
              query: "PROOF_MERCHANT_QUERY",
              query_type: "brand",
              engine: "google",
              requested_at: "2026-07-15",
              settings: { gl: "hk", hl: "en", location: null, device: "desktop" },
              serpapi: { status: "Success", search_id: "RAW_SEARCH_ID", total_time_taken: 1, error: null },
              merchant_presence: {
                found: true,
                confidence: "high",
                confidence_reason: "raw",
                matched_by: [],
                ai_mentioned: true,
                ai_cited: false,
                ai_citation_urls: ["RAW_CITATION"],
                organic_rank: 2,
                local_pack_rank: null,
                maps_rank: 1,
              },
              competitors: [],
              evidence_snippets: [
                {
                  source: "organic",
                  label: "Proof",
                  text: "bounded snippet",
                  url: "https://example.com",
                  matched_text: "match",
                },
              ],
              raw_refs: { ai_overview_text: "RAW_PROVIDER_SECRET" },
            },
          ],
        },
      },
    },
  },
  findings: [
    {
      id: "finding-1",
      job_id: "job-1",
      finding_key: "ig.profile_clarity",
      module: "ig",
      severity: "critical",
      score_impact: -20,
      owner_message_zh: "OWNER_SECRET",
      owner_message_en: "OWNER_SECRET_EN",
      owner_message_tw: "OWNER_SECRET_TW",
      owner_action_zh: "FIX_SECRET",
      owner_action_en: "FIX_SECRET_EN",
      evidence: {
        reviews_count: 31,
        rating: 4.2,
        response_rate: 50,
        ig_followers: 120,
        days_since_last_review: 4,
      },
      v02_agent_hint: "STAFF_SECRET",
    },
  ],
}));

vi.mock("@/lib/report-access/staff-session", () => ({
  loadStaffSessionUser: vi.fn(async () => state.staffUser),
}));
vi.mock("next/server", () => ({
  after: vi.fn((work: () => Promise<void>) => {
    state.afterCallbacks.push(work);
  }),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => (state.viewerCookie ? { value: state.viewerCookie } : undefined)),
  })),
}));
vi.mock("next/cache", () => ({ unstable_noStore: vi.fn() }));
vi.mock("@/lib/llm", () => ({ llmConfigured: vi.fn(() => state.llmConfigured) }));
vi.mock("@/lib/llm-summary", () => ({
  generateExecutiveSummary: vi.fn(async () => state.generatedSummary),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/evidence/load-authorized", () => ({
  loadAuthorizedEvidence: vi.fn(async () => ({
    items: [
      {
        id: "evidence-1",
        provider: "instagram",
        evidenceType: "post",
        sourceUrl: "https://www.instagram.com/p/code/",
        mediaUrl:
          "https://project.supabase.co/storage/v1/object/sign/report-evidence/job-1/post.jpg?token=signed-token",
        capturedAt: "2026-07-21T00:00:00.000Z",
        publishedAt: null,
        text: "Post",
        metadata: { likes: 5 },
        status: "stored",
        limitationCode: null,
      },
    ],
  })),
}));

function queryFor(table: string) {
  let columns = "";
  let head = false;
  let updating = false;
  const result = () => {
    if (table === "audit_jobs") {
      if (updating) {
        return { data: null, error: state.summaryCacheError };
      }
      if (columns.includes("raw_data")) {
        return {
          data: state.authorizedJobError ? null : state.authorizedJob,
          error: state.authorizedJobError,
        };
      }
      return { data: state.jobError ? null : state.job, error: state.jobError };
    }
    if (table === "audit_findings") {
      if (head) return { data: null, error: state.countError, count: state.findings.length };
      const error = columns.includes("owner_message_en")
        ? state.authorizedFindingError
        : state.publicFindingError;
      return { data: error ? null : state.findings, error };
    }
    if (table === "agent_runs") {
      return { data: state.agentRuns, error: null };
    }
    if (table === "report_access_grants") {
      if (updating) return { data: null, error: state.grantUsageError };
      if (state.grantLookupError) return { data: null, error: state.grantLookupError };
      if (!state.viewerGrant) return { data: null, error: { code: "PGRST116", message: "no rows" } };
      return { data: state.viewerGrant, error: null };
    }
    throw new Error(`unexpected table ${table}`);
  };
  const query = {
    select(value: string, options?: { head?: boolean }) {
      columns = value;
      head = Boolean(options?.head);
      state.selections.push({ table, columns });
      return query;
    },
    eq() {
      return query;
    },
    is() {
      return query;
    },
    order() {
      return query;
    },
    limit() {
      return query;
    },
    update() {
      updating = true;
      return query;
    },
    single: vi.fn(async () => result()),
    then(resolve: (value: ReturnType<typeof result>) => unknown) {
      return Promise.resolve(result()).then(resolve);
    },
  };
  return query;
}

vi.mock("@/lib/supabase/admin", () => ({
  supabaseServer: vi.fn(() => ({ from: (table: string) => queryFor(table) })),
}));

import { loadAuthorizedEvidence } from "@/lib/evidence/load-authorized";
import { createReportLoader, loadReport } from "./load-report";

function publicJobFixture(): PublicReportJob {
  return structuredClone(state.job) as PublicReportJob;
}

function authorizedJobFixture(
  overrides: Partial<AuthorizedJobData> = {},
): AuthorizedJobData {
  return { ...(structuredClone(state.authorizedJob) as AuthorizedJobData), ...overrides };
}

function authorizedFindingsFixture(): LoadedAuthorizedFinding[] {
  return structuredClone(state.findings) as LoadedAuthorizedFinding[];
}

function publicFindingsFixture() {
  return authorizedFindingsFixture().map(
    ({ id, job_id, module, finding_key, severity, score_impact }) => ({
      id,
      job_id,
      module,
      finding_key,
      severity,
      score_impact,
    }),
  );
}

function createViewerAccessGrant(
  overrides: Partial<ViewerGrantRecord> = {},
): {
  viewerToken: PresentedViewerToken;
  grant: ViewerGrantRecord;
} {
  const token = createViewerToken();
  const grant: ViewerGrantRecord = {
    id: "grant-1",
    job_id: "job-1",
    token_hash: token.tokenHash,
    // Relative, because these tests exercise the real authorizeReport, which
    // defaults `now` to the wall clock. An absolute literal here passes until
    // the day it doesn't: the original 2026-08-11 was two days out when it was
    // written and turned main red on 2026-08-13 with eight failures that read
    // like an authorization regression. Production writes this column the same
    // relative way (app/api/staff/report-grants/route.ts).
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    redeemed_at: null,
    revoked_at: null,
    last_used_at: null,
    ...overrides,
  };
  return {
    viewerToken: { grantId: grant.id, rawToken: token.rawToken },
    grant,
  };
}

function setWrapperViewerAccess(overrides: Partial<ViewerGrantRecord> = {}) {
  const { viewerToken, grant } = createViewerAccessGrant(overrides);
  state.viewerGrant = grant;
  state.viewerCookie = encodeViewerGrantCookie(viewerToken.grantId, viewerToken.rawToken);
  return { viewerToken, grant };
}

function makeLoaderDeps(options: {
  viewerToken?: PresentedViewerToken | null;
  grant?: ViewerGrantRecord | null;
  staffUser?: StaffSessionUser | null;
  membership?: ReportWorkspaceMembership | null;
  lookupThrows?: boolean;
  markUsedThrows?: boolean;
  summary?: string | null;
  generateSummary?: boolean;
  publicJob?: PublicReportJob;
  publicFindings?: ReturnType<typeof publicFindingsFixture>;
  authorizedJob?: AuthorizedJobData;
  authorizedFindings?: LoadedAuthorizedFinding[];
} = {}) {
  const publicJob = options.publicJob ?? publicJobFixture();
  const publicFindings = options.publicFindings ?? publicFindingsFixture();
  const authorizedJob =
    options.authorizedJob ??
    authorizedJobFixture({ summary_en: null, summary_zh: null, summary_tw: null });
  const authorizedFindings = options.authorizedFindings ?? authorizedFindingsFixture();
  const scheduled: Array<() => Promise<void>> = [];

  const readPublicJobBySlug = vi.fn(async () => publicJob);
  const readPublicFindings = vi.fn(async () => ({
    findings: publicFindings,
    count: publicFindings.length,
  }));
  const readAuthorizedJobData = vi.fn(async () => authorizedJob);
  const readAuthorizedFindings = vi.fn(async () => authorizedFindings);
  const readApprovedAgentRuns = vi.fn(async () => []);
  const findViewerGrant = vi.fn(async () => {
    if (options.lookupThrows) throw new Error("grant lookup failed");
    return options.grant ?? null;
  });
  const markViewerGrantUsed = vi.fn(async () => {
    if (options.markUsedThrows) throw new Error("grant usage write failed");
  });
  const cacheSummary = vi.fn(async () => undefined);
  const resolveSummary = vi.fn(async (source, _locale, cache) => {
    if (options.generateSummary) {
      cache(source.jobId, "summary_en", "GENERATED_SUMMARY");
      return "GENERATED_SUMMARY";
    }
    return options.summary ?? authorizedJob.summary_en ?? "AUTHORIZED_SUMMARY";
  });
  const loadEvidence = vi.fn(async (): Promise<EvidenceGalleryModel> => ({
    items: [
      {
        id: "evidence-1",
        provider: "instagram",
        evidenceType: "post",
        sourceUrl: "https://www.instagram.com/p/code/",
        mediaUrl:
          "https://project.supabase.co/storage/v1/object/sign/report-evidence/job-1/post.jpg?token=signed-token",
        capturedAt: "2026-07-21T00:00:00.000Z",
        publishedAt: null,
        text: "Post",
        metadata: { likes: 5 },
        status: "stored",
        limitationCode: null,
      },
    ],
  }));
  const getViewerToken = vi.fn(async () => options.viewerToken ?? null);
  const getStaffUser = vi.fn(async () => options.staffUser ?? null);
  const getMembership = vi.fn(async () => options.membership ?? null);
  const scheduleAfter = vi.fn((work: () => Promise<void>) => {
    scheduled.push(work);
  });

  const store = {
    readPublicJobBySlug,
    readPublicFindings,
    readAuthorizedJobData,
    readAuthorizedFindings,
    readApprovedAgentRuns,
    findViewerGrant,
    markViewerGrantUsed,
    cacheSummary,
  } satisfies ReportStore;
  const languageService = {
    resolveSummary,
  } satisfies ReportLanguageService;

  return {
    loader: createReportLoader({
      store,
      languageService,
      loadEvidence,
      getViewerToken,
      getStaffUser,
      getMembership,
      scheduleAfter,
    }),
    getMembership,
    readPublicJobBySlug,
    readPublicFindings,
    readAuthorizedJobData,
    readAuthorizedFindings,
    readApprovedAgentRuns,
    findViewerGrant,
    markViewerGrantUsed,
    cacheSummary,
    resolveSummary,
    loadEvidence,
    scheduleAfter,
    scheduled,
  };
}

describe("createReportLoader", () => {
  it("uses only the public store path for an unauthenticated visitor", async () => {
    const {
      loader,
      readPublicFindings,
      readAuthorizedJobData,
      readAuthorizedFindings,
      loadEvidence,
      resolveSummary,
    } = makeLoaderDeps();

    const model = await loader("slug-1", "en");

    expect(model.access).toBe("public");
    expect(readPublicFindings).toHaveBeenCalledWith("job-1");
    expect(readAuthorizedJobData).not.toHaveBeenCalled();
    expect(readAuthorizedFindings).not.toHaveBeenCalled();
    expect(loadEvidence).not.toHaveBeenCalled();
    expect(resolveSummary).not.toHaveBeenCalled();
  });

  it("loads authorized report detail only after a valid viewer grant is authorized", async () => {
    const { viewerToken, grant } = createViewerAccessGrant();
    const {
      loader,
      findViewerGrant,
      markViewerGrantUsed,
      readAuthorizedJobData,
      readAuthorizedFindings,
      loadEvidence,
      scheduleAfter,
      scheduled,
      cacheSummary,
    } = makeLoaderDeps({
      viewerToken,
      grant,
      generateSummary: true,
    });

    const model = await loader("slug-1", "en");

    expect(model.access).toBe("viewer");
    expect(findViewerGrant).toHaveBeenCalledWith("job-1", grant.id);
    expect(markViewerGrantUsed).toHaveBeenCalledWith("job-1", grant.id);
    expect(findViewerGrant.mock.invocationCallOrder[0]).toBeLessThan(
      readAuthorizedJobData.mock.invocationCallOrder[0],
    );
    expect(markViewerGrantUsed.mock.invocationCallOrder[0]).toBeLessThan(
      readAuthorizedFindings.mock.invocationCallOrder[0],
    );
    expect(loadEvidence).toHaveBeenCalledWith("job-1");
    expect(scheduleAfter).toHaveBeenCalledTimes(1);
    expect(cacheSummary).not.toHaveBeenCalled();
    await scheduled[0]?.();
    expect(cacheSummary).toHaveBeenCalledWith("job-1", "summary_en", "GENERATED_SUMMARY");
  });

  // Upstream: "uses the authorized path for allowlisted staff without a viewer
  // grant". The staff console stays in the legacy deployment, so lib/auth/staff.ts
  // fails closed and a staff-looking session gets the public preview here.
  it("never uses the staff path in this app, even for an allowlisted-looking session", async () => {
    const previous = process.env.FIMMICK_STAFF_EMAILS;
    process.env.FIMMICK_STAFF_EMAILS = "staff@fimmick.com";
    try {
      const {
        loader,
        readPublicFindings,
        readAuthorizedJobData,
        loadEvidence,
      } = makeLoaderDeps({
        staffUser: { id: "staff-1", email: "Staff@Fimmick.com" },
        summary: "CACHED_SUMMARY",
      });

      const model = await loader("slug-1", "en");

      expect(model.access).toBe("public");
      expect(readPublicFindings).toHaveBeenCalledWith("job-1");
      expect(readAuthorizedJobData).not.toHaveBeenCalled();
      expect(loadEvidence).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.FIMMICK_STAFF_EMAILS;
      else process.env.FIMMICK_STAFF_EMAILS = previous;
    }
  });

  it("uses the authorized path for an accepted workspace member without a viewer grant", async () => {
    const {
      loader,
      getMembership,
      findViewerGrant,
      readPublicFindings,
      readAuthorizedJobData,
      loadEvidence,
    } = makeLoaderDeps({
      publicJob: { ...publicJobFixture(), workspace_id: "ws-1" },
      membership: { workspaceId: "ws-1", role: "manager" },
      summary: "CACHED_SUMMARY",
    });

    const model = await loader("slug-1", "en");

    expect(model.access).toBe("member");
    if (model.access !== "member") throw new Error("expected member");
    expect(model.workspaceId).toBe("ws-1");
    expect(model.role).toBe("manager");
    expect(model.summary).toBe("CACHED_SUMMARY");
    expect(model.fullFindings.length).toBeGreaterThan(0);
    expect(getMembership).toHaveBeenCalledWith({ id: "job-1", workspaceId: "ws-1" });
    expect(findViewerGrant).not.toHaveBeenCalled();
    expect(readPublicFindings).not.toHaveBeenCalled();
    expect(readAuthorizedJobData).toHaveBeenCalledWith("job-1");
    expect(loadEvidence).toHaveBeenCalledWith("job-1");
  });

  it("fails closed to the public model when the membership names another workspace", async () => {
    const { loader, readPublicFindings, readAuthorizedJobData, loadEvidence } = makeLoaderDeps({
      publicJob: { ...publicJobFixture(), workspace_id: "ws-1" },
      membership: { workspaceId: "ws-2", role: "owner" },
    });

    const model = await loader("slug-1", "en");

    expect(model.access).toBe("public");
    expect(readPublicFindings).toHaveBeenCalledWith("job-1");
    expect(readAuthorizedJobData).not.toHaveBeenCalled();
    expect(loadEvidence).not.toHaveBeenCalled();
  });

  it("passes a null workspace id to the membership resolver for an unattached job", async () => {
    const { loader, getMembership } = makeLoaderDeps({
      membership: { workspaceId: "ws-1", role: "owner" },
    });

    const model = await loader("slug-1", "en");

    expect(getMembership).toHaveBeenCalledWith({ id: "job-1", workspaceId: null });
    // An unattached job can never be matched by a membership (fail closed).
    expect(model.access).toBe("public");
  });

  it("falls back to the public model when the viewer grant is missing", async () => {
    const { viewerToken } = createViewerAccessGrant();
    const {
      loader,
      readPublicFindings,
      readAuthorizedJobData,
      markViewerGrantUsed,
      loadEvidence,
    } = makeLoaderDeps({
      viewerToken,
      grant: null,
    });

    const model = await loader("slug-1", "en");

    expect(model.access).toBe("public");
    expect(readPublicFindings).toHaveBeenCalledWith("job-1");
    expect(readAuthorizedJobData).not.toHaveBeenCalled();
    expect(markViewerGrantUsed).not.toHaveBeenCalled();
    expect(loadEvidence).not.toHaveBeenCalled();
  });

  it("falls back to the public model when the viewer token does not match the stored grant", async () => {
    const { viewerToken, grant } = createViewerAccessGrant({
      token_hash: createViewerToken().tokenHash,
    });
    const {
      loader,
      readPublicFindings,
      readAuthorizedJobData,
      markViewerGrantUsed,
      loadEvidence,
    } = makeLoaderDeps({
      viewerToken,
      grant,
    });

    const model = await loader("slug-1", "en");

    expect(model.access).toBe("public");
    expect(readPublicFindings).toHaveBeenCalledWith("job-1");
    expect(readAuthorizedJobData).not.toHaveBeenCalled();
    expect(markViewerGrantUsed).not.toHaveBeenCalled();
    expect(loadEvidence).not.toHaveBeenCalled();
  });

  it("keeps viewer authorization when grant usage marking fails", async () => {
    const { viewerToken, grant } = createViewerAccessGrant();
    const {
      loader,
      markViewerGrantUsed,
      readAuthorizedJobData,
      loadEvidence,
    } = makeLoaderDeps({
      viewerToken,
      grant,
      markUsedThrows: true,
      summary: "AUTHORIZED_SUMMARY",
    });

    const model = await loader("slug-1", "en");

    expect(model.access).toBe("viewer");
    expect(markViewerGrantUsed).toHaveBeenCalledWith("job-1", grant.id);
    expect(readAuthorizedJobData).toHaveBeenCalledWith("job-1");
    expect(loadEvidence).toHaveBeenCalledWith("job-1");
  });
});

describe("loadReport", () => {
  beforeEach(() => {
    vi.mocked(loadAuthorizedEvidence).mockClear();
    state.llmConfigured = true;
    state.generatedSummary = "GENERATED_SUMMARY";
    state.afterCallbacks.length = 0;
    state.viewerCookie = undefined;
    state.staffUser = null;
    state.viewerGrant = null;
    state.grantLookupError = null;
    state.grantUsageError = null;
    state.summaryCacheError = null;
    state.selections.length = 0;
    state.jobError = null;
    state.authorizedJobError = null;
    state.publicFindingError = null;
    state.countError = null;
    state.authorizedFindingError = null;
    state.agentRuns = [];
    state.authorizedJob.summary_en = "CACHED_SUMMARY";
    state.authorizedJob.summary_zh = "敹怠???";
    state.authorizedJob.summary_tw = "敹怠???TW";
  });

  it("does not load or sign private evidence for public reports", async () => {
    const model = await loadReport("shop", "en");

    expect(loadAuthorizedEvidence).not.toHaveBeenCalled();
    expect(model).not.toHaveProperty("evidence");
  });

  it("never selects or serializes proof/detail fields publicly", async () => {
    const model = await loadReport("shop", "en");

    expect(
      state.selections.some(
        (item) => item.table === "audit_jobs" && item.columns.includes("raw_data"),
      ),
    ).toBe(false);
    const findingSelection = state.selections.find(
      (item) => item.table === "audit_findings" && item.columns !== "id",
    );
    expect(findingSelection?.columns).toBe(
      "id, job_id, module, finding_key, severity, score_impact",
    );
    expect(JSON.stringify(model)).not.toMatch(
      /OWNER_SECRET|FIX_SECRET|RAW_PROVIDER_SECRET|RAW_DEBUG_SECRET|CACHED_SUMMARY|proof_ig|PROOF_GBP|STAFF_SECRET/,
    );
  });

  it("surfaces internalHint only for an authorized (viewer/staff) load, never publicly", async () => {
    const publicModel = await loadReport("shop", "en");
    expect(JSON.stringify(publicModel)).not.toContain("STAFF_SECRET");

    setWrapperViewerAccess();
    const authorizedModel = await loadReport("shop", "en");
    if (authorizedModel.access !== "viewer") throw new Error("expected viewer");
    expect(authorizedModel.fullFindings[0]?.internalHint).toBe("STAFF_SECRET");
  });

  it("surfaces an approved fix-pack draft for the finding it addresses, authorized only", async () => {
    state.agentRuns = [{
      finding_key: state.findings[0]!.finding_key,
      agent_key: "review_reply_agent",
      output: { agentKey: "review_reply_agent", draftReply: "APPROVED_DRAFT_TEXT" },
    }];

    const publicModel = await loadReport("shop", "en");
    expect(JSON.stringify(publicModel)).not.toContain("APPROVED_DRAFT_TEXT");

    setWrapperViewerAccess();
    const authorizedModel = await loadReport("shop", "en");
    if (authorizedModel.access !== "viewer") throw new Error("expected viewer");
    expect(authorizedModel.fullFindings[0]?.fixPackDraft).toBe("APPROVED_DRAFT_TEXT");
  });

  it("loads private evidence only after viewer authorization", async () => {
    setWrapperViewerAccess();

    const model = await loadReport("shop", "en");

    expect(loadAuthorizedEvidence).toHaveBeenCalledWith("job-1");
    if (model.access !== "viewer") throw new Error("expected viewer");
    expect(model.evidence.items[0]?.mediaUrl).toContain("signed-token");
  });

  it("selects raw_data only after viewer authorization and returns sanitized bounded proof", async () => {
    setWrapperViewerAccess();

    const model = await loadReport("shop", "en");

    expect(
      state.selections.some(
        (item) => item.table === "audit_jobs" && item.columns.includes("raw_data"),
      ),
    ).toBe(true);
    if (model.access !== "viewer") throw new Error("expected viewer");
    expect(model.summary).toBe("CACHED_SUMMARY");
    expect(model.proof.ig?.username).toBe("proof_ig");
    expect(model.proof.gbp).toMatchObject({
      name: "PROOF_GBP",
      address: "1 Proof Street",
      mapsUrl: "https://maps.google.com/?cid=proof",
    });
    expect(model.proof.aeo?.runs[0].query).toBe("PROOF_AEO_QUERY");
    expect(model.proof.merchant?.runs[0].query).toBe("PROOF_MERCHANT_QUERY");
    expect(model.proof.trust?.reviews).toBe(31);
    expect(JSON.stringify(model)).not.toMatch(
      /PRIVATE_IMAGE|PRIVATE_THUMB|PRIVATE_COVER|PRIVATE_PLACE|RAW_AI_TEXT|RAW_MODE_TEXT|RAW_SOURCE|RAW_SEARCH_ID|RAW_CITATION|RAW_PROVIDER_SECRET|RAW_DEBUG_SECRET|raw_refs/,
    );
  });

  it("logs a bounded error when deferred summary cache writes fail without blocking render", async () => {
    setWrapperViewerAccess();
    const authorizedJob = state.authorizedJob as {
      summary_en: string | null;
      summary_zh: string | null;
      summary_tw: string | null;
    };
    authorizedJob.summary_en = null;
    authorizedJob.summary_zh = null;
    authorizedJob.summary_tw = null;
    state.generatedSummary = "WRAPPER_GENERATED_SUMMARY";
    state.summaryCacheError = { code: "XX005", message: "database offline" };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const model = await loadReport("shop", "en");

      if (model.access !== "viewer") throw new Error("expected viewer");
      expect(model.summary).toBe("WRAPPER_GENERATED_SUMMARY");
      expect(state.afterCallbacks).toHaveLength(1);
      expect(consoleError).not.toHaveBeenCalled();

      await state.afterCallbacks[0]?.();

      expect(consoleError).toHaveBeenCalledWith(
        "[report] summary cache write failed",
        { column: "summary_en" },
      );
      expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(/database offline|XX005/);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("rejects non-Google and credential-bearing Maps proof URLs", async () => {
    setWrapperViewerAccess();
    const rawData = state.authorizedJob.raw_data as {
      gbp: { maps_url: string | null };
    };
    const original = rawData.gbp.maps_url;
    try {
      rawData.gbp.maps_url = "https://evil.example/maps?key=provider-secret";
      let model = await loadReport("shop", "en");
      if (model.access !== "viewer") throw new Error("expected viewer");
      expect(model.proof.gbp?.mapsUrl).toBeNull();

      rawData.gbp.maps_url = "https://maps.google.com/?cid=proof&auth=provider-secret";
      model = await loadReport("shop", "en");
      if (model.access !== "viewer") throw new Error("expected viewer");
      expect(model.proof.gbp?.mapsUrl).toBeNull();
    } finally {
      rawData.gbp.maps_url = original;
    }
  });

  it("returns 404 only when the job row is absent", async () => {
    state.jobError = { code: "PGRST116", message: "no rows" };

    await expect(loadReport("missing", "en")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("throws an operational job query error", async () => {
    state.jobError = { code: "XX000", message: "database offline" };

    await expect(loadReport("shop", "en")).rejects.toThrow("Unable to load report job");
  });

  it("throws public finding query errors", async () => {
    state.publicFindingError = { code: "XX001", message: "findings unavailable" };

    await expect(loadReport("shop", "en")).rejects.toThrow(
      "Unable to load public report findings",
    );
  });

  it("throws public finding count errors", async () => {
    state.countError = { code: "XX002", message: "count unavailable" };

    await expect(loadReport("shop", "en")).rejects.toThrow(
      "Unable to count public report findings",
    );
  });

  it("throws authorized proof job query errors", async () => {
    setWrapperViewerAccess();
    state.authorizedJobError = { code: "XX003", message: "proof unavailable" };

    await expect(loadReport("shop", "en")).rejects.toThrow(
      "Unable to load authorized report proof",
    );
  });

  it("throws authorized finding query errors", async () => {
    setWrapperViewerAccess();
    state.authorizedFindingError = { code: "XX004", message: "detail unavailable" };

    await expect(loadReport("shop", "en")).rejects.toThrow(
      "Unable to load authorized report findings",
    );
  });
});
