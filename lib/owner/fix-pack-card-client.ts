/**
 * Fetch-calling logic for the FixPackCard, extracted out of the component so
 * it can be unit tested with a stubbed fetch -- same split as team-client.ts
 * (no @testing-library/react in this repo; vitest runs in a Node env).
 *
 * Failures collapse to { ok: false } with no error text: the card renders one
 * generic translated failure label, never raw server strings (the
 * notification-preferences card's established pattern).
 *
 * Ported from upstream's lib/owner/fix-pack-card-client.ts; only the route
 * paths changed (this app mounts the owner routes at /api/workspaces/[id]/…).
 */
export interface OwnerFixPackDraft {
  id: string;
  jobId: string;
  businessName: string | null;
  findingLabel: string;
  agentKey: string;
  status: string;
  draftText: string | null;
  reviewExcerpt: string | null;
  reviewRating: number | null;
  createdAt: string;
}

export async function listDrafts(
  workspaceId: string,
  locale: string,
): Promise<{ ok: true; drafts: OwnerFixPackDraft[] } | { ok: false }> {
  try {
    const response = await fetch(`/api/workspaces/${workspaceId}/fix-pack-drafts?locale=${encodeURIComponent(locale)}`);
    if (!response.ok) return { ok: false };
    const body = (await response.json()) as { drafts?: unknown };
    if (!Array.isArray(body.drafts)) return { ok: false };
    return { ok: true, drafts: body.drafts as OwnerFixPackDraft[] };
  } catch {
    return { ok: false };
  }
}

export async function reviewDraft(
  workspaceId: string,
  runId: string,
  status: "approved" | "rejected",
): Promise<{ ok: boolean }> {
  try {
    const response = await fetch(`/api/workspaces/${workspaceId}/fix-pack-drafts/${encodeURIComponent(runId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    return { ok: response.ok };
  } catch {
    return { ok: false };
  }
}
