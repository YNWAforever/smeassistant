"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import type { PrototypeLocale } from "@/lib/copy";
import { resourceCopy } from "@/lib/copy-conversation-resources";
import type { DocumentVersion } from "@/lib/workspace/conversation-documents";
import type { ConnectorContext, ConnectorProvider } from "@/lib/connectors/types";
interface ResourceProps { locale:PrototypeLocale;workspaceId:string;locationId:string;canManage:boolean }
async function resourceRequest<T>(url:string,init:RequestInit={}):Promise<T> {
  const response=await fetch(url,{credentials:"same-origin",cache:"no-store",...init});
  const body=await response.json();
  if (!response.ok) throw new Error(typeof body?.error==="string"?body.error:"unavailable");
  return body as T;
}
const safeUrl=(value:string)=>{try{const url=new URL(value);return ["https:","http:"].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}};
export function ConversationDocuments({locale,workspaceId,locationId,canManage,citedIds,canCite,onCite}:ResourceProps&{citedIds:string[];canCite:boolean;onCite:(id:string)=>void}) {
  const t=resourceCopy[locale],api=`/api/workspaces/${encodeURIComponent(workspaceId)}/conversation/documents`,query=`location_id=${encodeURIComponent(locationId)}`;
  const [versions,setVersions]=useState<DocumentVersion[]>([]),[cited,setCited]=useState<DocumentVersion[]>([]);
  const [loading,setLoading]=useState(false),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[saved,setSaved]=useState(false),[refresh,setRefresh]=useState(0);
  const [documentId,setDocumentId]=useState("");const file=useRef<HTMLInputElement>(null);
  const citationsKey=citedIds.join(",");
  const active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  useEffect(()=>{
    // Read saved versions only after an explicit reload or a successful upload.
    if(refresh===0)return;
    const controller=new AbortController();
    Promise.all([resourceRequest<{versions:DocumentVersion[]}>(`${api}?${query}`,{signal:controller.signal}),citationsKey?resourceRequest<{versions:DocumentVersion[]}>(`${api}?${query}&ids=${encodeURIComponent(citationsKey)}`,{signal:controller.signal}).catch(()=>({versions:[]})):Promise.resolve({versions:[]})])
      .then(([library,citations])=>{if(!controller.signal.aborted){if(!Array.isArray(library.versions)||!Array.isArray(citations.versions))throw new Error("unavailable");setVersions(library.versions);setCited(citations.versions);setLoaded(true);setLoading(false);}})
      .catch(()=>{if(!controller.signal.aborted){setError(t.failed);setLoading(false);}});
    return()=>controller.abort();
  },[api,query,citationsKey,refresh,t.failed]);
  async function upload(event:FormEvent) {
    event.preventDefault();if(busy||!canManage)return;
    const selected=file.current?.files?.[0];setSaved(false);setError(null);
    if(!selected||!/^.*\.(txt|md|csv)$/i.test(selected.name)||selected.size<=0||selected.size>128*1024){setError(t.unsupported);return;}
    setBusy(true);const form=new FormData();form.set("file",selected);form.set("location_id",locationId);form.set("locale",locale);if(documentId)form.set("document_id",documentId);
    try{await resourceRequest<{version:DocumentVersion}>(api,{method:"POST",body:form});if(active.current){setSaved(true);setLoading(true);setRefresh(v=>v+1);if(file.current)file.current.value="";}}
    catch(e){if(active.current)setError(e instanceof Error&&["unsupported_type","invalid_utf8","binary_file","file_too_large","empty_file"].includes(e.message)?t.unsupported:t.failed);}
    finally{if(active.current)setBusy(false);}
  }
  const provenance=(v:DocumentVersion)=>`${v.title} · v${v.version} · ${new Date(v.createdAt).toLocaleString(locale)}`;
  return <section className="conversation-resources" aria-label={t.documents}>
    <div className="conversation-panel-heading"><h2>{t.documents}</h2><Button variant="outline" disabled={loading||busy} onClick={()=>{setLoading(true);setError(null);setRefresh(v=>v+1);}}>{t.retry}</Button></div>
    <p className="limitation-note conversation-panel-note">{t.documentNote}</p>
    {error&&<p role="alert">{error}</p>}{saved&&<p role="status">{t.saved}</p>}
    {canManage?<form onSubmit={event=>void upload(event)} className="conversation-document-upload">
      <div className="conversation-field"><label htmlFor="conversation-document">{t.file}</label><input ref={file} id="conversation-document" type="file" accept=".txt,.md,.csv,text/plain,text/markdown,text/csv" disabled={busy}/></div>
      <div className="conversation-field"><label htmlFor="conversation-document-parent">{t.versionOf}</label><select id="conversation-document-parent" value={documentId} onChange={e=>setDocumentId(e.target.value)} disabled={busy}><option value="">{t.newDocument}</option>{versions.map(v=><option key={v.id} value={v.documentId}>{v.title} · v{v.version}</option>)}</select></div>
      <div className="conversation-resource-actions"><Button type="submit" disabled={busy}>{busy?t.loading:t.save}</Button></div>
    </form>:<p className="limitation-note">{t.readOnly}</p>}
    {loading?<p role="status">{t.loading}</p>:versions.length===0?<p className="conversation-empty">{loaded?t.empty:t.notLoaded}</p>:<ul className="conversation-document-list">{versions.map(v=><li key={v.id}><details><summary>{provenance(v)}</summary><pre>{v.text}</pre>{v.truncated&&<p className="limitation-note">{t.truncated}</p>}</details><Button variant="outline" disabled={!canCite||citedIds.includes(v.id)} onClick={()=>onCite(v.id)}>{t.cite}</Button></li>)}</ul>}
    {!canCite&&<p className="limitation-note conversation-panel-note">{t.createThread}</p>}
    {citedIds.length>0&&<div className="conversation-citations"><h3>{t.cited}</h3><ul>{citedIds.map(id=>{const v=cited.find(item=>item.id===id);return <li key={id}>{v?<details><summary>{provenance(v)}</summary><pre>{v.text}</pre>{v.truncated&&<p>{t.truncated}</p>}</details>:<span>{loading?t.loading:loaded?t.missing:t.notLoaded}</span>}</li>;})}</ul></div>}
  </section>;
}
const names:Record<ConnectorProvider,string>={gsc:"Google Search Console",firecrawl:"Firecrawl",dataforseo:"DataForSEO"};
export function ConversationConnectors({locale,workspaceId,locationId,canManage,workspaceSlug,locationSlug}:ResourceProps&{workspaceSlug:string;locationSlug?:string}) {
  const t=resourceCopy[locale],api=`/api/workspaces/${encodeURIComponent(workspaceId)}/conversation/connectors`;
  const [contexts,setContexts]=useState<ConnectorContext[]>([]),[error,setError]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState<ConnectorProvider|null>(null),[keyword,setKeyword]=useState(""),[refresh,setRefresh]=useState(0);
  const active=useRef(true);useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  useEffect(()=>{const controller=new AbortController();resourceRequest<{connectors:ConnectorContext[]}>(`${api}?location_id=${encodeURIComponent(locationId)}`,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted){if(!Array.isArray(data.connectors))throw new Error("invalid_response");setContexts(data.connectors);setLoading(false);}}).catch(()=>{if(!controller.signal.aborted){setError(true);setLoading(false);}});return()=>controller.abort();},[api,locationId,refresh]);
  async function request(source:ConnectorProvider,disconnect=false){
    if(busy)return;setBusy(source);setError(false);
    try{const result=await resourceRequest<{context:ConnectorContext}>(api,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({provider:source,location_id:locationId,keyword,...(disconnect?{disconnect:true}:{})})});if(active.current){if(!result.context||result.context.source!==source)throw new Error("invalid_response");setContexts(old=>old.map(row=>row.source===source?result.context:row));}}
    catch{if(active.current)setError(true);}finally{if(active.current)setBusy(null);}
  }
  const connect=`/api/oauth/google/start?provider=gsc&workspace=${encodeURIComponent(workspaceSlug)}&locale=${locale}${locationSlug ? `&location=${encodeURIComponent(locationSlug)}` : ""}`;
  return <section className="conversation-resources" aria-label={t.connectors}>
    <div className="conversation-panel-heading"><h2>{t.connectors}</h2><Button variant="outline" disabled={loading||busy!==null} onClick={()=>{setError(false);setLoading(true);setRefresh(v=>v+1);}}>{t.refreshStatus}</Button></div>
    <p className="limitation-note conversation-panel-note">{t.connectorNote}</p><p className="limitation-note">{t.coverage}</p>
    {loading&&<p role="status">{t.loading}</p>}{error&&<p role="alert">{t.failed}</p>}
    {contexts.map(context=><article className="conversation-connector" key={context.source}><h3>{names[context.source]}</h3><p role="status" className="conversation-panel-state">{context.reason && t.reasons[context.reason] || t.states[context.status]}</p><dl className="conversation-source-meta"><div><dt>{t.scope}</dt><dd>{context.scope||"—"}</dd></div><div><dt>{t.lastRead}</dt><dd>{context.observedAt?new Date(context.observedAt).toLocaleString(locale):t.never}</dd></div></dl>
      {context.source==="gsc"&&<p className="limitation-note">{t.gscNote}</p>}
      {context.budget&&<p className="conversation-budget">{t.remaining} {context.budget.workspaceRemainingUsd.toFixed(2)} · {t.accountRemaining} {context.budget.accountRemainingUsd.toFixed(2)} · {t.reservation} {context.budget.reservedUsd.toFixed(4)}</p>}
      <div className="conversation-resource-actions">
      {context.source==="gsc"&&canManage&&(["disconnected","reconnect"].includes(context.status) || ["property_missing","forbidden"].includes(context.reason??""))&&<a href={connect}>{t.connect}</a>}
      {context.source==="dataforseo"&&<label>{t.keyword}<input value={keyword} maxLength={120} onChange={e=>setKeyword(e.target.value)}/></label>}
      <Button variant="outline" disabled={loading||busy!==null||["disabled","blocked","disconnected","reconnect"].includes(context.status)||(context.status==="unsupported"&&!(context.source==="dataforseo"&&["keyword_required","keyword_unsupported"].includes(context.reason??"")))||(context.source!=="gsc"&&!canManage)||(context.source==="dataforseo"&&!keyword.trim())} onClick={()=>void request(context.source)}>{busy===context.source?t.loading:t.read}</Button>
      {context.source==="gsc"&&canManage&&!["disabled","disconnected"].includes(context.status)&&<Button variant="outline" disabled={loading||busy!==null} onClick={()=>void request("gsc",true)}>{t.disconnect}</Button>}
      </div>
      {context.items.length>0&&<ul className="conversation-source-results">{context.items.map((item,index)=><li key={index}><strong>{item.title}</strong>{item.url&&safeUrl(item.url)&&<a href={safeUrl(item.url)!} target="_blank" rel="noreferrer">{item.url}</a>}{item.text&&<pre>{item.text}</pre>}{item.metrics&&<dl>{Object.entries(item.metrics).map(([key,value])=><div key={key}><dt>{t.metrics[context.source==="dataforseo"&&key==="position"?"organicPosition":key]??key}</dt><dd>{key==="ctr"?`${(value*100).toFixed(2)}%`:value}</dd></div>)}</dl>}</li>)}</ul>}
    </article>)}
  </section>;
}
