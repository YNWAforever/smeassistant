import { authorizeReport, type ViewerGrantRecord } from "@/lib/report-access/authorize-report";
import type { PresentedViewerToken } from "@/lib/report-access/token";
import { previewRepository, type PreviewJob } from "@/lib/repositories/previews";
import { reportsRepository } from "@/lib/repositories/reports";

/**
 * Who may ask for an unsaved preview draft (spec §2.5 steps 3–4): only the
 * holder of a valid viewer grant (the unlock cookie) for the job the slug
 * resolves to, and only once that job finished as `done` or `partial`.
 *
 * `authorizeReport` decides the grant. It gets no staff user and no workspace
 * membership, so a session, member or staff identity alone never qualifies,
 * and no `markUsed`, so checking eligibility leaves the grant untouched.
 * Every other outcome is `null`, which the route answers with a 404.
 */
export interface AuthorizePreviewInput {
  slug: string;
  viewerToken: PresentedViewerToken | null;
  repo?: Pick<ReturnType<typeof previewRepository>, "previewJob">;
  lookupGrant?: (jobId: string, grantId: string) => Promise<ViewerGrantRecord | null>;
}

const ELIGIBLE_STATUSES: ReadonlySet<string> = new Set(["done", "partial"]);

export async function authorizePreview({
  slug,
  viewerToken,
  repo = previewRepository(),
  lookupGrant = (jobId, grantId) => reportsRepository().findViewerGrant(jobId, grantId),
}: AuthorizePreviewInput): Promise<{ job: PreviewJob; grantId: string } | null> {
  const job = await repo.previewJob(slug);
  if (!job || !ELIGIBLE_STATUSES.has(job.status)) return null;

  const access = await authorizeReport({
    job: { id: job.id },
    viewerToken,
    staffUser: null,
    workspaceMembership: null,
    lookupGrant: (grantId) => lookupGrant(job.id, grantId),
  });
  return access.kind === "viewer" ? { job, grantId: access.grantId } : null;
}
