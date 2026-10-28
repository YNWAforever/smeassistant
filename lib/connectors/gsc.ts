import "server-only";
import { z } from "zod";
import type { ConnectorContext } from "./types";
import { boundedJson, providerFailure } from "./http";
import { withGscAccessToken, GscConnectionError } from "@/lib/oauth/gsc-access-token";

const Sites = z.object({siteEntry:z.array(z.object({siteUrl:z.string().max(2048),permissionLevel:z.string()})).max(5000).optional()});
const Row = z.object({keys:z.tuple([z.string().max(1000)]), clicks:z.number().finite().nonnegative(), impressions:z.number().finite().nonnegative(), ctr:z.number().finite().min(0).max(1),position:z.number().finite().nonnegative()});
const Analytics = z.object({rows:z.array(z.unknown()).max(25).optional()});
const API = "https://www.googleapis.com/webmasters/v3/sites";
export function gscPropertyMatches(property: string, website: string): boolean {
  try {
    const site=new URL(website);
    if (!["https:","http:"].includes(site.protocol) || site.username || site.password) return false;
    if (property.startsWith("sc-domain:")) {
      const domain=property.slice(10).toLowerCase();
      return Boolean(domain && (site.hostname.toLowerCase()===domain || site.hostname.toLowerCase().endsWith(`.${domain}`)));
    }
    const prefix=new URL(property);
    return prefix.origin===site.origin && site.pathname.startsWith(prefix.pathname);
  } catch {return false;}
}
export async function readGscContext(input: {workspaceId:string;websiteUrl:string|null;market:string}, deps: {withToken?:typeof withGscAccessToken;fetch?:typeof fetch;now?:()=>Date} = {}): Promise<ConnectorContext> {
  const result: ConnectorContext={source:"gsc",status:"empty",observedAt:null,scope:input.websiteUrl??"",items:[]};
  if (!["hk","tw"].includes(input.market)) return {...result,status:"unsupported",reason:"market_unsupported"};
  if (!input.websiteUrl) return {...result,reason:"website_missing"};
  const now=(deps.now??(()=>new Date()))();
  const signal=AbortSignal.timeout(12_000);
  const fetcher=deps.fetch??fetch;
  try {
    return await (deps.withToken??withGscAccessToken)(input.workspaceId, async accessToken => {
      const query=async (url:string,body?:Record<string,unknown>) => {
        const response=await fetcher(url,{method:body?"POST":"GET",headers:{Authorization:`Bearer ${accessToken}`,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{}),signal,cache:"no-store",redirect:"error"});
        if (response.status===401) throw new GscConnectionError("reconnect");
        if (response.status===403) throw new GscConnectionError("forbidden");
        if (!response.ok) throw new Error("gsc_failed");
        return boundedJson(response);
      };
      const sites=Sites.parse(await query(API));
      const property=sites.siteEntry?.filter(site=>["siteOwner","siteFullUser","siteRestrictedUser"].includes(site.permissionLevel)&&gscPropertyMatches(site.siteUrl,input.websiteUrl!)).sort((a,b)=>b.siteUrl.length-a.siteUrl.length)[0]?.siteUrl;
      if (!property) return {...result,reason:"property_missing"};
      const end=new Date(now);end.setUTCDate(end.getUTCDate()-3);
      const start=new Date(end);start.setUTCDate(start.getUTCDate()-27);
      const payload=await query(`${API}/${encodeURIComponent(property)}/searchAnalytics/query`,{startDate:start.toISOString().slice(0,10),endDate:end.toISOString().slice(0,10),dimensions:["query"],rowLimit:25,dataState:"final"});
      // A provider error object must never masquerade as an honest no-rows response.
      if (!payload || typeof payload!=="object" || "error" in payload) throw new Error("invalid_gsc_response");
      const analytics=Analytics.parse(payload), rows=analytics.rows??[];
      const parsed=rows.map(row=>Row.safeParse(row));
      const items=parsed.flatMap(row=>row.success?[{title:row.data.keys[0],metrics:{clicks:row.data.clicks,impressions:row.data.impressions,ctr:row.data.ctr,position:row.data.position}}]:[]);
      const partial=items.length!==rows.length || rows.length===25;
      return {...result,scope:property,observedAt:now.toISOString(),items,status:partial?"partial":items.length?"ready":"empty",reason:partial?"bounded_results":"search_analytics_28_days"};
    });
  } catch(error) {
    if (error instanceof GscConnectionError) return {...result,status:error.code==="disconnected"?"disconnected":error.code==="forbidden"?"failed":"reconnect",reason:error.code};
    return {...result,status:"failed",reason:providerFailure(error)};
  }
}
