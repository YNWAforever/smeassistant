"use client";

import Link from "next/link";
import { ConversationDocuments, ConversationConnectors } from "./conversation-resources";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { copy, type PrototypeLocale } from "@/lib/copy";
import { resourceCopy } from "@/lib/copy-conversation-resources";
import { conversationCopy } from "@/lib/copy-conversation";
import { CONVERSATION_LIMITS, conversationScopeKey, readConversationThreads, saveConversationChanges, type ConversationSave, type ConversationScope, type LocalThread } from "@/lib/workspace/conversation-store";
import { TEMPLATES, type TemplateKey } from "@/lib/workspace/templates";

/** The six entry points reference the existing workflow catalog; they never run a workflow. */
const TEMPLATE_KEYS: readonly TemplateKey[] = ["review-response", "review-request", "social-post", "gbp-post", "visibility-content", "website-basics"];
const ENTRY_TEMPLATES = TEMPLATE_KEYS.map(key => TEMPLATES.find(template => template.key === key)!);
export interface ConversationAction { id: string; title: string; versionId?: string }
export interface ConversationViewProps {
  locale: PrototypeLocale;
  workspaceSlug: string;
  workspaceName: string;
  location: string;
  locationName: string;
  scope: ConversationScope;
  initialThreadId?: string;
  actions: ConversationAction[];
  resources?: { canManage: boolean };
  connectionOutcome?: string;
}

const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** Hydrate before reading browser storage; remount before a new scope can show old notes. */
export function ConversationView(props: ConversationViewProps) {
  const hydrated = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  return hydrated ? <ScopedConversation key={conversationScopeKey(props.scope)} {...props} /> : <p role="status">{conversationCopy[props.locale].loading}</p>;
}

function ScopedConversation({ locale, workspaceSlug, workspaceName, location, locationName, scope, initialThreadId, actions, resources, connectionOutcome }: ConversationViewProps) {
  const t = conversationCopy[locale];
  const router = useRouter();
  const base = `/${locale}/owner/${workspaceSlug}`;
  const locationQuery = `location=${encodeURIComponent(location)}`;
  const [local, setLocal] = useState(() => {
    try { return readConversationThreads(window.localStorage, scope); }
    catch { return { status: "unavailable" as const, threads: [] as LocalThread[] }; }
  });
  const [selectedId, setSelectedId] = useState(initialThreadId);
  const [composer, setComposer] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<"unavailable" | "limit" | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const pendingIds = useRef(new Set<string>());
  // Adjust before rendering changed query props, so back/forward never shows another thread.
  const [lastThreadParam, setLastThreadParam] = useState(initialThreadId);
  if (lastThreadParam !== initialThreadId) {
    setLastThreadParam(initialThreadId);
    if (selectedId !== initialThreadId) { setSelectedId(initialThreadId); setComposer(""); setSaved(false); }
  }
  const selected = local.threads.find(thread => thread.id === selectedId);
  const missing = selectedId !== undefined && !selected;
  const actionHref = (action: ConversationAction, version = false) => `${base}/actions/${encodeURIComponent(action.id)}?${locationQuery}${version && action.versionId ? `&version=${encodeURIComponent(action.versionId)}` : ""}`;

  function selectThread(id?: string) {
    setSelectedId(id); setComposer(""); setSaved(false);
    router.replace(`${base}/conversation?${locationQuery}${id ? `&thread=${encodeURIComponent(id)}` : ""}`, { scroll: false });
  }
  function persist(next: LocalThread, savedNote = false) {
    const threads = [next, ...local.threads.filter(thread => thread.id !== next.id)];
    pendingIds.current.add(next.id);
    let result: ConversationSave;
    try { result = saveConversationChanges(window.localStorage, scope, threads.filter(thread => pendingIds.current.has(thread.id))); }
    catch { result = { status: "unavailable" }; }
    if (result.status === "saved") {
      pendingIds.current.clear();
      setLocal({ status: "ready", threads: result.threads });
    } else {
      setLocal({ status: result.status === "corrupt" ? "corrupt" : local.status, threads });
    }
    setSaved(savedNote && result.status === "saved");
    setSaveError(result.status === "saved" || result.status === "corrupt" ? null : result.status === "invalid" ? "limit" : "unavailable");
  }
  function saveNote(event: FormEvent) {
    event.preventDefault();
    const note = composer.trim();
    if (!note || missing || local.status === "corrupt") return;
    if ((selected ? selected.notes.length >= CONVERSATION_LIMITS.notes : local.threads.length >= CONVERSATION_LIMITS.threads) || note.length > CONVERSATION_LIMITS.noteLength) { setSaveError("limit"); return; }
    const now = new Date().toISOString();
    const next = selected
      ? { ...selected, notes: [...selected.notes, note], updatedAt: now }
      : { id: crypto.randomUUID(), title: note.slice(0, CONVERSATION_LIMITS.titleLength), notes: [note], actionIds: [], createdAt: now, updatedAt: now };
    persist(next, true);
    setComposer("");
    if (!selected) { setSelectedId(next.id); router.replace(`${base}/conversation?${locationQuery}&thread=${encodeURIComponent(next.id)}`, { scroll: false }); }
  }
  function linkAction(id: string) {
    if (!selected || !actions.some(action => action.id === id) || selected.actionIds.includes(id)) return;
    if (selected.actionIds.length >= CONVERSATION_LIMITS.actionIds) { setSaveError("limit"); return; }
    const next = { ...selected, actionIds: [...selected.actionIds, id], updatedAt: new Date().toISOString() };
    persist(next);
  }
  function citeDocument(id: string) {
    if (!selected || local.status === "corrupt" || selected.documentVersionIds?.includes(id)) return;
    if ((selected.documentVersionIds?.length ?? 0) >= 20) { setSaveError("limit"); return; }
    persist({ ...selected, documentVersionIds: [...(selected.documentVersionIds ?? []), id], updatedAt: new Date().toISOString() });
  }
  return <div className="conversation-page">
    <header className="conversation-intro"><span className="conversation-eyebrow">{t.preview}</span><h1>{t.title}</h1><p>{t.lead}</p></header>
    {resources && connectionOutcome && <p role="status">{connectionOutcome === "ok" ? resourceCopy[locale].oauthConnected : connectionOutcome === "declined" ? resourceCopy[locale].oauthDeclined : resourceCopy[locale].oauthFailed}</p>}
    <p className="limitation-note">{t.privacy}</p>
    <div className="conversation-layout">
      <aside className="conversation-threads" aria-label={t.threads}>
        <div className="conversation-section-heading"><h2>{t.threads}</h2><Button variant="outline" onClick={() => selectThread()}>{t.newThread}</Button></div>
        {local.threads.length === 0 ? <p>{t.empty}</p> : <ul>{local.threads.map(thread => <li key={thread.id}><button type="button" className={selectedId === thread.id ? "is-active" : ""} aria-pressed={selectedId === thread.id} onClick={() => selectThread(thread.id)}>{thread.title}</button></li>)}</ul>}
      </aside>
      <section className="conversation-work" aria-label={t.switchLabel}>
        {local.status === "corrupt" && <p role="alert">{t.corrupt}</p>}
        {(saveError || local.status === "unavailable") && <p role="alert">{saveError === "limit" ? t.limit : t.unavailable}</p>}
        {missing ? <p role="status">{t.missing}</p> : <>
          {selected && <div className="conversation-notes"><h2>{selected.title}</h2>{selected.notes.map((note, index) => <p className="conversation-note" key={index}>{note}</p>)}
            <label htmlFor="conversation-action">{t.linkAction}</label>
            <select id="conversation-action" value="" onChange={event => linkAction(event.target.value)} disabled={local.status === "corrupt"}><option value="">{t.chooseAction}</option>{actions.filter(action => !selected.actionIds.includes(action.id)).map(action => <option value={action.id} key={action.id}>{action.title}</option>)}</select>
            <ul className="conversation-linked-actions">{selected.actionIds.map(id => { const action = actions.find(item => item.id === id); return <li key={id}>{action ? <><Link href={actionHref(action)}>{action.title}</Link>{action.versionId && <Link href={actionHref(action, true)}>{t.openVersion}</Link>}</> : <span>{t.actionUnavailable}</span>}</li>; })}</ul>
          </div>}
          <form className="conversation-composer" onSubmit={saveNote}>
            <label htmlFor="conversation-note">{t.note}</label>
            <textarea id="conversation-note" ref={composerRef} value={composer} maxLength={CONVERSATION_LIMITS.noteLength} rows={4} placeholder={t.placeholder} disabled={local.status === "corrupt"} onChange={event => { setComposer(event.target.value); setSaved(false); }} />
            <Button type="submit" disabled={!composer.trim() || local.status === "corrupt"}>{t.save}</Button>
            {saved && <p role="status">{t.saved}</p>}
          </form>
          {!selected && <section className="conversation-templates" aria-label={t.templates}><h2>{t.templates}</h2><p>{t.templateHint}</p><div>{ENTRY_TEMPLATES.map(template => { const title = copy[locale].workspace.templates[template.key].title; return <button type="button" key={template.key} aria-label={`${t.useTemplate} ${title}`} onClick={() => { setComposer(title); setSaved(false); composerRef.current?.focus(); }}>{title}</button>; })}</div></section>}
        </>}
        <p className="limitation-note">{t.boundary}</p>
        {resources && <ConversationDocuments key={selectedId ?? "new"} locale={locale} workspaceId={scope.workspaceId} locationId={scope.locationId} canManage={resources.canManage} citedIds={selected?.documentVersionIds ?? []} canCite={Boolean(selected) && local.status !== "corrupt"} onCite={citeDocument} />}
        <section className="conversation-continue"><h2>{t.continueWork}</h2>{actions.length === 0 ? <p>{t.noActions}</p> : <ul>{actions.slice(0, 6).map(action => <li key={action.id}><Link href={actionHref(action)}>{action.title}</Link>{action.versionId && <Link href={actionHref(action, true)}>{t.openVersion}</Link>}</li>)}</ul>}<Link href={`${base}/actions?${locationQuery}`}>{t.allActions}</Link></section>
      </section>
      <aside className="conversation-context"><h2>{t.context}</h2><strong>{workspaceName}</strong><p>{locationName || copy[locale].shell.allLocations}</p><Link href={`${base}/business?${locationQuery}`}>{t.shop}</Link><Link href={`${base}/insights?${locationQuery}`}>{t.insights}</Link><Link href={`${base}/business/integrations?${locationQuery}`}>{t.integrations}</Link>{resources && <ConversationConnectors locale={locale} workspaceId={scope.workspaceId} locationId={scope.locationId} workspaceSlug={workspaceSlug} locationSlug={location} canManage={resources.canManage} />}</aside>
    </div>
  </div>;
}
