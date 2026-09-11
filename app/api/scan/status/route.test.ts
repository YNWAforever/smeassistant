import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enforceCompositeIdentifierRateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 1 })),
  from: vi.fn(),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  enforceCompositeIdentifierRateLimit: mocks.enforceCompositeIdentifierRateLimit,
  rateLimitedResponse: vi.fn(() => new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 })),
}));
vi.mock("@/lib/repositories/jobs", () => ({ jobsRepository: { readStatus: mocks.from } }));

import { GET } from "./route";

describe("scan status rate-limit boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockResolvedValue({id:"00000000-0000-4000-8000-000000000001",status:"complete",processing_stage:null,share_slug:"report-1234",score_coverage:1,failure_correlation_id:null,module_results:null,module_scores:null});
  });

  it("rejects malformed job IDs before consuming any rate-limit bucket", async () => {
    const response = await GET(new Request("https://scanner.test/api/scan/status?jobId=not-a-uuid"));
    expect(response.status).toBe(400);
    expect(mocks.enforceCompositeIdentifierRateLimit).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("uses the bounded outer-plus-composite limiter for a valid job ID", async () => {
    const jobId = "00000000-0000-4000-8000-000000000001";
    const req = new Request("https://scanner.test/api/scan/status?jobId=" + jobId);
    const response = await GET(req);
    expect(response.status).toBe(200);
    expect(mocks.enforceCompositeIdentifierRateLimit).toHaveBeenCalledWith({
      req,
      scope: "scan_status",
      identifier: jobId,
      failClosed: false,
    });
  });

  it("reports honest per-module states on a partial job, never a blanket 'measured'", async () => {
    const jobId = "00000000-0000-4000-8000-000000000001";
    mocks.from.mockResolvedValue({
      id: jobId, status: "partial", processing_stage: null, share_slug: "report-1234", score_coverage: 0.5, failure_correlation_id: null,
      module_results: { gbp: { status: "measured", score: 80, confidence: "high" }, ig: { status: "unavailable", limitationCode: "IG_HANDLE_NOT_PROVIDED" }, aeo: { status: "failed", limitationCode: "AEO_PROVIDER_FAILED" } },
      module_scores: null,
    });
    const response = await GET(new Request("https://scanner.test/api/scan/status?jobId=" + jobId));
    const body = await response.json();
    expect(body.moduleStates).toEqual({ google_business: "measured", instagram: "unavailable", search_ai: "failed" });
  });

  it("omits module states while the scan is still running", async () => {
    const jobId = "00000000-0000-4000-8000-000000000001";
    mocks.from.mockResolvedValue({ id: jobId, status: "collecting_aeo", processing_stage: "collecting_aeo", share_slug: null, score_coverage: null, failure_correlation_id: null, module_results: null, module_scores: null });
    const response = await GET(new Request("https://scanner.test/api/scan/status?jobId=" + jobId));
    const body = await response.json();
    expect(body.moduleStates).toBeNull();
  });
});
