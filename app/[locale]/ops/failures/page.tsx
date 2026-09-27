import type { Metadata } from "next";

import { OpsNav } from "@/components/ops/ops-nav";
import { ReleaseButton } from "@/components/ops/release-button";
import { requireOperator } from "@/lib/auth/operator";
import { pauseState } from "@/lib/budgets/pause";
import { FAILURE_KINDS, isFailureKind, type FailureItem, type FailureKind, type OperatorHealth } from "@/lib/ops/failure-types";
import { problemReasonLabel } from "@/lib/ops/problem-copy";
import { parseFailureSearch } from "@/lib/ops/references";
import { failuresRepository } from "@/lib/repositories/failures";

export const dynamic = "force-dynamic";
/** Unlisted internal tooling: never index it, and never link to it from a merchant surface. */
export const metadata: Metadata = { title: "Failures", robots: { index: false, follow: false } };

const KIND_LABELS: Record<FailureKind, string> = {
  scan_failed: "Failed scan",
  scan_dead_lettered: "Stuck scan (dead-lettered)",
  draft_failed: "Failed draft",
  google_connection: "Google connection",
  workspace_processing: "Workspace post-processing",
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The operator failure queue (P3.5b, spec §3). English by the same recorded
 * exception as /ops/access-requests. Cross-tenant, but it shows no personal
 * data (the reader selects allowlisted columns only) and links to no owner
 * page: operators hold no membership. Queue views are not audited, following
 * the access-request precedent; releases are.
 */
export default async function OpsFailuresPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOperator();
  const paused = pauseState();
  const { locale } = await params;
  const query = searchParams ? await searchParams : {};
  const kindParam = first(query.kind);
  const kind = isFailureKind(kindParam) ? kindParam : null;
  const q = first(query.q) ?? "";
  const search = parseFailureSearch(q);

  let data: { items: FailureItem[]; health: OperatorHealth } | null = null;
  let failed = false;
  if (search !== "invalid") {
    const searchKinds = search?.kinds ?? null;
    const kinds = kind ? (searchKinds && !searchKinds.includes(kind) ? [] : [kind]) : searchKinds;
    try {
      const repo = failuresRepository();
      const [items, health] = await Promise.all([
        repo.list({ kinds, hexPrefix: search?.hexPrefix ?? null, uuid: search?.uuid ?? null, workspaceId: null, limit: 200 }),
        repo.health(),
      ]);
      data = { items, health };
    } catch {
      console.error("[ops] failures_unavailable", { category: "ops_failures_unavailable" });
      failed = true;
    }
  }

  return (
    <div className="settings-page">
      <OpsNav locale={locale} current="failures" />
      <h1>Failures</h1>
      {(paused.scans || paused.ai) && (
        <p className="limitation-note" role="status">
          {[paused.scans && "Scans are paused (SCANS_PAUSED).", paused.ai && "AI drafting is paused (AI_DRAFTS_PAUSED)."].filter(Boolean).join(" ")} See the incident runbook.
        </p>
      )}
      <p>Open problems across every workspace, newest first. Owners retry their own scans and drafts; the only operator control is releasing a stuck scan.</p>

      <form method="get" className="flex flex-wrap gap-3" role="search">
        <select name="kind" defaultValue={kind ?? ""} aria-label="Kind">
          <option value="">All kinds</option>
          {FAILURE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
        </select>
        <input name="q" defaultValue={q} placeholder="SCAN-…, RUN-…, CONN-… or a full id" aria-label="Reference or id" />
        <button type="submit">Filter</button>
      </form>

      {search === "invalid" && <p className="limitation-note" role="status">Search by a SCAN-, RUN- or CONN- reference, or a full id.</p>}
      {failed && <p className="limitation-note" role="alert">The failure queue could not be loaded. Nothing below is a sign that there are no failures.</p>}

      {data && (
        <>
          <section aria-label="Health">
            <h2>Health</h2>
            <ul>
              <li>Failed scans: {data.health.recent.scan_failed.day} in 24 h · {data.health.recent.scan_failed.week} in 7 days</li>
              <li>Failed draft runs: {data.health.recent.draft_failed.day} in 24 h · {data.health.recent.draft_failed.week} in 7 days</li>
              <li>Open now: {data.health.open.scan_dead_lettered} stuck scans · {data.health.open.google_connection} Google connections · {data.health.open.workspace_processing} post-processing</li>
            </ul>
            {data.health.categories.length > 0 && (
              <table>
                <caption>Failed scans by category</caption>
                <thead><tr><th>Category</th><th>24 h</th><th>7 days</th></tr></thead>
                <tbody>{data.health.categories.map((row) => <tr key={row.category}><td>{row.category}</td><td>{row.day}</td><td>{row.week}</td></tr>)}</tbody>
              </table>
            )}
          </section>

          <section aria-label="Queue">
            <h2>Queue</h2>
            {data.items.length === 0 ? (
              <p>No open failures match.</p>
            ) : (
              <div className="compact-action-list">
                {data.items.map((item) => (
                  <div key={`${item.kind}:${item.id}`}>
                    <div>
                      <strong>{KIND_LABELS[item.kind]} · {item.reference}</strong>
                      <small>
                        {item.businessName}
                        {item.workspace?.slug ? ` · workspace ${item.workspace.slug}` : " · no workspace"}
                        {` · ${item.reason} — ${problemReasonLabel("en", item.reason)}`}
                        {item.attempts !== null ? ` · ${item.attempts} attempts` : ""}
                        {` · ${item.occurredAt}`}
                        {item.correlationId ? ` · correlation ${item.correlationId}` : ""}
                      </small>
                    </div>
                    {item.operatorAction === "release" && <ReleaseButton jobId={item.id} />}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
