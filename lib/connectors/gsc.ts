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
export async function readGscContext(input: {workspaceId:string;websiteUrl:string|null;market:string;marketOnly?:boolean}, deps: {withToken?:typeof withGscAccessToken;fetch?:typeof fetch;now?:()=>Date} = {}): Promise<ConnectorContext> {
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
      // Search Analytics dates are Pacific calendar dates, including DST. Keep
      // the existing worldwide Stage 2 window unchanged.
      const today=input.marketOnly?new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).format(now):now.toISOString().slice(0,10);
      const end=new Date(`${today}T00:00:00Z`);end.setUTCDate(end.getUTCDate()-3);
      const start=new Date(end);start.setUTCDate(start.getUTCDate()-27);
      const startDate=start.toISOString().slice(0,10),endDate=end.toISOString().slice(0,10);
      const country=input.market==="hk"?"hkg" as const:"twn" as const;
      // A verified domain property may include sibling locations/sites. Pin the
      // selected site's origin and path as well as country; never read a sibling.
      const website=new URL(input.websiteUrl!);
      const prefix=`${website.origin}${website.pathname}`;
      const pageFilter=`^${prefix.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}${website.pathname.endsWith("/")?"":"(?:[/?#]|$)"}`;
      const filters=input.marketOnly?{type:"web",aggregationType:"byPage",dimensionFilterGroups:[{groupType:"and",filters:[{dimension:"country",operator:"equals",expression:country},{dimension:"page",operator:"includingRegex",expression:pageFilter}]}]}:{};
      const endpoint=`${API}/${encodeURIComponent(property)}/searchAnalytics/query`;
      const payload=await query(endpoint,{startDate,endDate,dimensions:["query"],rowLimit:25,dataState:"final",...filters});
      // A provider error object must never masquerade as an honest no-rows response.
      if (!payload || typeof payload!=="object" || "error" in payload) throw new Error("invalid_gsc_response");
      const analytics=Analytics.parse(payload), rows=analytics.rows??[];
      const parsed=rows.map(row=>Row.safeParse(row));
      const items=parsed.flatMap(row=>row.success?[{title:row.data.keys[0],metrics:{clicks:row.data.clicks,impressions:row.data.impressions,ctr:row.data.ctr,position:row.data.position}}]:[]);
      let reportedDays=0,historyFailed=false;
      if(input.marketOnly&&items.length){
        // A requested 28-day window is not proof of 28 days of history. A second
        // bounded readonly query verifies dated evidence, within the same deadline.
        try{
          const history=await query(endpoint,{startDate,endDate,dimensions:["date"],rowLimit:28,dataState:"final",...filters});
          if(!history||typeof history!=="object"||"error" in history)throw new Error("invalid_gsc_history");
          const dates=z.object({rows:z.array(Row).max(28).optional()}).parse(history).rows??[];
          const validDates=dates.map(row=>row.keys[0]).filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&date>=startDate&&date<=endDate);
          reportedDays=new Set(validDates).size;
          if(validDates.length!==dates.length)historyFailed=true;
        }catch{historyFailed=true;}
      }
      const bounded=items.length!==rows.length || rows.length===25;
      const partial=bounded||Boolean(input.marketOnly&&items.length&&(reportedDays!==28||historyFailed));
      return {...result,scope:property,observedAt:now.toISOString(),items,status:partial?"partial":items.length?"ready":"empty",reason:bounded?"bounded_results":partial?"insufficient_history":"search_analytics_28_days",...(input.marketOnly?{analytics:{startDate,endDate,country,searchType:"web" as const,dimensions:"query" as const,dataState:"final" as const,aggregation:"byPage" as const,pageFilter,rowLimit:25 as const,reportedDays}}:{})};
    });
  } catch(error) {
    if (error instanceof GscConnectionError) return {...result,status:error.code==="disconnected"?"disconnected":error.code==="forbidden"?"failed":"reconnect",reason:error.code};
    return {...result,status:"failed",reason:providerFailure(error)};
  }
}
