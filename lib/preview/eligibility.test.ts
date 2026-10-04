import { describe, expect, it, vi } from "vitest";
import type { ViewerGrantRecord } from "@/lib/report-access/authorize-report";
import { createViewerToken } from "@/lib/report-access/token";
import type { PreviewJob } from "@/lib/repositories/previews";
import { authorizePreview } from "./eligibility";

type PreviewJobLookup = (slug: string) => Promise<PreviewJob | null>;
type GrantLookup = (jobId: string, grantId: string) => Promise<ViewerGrantRecord | null>;

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_JOB_ID = "22222222-2222-4222-8222-222222222222";
const GRANT_ID = "33333333-3333-4333-8333-333333333333";

const token = createViewerToken();
const viewerToken = { grantId: GRANT_ID, rawToken: token.rawToken };

function job(status = "done"): PreviewJob {
  return { id: JOB_ID, status, region: "hk", businessName: "Kam Man House" };
}

function grant(overrides: Partial<ViewerGrantRecord> = {}): ViewerGrantRecord {
  return {
    id: GRANT_ID,
    job_id: JOB_ID,
    token_hash: token.tokenHash,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    redeemed_at: null,
    revoked_at: null,
    last_used_at: null,
    ...overrides,
  };
}

function deps(previewJob: PreviewJob | null, record: ViewerGrantRecord | null = grant()) {
  return {
    repo: { previewJob: vi.fn<PreviewJobLookup>(async () => previewJob) },
    lookupGrant: vi.fn<GrantLookup>(async () => record),
  };
}

describe("authorizePreview", () => {
  it("returns the job and grant for a valid viewer grant on a done job", async () => {
    const d = deps(job("done"));
    await expect(authorizePreview({ slug: "slug-1", viewerToken, ...d })).resolves.toEqual({ job: job("done"), grantId: GRANT_ID });
    expect(d.repo.previewJob).toHaveBeenCalledWith("slug-1");
    expect(d.lookupGrant).toHaveBeenCalledWith(JOB_ID, GRANT_ID);

    const partial = deps(job("partial"));
    await expect(authorizePreview({ slug: "slug-1", viewerToken, ...partial })).resolves.toEqual({ job: job("partial"), grantId: GRANT_ID });
  });

  it.each(["queued", "collecting", "scoring", "persisting", "failed"])("returns null for status %s", async (status) => {
    const d = deps(job(status));
    await expect(authorizePreview({ slug: "slug-1", viewerToken, ...d })).resolves.toBeNull();
    expect(d.lookupGrant).not.toHaveBeenCalled();
  });

  it("returns null for no cookie, an expired grant, a revoked grant and another job's grant", async () => {
    const none = deps(job());
    await expect(authorizePreview({ slug: "slug-1", viewerToken: null, ...none })).resolves.toBeNull();
    expect(none.lookupGrant).not.toHaveBeenCalled();

    const expired = deps(job(), grant({ expires_at: new Date(Date.now() - 1000).toISOString() }));
    await expect(authorizePreview({ slug: "slug-1", viewerToken, ...expired })).resolves.toBeNull();

    const revoked = deps(job(), grant({ revoked_at: new Date(Date.now() - 1000).toISOString() }));
    await expect(authorizePreview({ slug: "slug-1", viewerToken, ...revoked })).resolves.toBeNull();

    const otherJob = deps(job(), grant({ job_id: OTHER_JOB_ID }));
    await expect(authorizePreview({ slug: "slug-1", viewerToken, ...otherJob })).resolves.toBeNull();

    const missing = deps(job(), null);
    await expect(authorizePreview({ slug: "slug-1", viewerToken, ...missing })).resolves.toBeNull();

    const wrongToken = deps(job());
    await expect(
      authorizePreview({ slug: "slug-1", viewerToken: { grantId: GRANT_ID, rawToken: createViewerToken().rawToken }, ...wrongToken }),
    ).resolves.toBeNull();

    const failing = {
      repo: { previewJob: vi.fn<PreviewJobLookup>(async () => job()) },
      lookupGrant: vi.fn<GrantLookup>(async () => {
        throw new Error("down");
      }),
    };
    await expect(authorizePreview({ slug: "slug-1", viewerToken, ...failing })).resolves.toBeNull();
  });

  it("returns null for an unknown slug without looking up any grant", async () => {
    const d = deps(null);
    await expect(authorizePreview({ slug: "missing", viewerToken, ...d })).resolves.toBeNull();
    expect(d.lookupGrant).not.toHaveBeenCalled();
  });
});
