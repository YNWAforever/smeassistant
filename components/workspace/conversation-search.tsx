"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { PrototypeLocale } from "@/lib/copy";
import { searchCopy } from "@/lib/copy-search-gap";
import { resourceCopy } from "@/lib/copy-conversation-resources";
import type { ConnectorContext } from "@/lib/connectors/types";
import type { Observation, SearchRecord } from "@/lib/workspace/search-gap";

interface Props { locale: PrototypeLocale; workspaceId: string; locationId: string; workspaceSlug: string; locationSlug: string; canManage: boolean }
async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const data = await response.json();
  if (!response.ok) throw new Error("unavailable");
  return data as T;
}

/** Parent remounts by account/workspace/location. No thread text or browser draft is submitted. */
export function ConversationSearch(props: Props) {
  return props.locationId === "all" ? <section className="conversation-resources" aria-label={searchCopy[props.locale].title}><h2>{searchCopy[props.locale].title}</h2><p className="conversation-empty">{searchCopy[props.locale].selectLocation}</p></section> : <ScopedSearch key={`${props.workspaceId}:${props.locationId}`} {...props} />;
}
function ScopedSearch({ locale, workspaceId, locationId, workspaceSlug, locationSlug, canManage }: Props) {
  const t = searchCopy[locale], rt = resourceCopy[locale], api = `/api/workspaces/${encodeURIComponent(workspaceId)}/conversation/search`;
  const [records, setRecords] = useState<SearchRecord[]>([]), [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false), [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(false), [refresh, setRefresh] = useState(0);
  const [showBrief, setShowBrief] = useState(false), [confirmed, setConfirmed] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [observation, setObservation] = useState<{ observation: Observation; source: ConnectorContext } | null>(null);
  const active = useRef(true), locked = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    // Opening a disclosure is not a request to read the saved library.
    if (refresh === 0) return;
    const controller = new AbortController();
    request<{ records: SearchRecord[] }>(`${api}?location_id=${encodeURIComponent(locationId)}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { if (!Array.isArray(data.records)) throw new Error("invalid_response"); setRecords(data.records); setLoaded(true); setLoading(false); } })
      .catch(() => { if (!controller.signal.aborted) { setError(true); setLoading(false); } });
    return () => controller.abort();
  }, [api, locationId, refresh]);
  const selected = records.find(row => row.id === selectedId);
  function choose(id: string) { setSelectedId(id); setShowBrief(false); setConfirmed(false); setObservation(null); setCheckedAt(null); setError(false); }
  async function run(operation: "read" | "approve" | "observe") {
    if (locked.current || !canManage || operation !== "read" && !selected || operation === "approve" && !confirmed) return;
    locked.current = true; setBusy(true); setError(false); setObservation(null);
    try {
      const data = await request<{ record?: SearchRecord; checkedAt?: string; observation?: Observation; source?: ConnectorContext }>(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation, location_id: locationId, ...(operation !== "read" ? { id: selected!.id } : {}), ...(operation === "approve" ? { confirmed: true } : {}) }) });
      if (active.current) {
        if (data.record) { const record = data.record; setRecords(rows => [record, ...rows.filter(row => row.id !== record.id)].slice(0, 50)); setSelectedId(record.id); setConfirmed(false); if (operation === "read") { setShowBrief(false); setCheckedAt(data.checkedAt ?? null); } }
        else if (data.observation && data.source) setObservation({ observation: data.observation, source: data.source });
        else throw new Error("invalid_response");
      }
    } catch { if (active.current) setError(true); }
    finally { locked.current = false; if (active.current) setBusy(false); }
  }
  const source = (context: ConnectorContext) => <p className="search-provenance">{t.source}: Google Search Console · {context.scope || "—"} · {context.observedAt ? new Date(context.observedAt).toLocaleString(locale) : rt.never}{context.analytics && <> · {context.analytics.country} · {context.analytics.startDate} – {context.analytics.endDate} · PT · web · query · {context.analytics.pageFilter}</>}</p>;
  const brief = selected?.brief?.[locale];
  return <section className="conversation-resources conversation-search" aria-label={t.title}>
    <h2>{t.title}</h2><p>{t.lead}</p><p className="limitation-note conversation-panel-note">{t.limits}</p>
    {error && <p role="alert">{t.failed}</p>}
    <div className="search-controls"><Button disabled={!canManage || busy || loading} onClick={() => void run("read")}>{busy ? t.loading : selected ? t.refresh : t.read}</Button>
      <Button variant="outline" disabled={loading || busy} onClick={() => { setLoading(true); setError(false); setRefresh(value => value + 1); }}>{t.retry}</Button></div>
    {loading && <p role="status">{t.loading}</p>}
    {checkedAt && <p className="search-provenance">{t.checkedAt}: {new Date(checkedAt).toLocaleString(locale)}</p>}
    {!canManage && <p>{t.ownerOnly}</p>}
    <div className="conversation-field search-saved-reads"><label htmlFor="conversation-search-record">{t.records}</label>
      <select id="conversation-search-record" value={selectedId ?? ""} disabled={busy || loading || (!loaded && records.length === 0)} onChange={event => choose(event.target.value)}><option value="">{records.length ? t.chooseRead : loaded ? t.noRecords : t.notLoaded}</option>{records.map(row => <option key={row.id} value={row.id}>{new Date(row.createdAt).toLocaleString(locale)} · {row.approvedAt ? t.approved : t.pending}</option>)}</select>
    </div>
    {selected && <article className="search-result">
      <p role="status" className="conversation-panel-state">{t.reasons[selected.gap.reason]}</p>
      <p className="search-source-state">{rt.states[selected.gap.status === "unavailable" ? selected.gap.source.status : selected.gap.status]}</p>{source(selected.gap.source)}
      {selected.gap.queries.length > 0 && <><h3>{t.queries}</h3><ul className="search-queries">{selected.gap.queries.map(row => <li key={row.title}>{row.title} · {t.impressions}: {row.metrics?.impressions} · {t.clicks}: {row.metrics?.clicks}</li>)}</ul></>}
      {brief && <>
        <Button variant="outline" disabled={busy} onClick={() => setShowBrief(true)}>{t.createBrief}</Button>
        {(showBrief || selected.approvedAt) && <div className="search-brief"><p className="search-brief-state">{selected.approvedAt ? t.approved : t.draft}</p><h3>{brief.title}</h3><p>{brief.missing}</p><p>{brief.why}</p><ol>{brief.steps.map(step => <li key={step}>{step}</li>)}</ol><p className="search-provenance">{brief.citation}</p>
          {selected.approvedAt ? <div className="search-approved-actions">
            <p>{new Date(selected.approvedAt).toLocaleString(locale)}</p>
            <Link href={`/${locale}/owner/${workspaceSlug}/actions/${encodeURIComponent(selected.actionId!)}?location=${encodeURIComponent(locationSlug)}`}>{t.openAction}</Link>
            <p className="limitation-note">{t.observeNote}</p><Button variant="outline" disabled={busy || !canManage} onClick={() => void run("observe")}>{t.observe}</Button>
          </div> : canManage ? <div className="search-confirm-actions"><label className="search-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />{t.confirmLabel}</label><Button disabled={!confirmed || busy} onClick={() => void run("approve")}>{t.approve}</Button></div> : <p>{t.ownerOnly}</p>}
        </div>}
      </>}
      {observation && <div className="search-observation"><p role="status">{t.observations[observation.observation.reason]}</p>{source(observation.source)}
        {observation.observation.status === "ready" && <><p>{t.before}: {observation.observation.baseline?.startDate} – {observation.observation.baseline?.endDate}<br />{t.after}: {observation.observation.later?.startDate} – {observation.observation.later?.endDate}</p><div className="search-table"><table><caption>{t.observations.comparable}</caption><thead><tr><th>{t.query}</th><th>{t.before} · {t.clicks}</th><th>{t.after} · {t.clicks}</th><th>{t.before} · {t.impressions}</th><th>{t.after} · {t.impressions}</th></tr></thead><tbody>{observation.observation.rows.map(row => <tr key={row.query}><th scope="row">{row.query}</th><td>{row.beforeClicks}</td><td>{row.afterClicks}</td><td>{row.beforeImpressions}</td><td>{row.afterImpressions}</td></tr>)}</tbody></table></div></>}
      </div>}
    </article>}
  </section>;
}
