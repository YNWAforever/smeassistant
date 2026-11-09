"use client";

import Link from "next/link";
import { ArrowRight, ArrowUp, FileText, Globe, ListChecks, Megaphone, MessageSquare, MessagesSquare, Paperclip, PenLine, Plug, Plus, Search, Store } from "lucide-react";
import { ConversationDocuments, ConversationConnectors } from "./conversation-resources";
import { ConversationSearch } from "./conversation-search";
import { PostDraftCoach, type ConfirmedPostDraft } from "./post-draft-coach";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { copy, type PrototypeLocale } from "@/lib/copy";
import { resourceCopy } from "@/lib/copy-conversation-resources";
import { conversationCopy } from "@/lib/copy-conversation";
import { conversationDesignCopy, type ConversationCategory } from "@/lib/copy-conversation-design";
import { studioText } from "@/lib/studio/copy";
import { importStudioConversation, importStudioConversationsBulk } from "@/lib/studio/client";
import { readConversationImports, saveConversationImports, type ConversationImports } from "@/lib/workspace/conversation-imports";
import { searchCopy } from "@/lib/copy-search-gap";
import { openConversationTool, useConversationNavigation } from "./conversation-navigation";
import { CONVERSATION_LIMITS, conversationScopeKey, readConversationThreads, saveConfirmedPostDraft, saveConversationChanges, type ConversationSave, type ConversationScope, type LocalThread } from "@/lib/workspace/conversation-store";
import { formatDateTime } from "@/lib/workspace/format";
import type { TemplateKey } from "@/lib/workspace/templates";

/** The six entry points reference the existing workflow catalog; they never run a workflow. */
const TEMPLATE_KEYS = ["review-response", "review-request", "social-post", "gbp-post", "visibility-content", "website-basics"] as const satisfies readonly TemplateKey[];
const TEMPLATE_PRESENTATION = {
  "review-response": { icon: MessageSquare, category: "content" },
  "review-request": { icon: ListChecks, category: "start" },
  "social-post": { icon: PenLine, category: "content" },
  "gbp-post": { icon: Megaphone, category: "content" },
  "visibility-content": { icon: Search, category: "search" },
  "website-basics": { icon: FileText, category: "start" },
} as const;
export interface ConversationAction { id: string; title: string; versionId?: string }
export interface ConversationToday { open: number; drafts: number; completed: number }
export interface ConversationViewProps {
  locale: PrototypeLocale;
  timezone: string;
  workspaceSlug: string;
  workspaceName: string;
  location: string;
  locationName: string;
  scope: ConversationScope;
  initialThreadId?: string;
  actions: ConversationAction[];
  today?: ConversationToday;
  resources?: { canManage: boolean };
  connectionOutcome?: string;
  /** Persistent, model-backed Studio mode (CONVERSATION_STUDIO_ENABLED). */
  studioEnabled?: boolean;
  /** The member's persistent Studio discussions, shown next to local threads. */
  studioConversations?: Array<{ id: string; title: string; lastMessageAt: string }>;
}

const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** Hydrate before reading browser storage; remount before a new scope can show old notes. */
export function ConversationView(props: ConversationViewProps) {
  const hydrated = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  return hydrated ? <ScopedConversation key={conversationScopeKey(props.scope)} {...props} /> : <p role="status">{conversationCopy[props.locale].loading}</p>;
}

function ScopedConversation({ locale, timezone, workspaceSlug, workspaceName, location, locationName, scope, initialThreadId, actions, today, resources, connectionOutcome, studioEnabled, studioConversations }: ConversationViewProps) {
  const t = conversationCopy[locale];
  const d = conversationDesignCopy[locale];
  const navigation = useConversationNavigation();
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
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(false);
  const [imports, setImports] = useState<ConversationImports>(() => {
    try { return readConversationImports(window.localStorage, scope); }
    catch { return {}; }
  });
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkImportError, setBulkImportError] = useState(false);
  const [bulkImportDone, setBulkImportDone] = useState(false);
  // Server-first workbench: persistent discussions are primary; browser-only
  // notes stay available behind an explicit reveal (and via ?thread= links).
  const [legacyOpen, setLegacyOpen] = useState(Boolean(initialThreadId));
  const showLocal = !studioEnabled || legacyOpen;
  const [category, setCategory] = useState<ConversationCategory>("all");
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
  const unimportedLocal = local.threads.filter(thread => !imports[thread.id]);
  const persistentId = selected ? imports[selected.id] : undefined;
  const actionHref = (action: ConversationAction, version = false) => `${base}/actions/${encodeURIComponent(action.id)}?${locationQuery}${version && action.versionId ? `&version=${encodeURIComponent(action.versionId)}` : ""}`;
  const publishThreads = navigation?.setThreads;
  useEffect(() => {
    publishThreads?.(local.threads.slice(0, 5).map(({ id, title }) => ({ id, title })));
    return () => publishThreads?.([]);
  }, [local.threads, publishThreads]);

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
  async function continueInStudio() {
    if (!selected || importing) return;
    setImporting(true);
    setImportError(false);
    const result = await importStudioConversation(scope.workspaceId, {
      locationId: scope.locationId === "all" ? null : scope.locationId,
      title: selected.title,
      notes: selected.notes,
      documentVersionIds: selected.documentVersionIds?.slice(0, 5),
    });
    setImporting(false);
    if (result.ok) {
      try {
        const saved = saveConversationImports(window.localStorage, scope, { [selected.id]: result.data.id });
        if (saved) setImports(saved);
      } catch { /* the mapping is a convenience; navigation still works */ }
      router.push(`${base}/conversation/studio?chat=${encodeURIComponent(result.data.id)}&${locationQuery}`);
    } else {
      setImportError(true);
    }
  }
  async function importAllToStudio() {
    if (!studioEnabled || bulkImporting || !unimportedLocal.length) return;
    setBulkImporting(true);
    setBulkImportError(false);
    setBulkImportDone(false);
    const result = await importStudioConversationsBulk(scope.workspaceId, {
      locationId: scope.locationId === "all" ? null : scope.locationId,
      threads: unimportedLocal.map(thread => ({
        title: thread.title,
        notes: thread.notes,
        documentVersionIds: thread.documentVersionIds?.slice(0, 5),
      })),
    });
    setBulkImporting(false);
    if (!result.ok) {
      setBulkImportError(true);
      return;
    }
    const entries: ConversationImports = {};
    unimportedLocal.forEach((thread, index) => {
      const conversation = result.data.conversations[index];
      if (conversation) entries[thread.id] = conversation.id;
    });
    try {
      const saved = saveConversationImports(window.localStorage, scope, entries);
      if (saved) setImports(saved);
    } catch { /* mapping is best-effort */ }
    setBulkImportDone(true);
  }
  function citeDocument(id: string) {
    if (!selected || local.status === "corrupt" || selected.documentVersionIds?.includes(id)) return;
    if ((selected.documentVersionIds?.length ?? 0) >= 20) { setSaveError("limit"); return; }
    persist({ ...selected, documentVersionIds: [...(selected.documentVersionIds ?? []), id], updatedAt: new Date().toISOString() });
  }
  function savePostDraft(draft: ConfirmedPostDraft) {
    try {
      return saveConfirmedPostDraft(window.localStorage, scope, draft) === "saved" ? "saved" as const : "failed" as const;
    } catch {
      return "failed" as const;
    }
  }
  return <div className="conversation-page">
    <header className="conversation-intro">
      <span className="conversation-eyebrow">{d.eyebrow}</span><h1>{t.title}</h1><p>{t.lead}</p>
      <div className="conversation-chips">
        <span><Store aria-hidden="true" />{workspaceName}{locationName && <> · {locationName}</>}</span>
        <span><Globe aria-hidden="true" />{d.language}</span>
        {resources && <><button type="button" onClick={() => openConversationTool("conversation-documents")}><Paperclip aria-hidden="true" />{d.documents}</button><button type="button" onClick={() => openConversationTool("conversation-sources")}><Plug aria-hidden="true" />{d.sources}</button></>}
      </div>
      {studioEnabled && <Link className="conversation-studio-entry" href={`/${locale}/owner/${workspaceSlug}/conversation/studio?${locationQuery}`}><MessagesSquare aria-hidden="true" />{studioText(locale).header.openStudio}<ArrowRight aria-hidden="true" /></Link>}
    </header>
    {resources && connectionOutcome && <p role="status">{connectionOutcome === "ok" ? resourceCopy[locale].oauthConnected : connectionOutcome === "declined" ? resourceCopy[locale].oauthDeclined : resourceCopy[locale].oauthFailed}</p>}
    <div className="conversation-layout">
      <section className="conversation-work" aria-label={t.switchLabel}>
        {local.status === "corrupt" && <p role="alert">{t.corrupt}</p>}
        {(saveError || local.status === "unavailable") && <p role="alert">{saveError === "limit" ? t.limit : t.unavailable}</p>}
        <PostDraftCoach key={`${locale}-${conversationScopeKey(scope)}`} locale={locale} onSaveTodo={savePostDraft} />
        <section className="conversation-today" aria-label={d.today}>
          <div className="conversation-section-heading"><h2><ListChecks aria-hidden="true" />{d.today}</h2><Link href={`${base}?${locationQuery}`}>{d.fullToday}<ArrowRight aria-hidden="true" /></Link></div>
          {today ? <><dl>{([[d.open, today.open], [d.awaiting, today.drafts], [d.completed, today.completed]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>{d.effort}</p></> : <p>{d.todayUnavailable}</p>}
        </section>
        {showLocal && (missing ? <p role="status">{t.missing}</p> : <>
          {selected && <section className="conversation-notes" aria-label={selected.title}>
            <header className="conversation-thread-heading"><span><MessagesSquare aria-hidden="true" />{d.local}</span><time dateTime={selected.updatedAt}>{formatDateTime(selected.updatedAt, locale, timezone)}</time><h2>{selected.title}</h2></header>
            <div className="conversation-note-stack">{selected.notes.map((note, index) => <p className="conversation-note" key={index}>{note}</p>)}</div>
            {studioEnabled && <div className="conversation-studio-bridge">
              {persistentId
                ? <Link href={`${base}/conversation/studio?chat=${encodeURIComponent(persistentId)}&${locationQuery}`}>{d.openPersistent}<ArrowRight aria-hidden="true" /></Link>
                : <Button type="button" size="sm" onClick={() => void continueInStudio()} disabled={importing}>{importing ? d.importing : d.continueInStudio}</Button>}
              {importError && <p role="alert">{d.importFailed}</p>}
            </div>}
            <div className="conversation-thread-links">
              <label htmlFor="conversation-action"><ListChecks aria-hidden="true" />{t.linkAction}</label>
              <select id="conversation-action" value="" onChange={event => linkAction(event.target.value)} disabled={local.status === "corrupt"}><option value="">{t.chooseAction}</option>{actions.filter(action => !selected.actionIds.includes(action.id)).map(action => <option value={action.id} key={action.id}>{action.title}</option>)}</select>
              <ul className="conversation-linked-actions">{selected.actionIds.map(id => { const action = actions.find(item => item.id === id); return <li key={id}>{action ? <><Link href={actionHref(action)}>{action.title}</Link>{action.versionId && <Link href={actionHref(action, true)}>{t.openVersion}<ArrowRight aria-hidden="true" /></Link>}</> : <span>{t.actionUnavailable}</span>}</li>; })}</ul>
            </div>
          </section>}
          <form className="conversation-composer" onSubmit={saveNote}>
            <label htmlFor="conversation-note">{t.note}</label>
            <textarea id="conversation-note" ref={composerRef} value={composer} maxLength={CONVERSATION_LIMITS.noteLength} rows={3} placeholder={t.placeholder} disabled={local.status === "corrupt"} onChange={event => { setComposer(event.target.value); setSaved(false); }} />
            <div className="conversation-composer-actions">
              {resources && <button className="conversation-attach" type="button" onClick={() => openConversationTool("conversation-documents")}><Paperclip aria-hidden="true" />{d.attach}{Boolean(selected?.documentVersionIds?.length) && <span>({selected!.documentVersionIds!.length})</span>}</button>}
              <Button type="submit" aria-label={t.save} disabled={!composer.trim() || local.status === "corrupt"}>{t.save}<ArrowUp aria-hidden="true" /></Button>
            </div>
            {saved && <p role="status">{t.saved}</p>}
          </form>
          <p className="conversation-local-note">{d.localNote}</p>
          {!selected && <section id="conversation-templates" className="conversation-template-section" aria-label={t.templates}>
            <h2>{d.templates}</h2>
            <div className="conversation-filters" role="group" aria-label={d.filters}>{(Object.keys(d.categories) as ConversationCategory[]).map(key => <button key={key} type="button" aria-pressed={category === key} onClick={() => setCategory(key)}>{d.categories[key]}</button>)}</div>
            <div className="conversation-templates">{TEMPLATE_KEYS.filter(key => category === "all" || TEMPLATE_PRESENTATION[key].category === category).map(key => {
              const title = copy[locale].workspace.templates[key].title, card = d.cards[key], Icon = TEMPLATE_PRESENTATION[key].icon;
              return <button type="button" key={key} aria-label={`${t.useTemplate} ${title}`} onClick={() => { setComposer(title); setSaved(false); composerRef.current?.focus(); }}><span className="conversation-template-meta"><Icon aria-hidden="true" /><span>{card.tag}</span></span><strong>{card.title}</strong><span>{card.description}</span></button>;
            })}</div>
            <p className="conversation-template-hint">{t.templateHint}</p>
          </section>}
        </>)}
        <section className="conversation-continue" aria-label={t.continueWork}>
          <div className="conversation-section-heading"><h2>{t.continueWork}</h2><Link href={`${base}/actions?${locationQuery}`}>{t.allActions}<ArrowRight aria-hidden="true" /></Link></div>
          {actions.length === 0 ? <p className="conversation-empty">{t.noActions}</p> : <ul>{actions.slice(0, 6).map(action => <li key={action.id}><span><Link href={actionHref(action)}>{action.title}</Link><small>{action.versionId ? d.savedVersion : t.openAction}</small>{studioEnabled && <Link className="conversation-discuss-link" href={`${base}/conversation/studio?action=${encodeURIComponent(action.id)}&${locationQuery}`}>{d.discussAction}</Link>}</span>{action.versionId ? <Link className="conversation-continue-link" href={actionHref(action, true)}>{t.openVersion}<ArrowRight aria-hidden="true" /></Link> : <Link className="conversation-continue-link" href={actionHref(action)}>{d.continue}<ArrowRight aria-hidden="true" /></Link>}</li>)}</ul>}
        </section>
        {studioEnabled && <section className="conversation-threads conversation-persistent" aria-label={d.persistent}>
          <div className="conversation-section-heading"><h2>{d.persistent}</h2><div className="conversation-persistent-actions">
            <Link href={`${base}/conversation/studio?${locationQuery}`}>{d.newPersistent}</Link>
            {unimportedLocal.length > 0 && <Button type="button" size="sm" variant="outline" onClick={() => void importAllToStudio()} disabled={bulkImporting}>{bulkImporting ? d.importingAll : `${d.importAll} (${unimportedLocal.length})`}</Button>}
            <Link href={`${base}/conversation/studio?${locationQuery}`}>{studioText(locale).header.openStudio}</Link>
          </div></div>
          {bulkImportError && <p role="alert">{d.importAllFailed}</p>}
          {bulkImportDone && <p role="status">{d.importAllDone}</p>}
          {studioConversations?.length ? <ul>{studioConversations.map(conversation => <li key={conversation.id}><MessagesSquare aria-hidden="true" /><Link href={`${base}/conversation/studio?chat=${encodeURIComponent(conversation.id)}&${locationQuery}`}><span>{conversation.title || studioText(locale).rail.untitled}</span><small><time dateTime={conversation.lastMessageAt}>{formatDateTime(conversation.lastMessageAt, locale, timezone)}</time></small></Link><ArrowRight aria-hidden="true" /></li>)}</ul> : <p className="conversation-empty">{d.persistentEmpty}</p>}
        </section>}
        {studioEnabled && !legacyOpen ? (
          <section id="conversation-recent" className="conversation-threads conversation-legacy" aria-label={d.legacyNotes}>
            <div className="conversation-section-heading"><h2>{d.legacyNotes} ({local.threads.length})</h2><Button type="button" variant="outline" size="sm" onClick={() => setLegacyOpen(true)}>{d.legacyNotes}</Button></div>
            <p className="conversation-legacy-hint">{d.legacyHint}</p>
          </section>
        ) : (
          <section id="conversation-recent" className="conversation-threads" aria-label={t.threads}>
            <div className="conversation-section-heading"><h2>{d.recent}</h2><Button variant="outline" onClick={() => selectThread()}><Plus aria-hidden="true" />{t.newThread}</Button></div>
            {local.threads.length === 0 ? <p className="conversation-empty">{t.empty}</p> : <ul>{local.threads.map(thread => <li key={thread.id}><MessagesSquare aria-hidden="true" /><button type="button" className={selectedId === thread.id ? "is-active" : ""} aria-label={thread.title} aria-pressed={selectedId === thread.id} onClick={() => selectThread(thread.id)}><span>{thread.title}</span><small>{d.local} · <time dateTime={thread.updatedAt}>{formatDateTime(thread.updatedAt, locale, timezone)}</time></small></button><ArrowRight aria-hidden="true" /></li>)}</ul>}
          </section>
        )}
        {resources && <section className="conversation-tools" aria-label={d.tools}>
          <h2>{d.tools}</h2><p className="conversation-tool-hint">{d.toolHint}</p>
          <details id="conversation-search" className="conversation-tool"><summary><Search aria-hidden="true" />{searchCopy[locale].title}</summary><ConversationSearch locale={locale} workspaceId={scope.workspaceId} locationId={scope.locationId} workspaceSlug={workspaceSlug} locationSlug={location} canManage={resources.canManage} /></details>
          <details id="conversation-documents" className="conversation-tool"><summary><Paperclip aria-hidden="true" />{resourceCopy[locale].documents}</summary><ConversationDocuments key={selectedId ?? "new"} locale={locale} workspaceId={scope.workspaceId} locationId={scope.locationId} canManage={resources.canManage} citedIds={selected?.documentVersionIds ?? []} canCite={Boolean(selected) && local.status !== "corrupt"} onCite={citeDocument} /></details>
          <details id="conversation-sources" className="conversation-tool"><summary><Plug aria-hidden="true" />{resourceCopy[locale].connectors}</summary><ConversationConnectors locale={locale} workspaceId={scope.workspaceId} locationId={scope.locationId} workspaceSlug={workspaceSlug} locationSlug={location} canManage={resources.canManage} /></details>
        </section>}
        <footer className="conversation-boundaries"><p className="limitation-note">{t.privacy}</p><p className="limitation-note">{t.boundary}</p></footer>
        <details className="conversation-context"><summary>{t.context}</summary><strong>{workspaceName}</strong><p>{locationName || copy[locale].shell.allLocations}</p><p>{d.contextHint}</p><div><Link href={`${base}/business?${locationQuery}`}>{t.shop}</Link><Link href={`${base}/insights?${locationQuery}`}>{t.insights}</Link><Link href={`${base}/business/integrations?${locationQuery}`}>{t.integrations}</Link></div></details>
      </section>
    </div>
  </div>;
}
