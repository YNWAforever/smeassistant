import { describe, expect, it, vi } from "vitest";
import { readGscContext } from "./gsc";
const input = { workspaceId: "w", websiteUrl: "https://shop.example.test/", market: "hk" };
const token = async <T>(_w: string, run: (token: string) => Promise<T>) => run("synthetic-token");
const datedRows = () => Array.from({length:28}, (_,i) => ({keys:[new Date(Date.UTC(2026,8,28+i)).toISOString().slice(0,10)],clicks:1,impressions:3,ctr:1/3,position:9}));
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
describe("GSC readonly context", () => {
  it("retains honest partial query evidence when dated history is missing or unavailable", async () => {
    for (const failed of [false, true]) {
      const fetcher = vi.fn().mockResolvedValueOnce(reply({siteEntry:[{siteUrl:input.websiteUrl,permissionLevel:"siteOwner"}]})).mockResolvedValueOnce(reply({rows:[{keys:["午餐餐牌"],clicks:0,impressions:80,ctr:0,position:9}]}));
      if (failed) fetcher.mockRejectedValueOnce(new DOMException("timeout","TimeoutError"));
      else fetcher.mockResolvedValueOnce(reply({rows:datedRows().slice(1)}));
      const context = await readGscContext({...input,marketOnly:true},{withToken:token,fetch:fetcher,now:()=>new Date("2026-10-28T00:00:00Z")});
      expect(context).toMatchObject({status:"partial",reason:"insufficient_history",items:[{title:"午餐餐牌"}],analytics:{reportedDays:failed?0:27}});
    }
  });
  it("pins a selected path on a broad domain property and cannot match a sibling site/path", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reply({siteEntry:[{siteUrl:"sc-domain:example.test",permissionLevel:"siteOwner"}]})).mockResolvedValueOnce(reply({rows:[]}));
    const context = await readGscContext({...input,websiteUrl:"https://shop.example.test/central",marketOnly:true},{withToken:token,fetch:fetcher});
    const pattern = new RegExp(context.analytics!.pageFilter);
    expect(pattern.test("https://shop.example.test/central")).toBe(true);
    expect(pattern.test("https://shop.example.test/central/menu")).toBe(true);
    expect(pattern.test("https://shop.example.test/central-east")).toBe(false);
    expect(pattern.test("https://other.example.test/central")).toBe(false);
    expect(pattern.test("https://shop.example.test/east")).toBe(false);
  });
  it("uses the same bounded readonly adapter with explicit HK/TW country filters for Stage 3", async () => {
    for (const [market, country] of [["hk", "hkg"], ["tw", "twn"]] as const) {
      const fetcher = vi.fn().mockResolvedValueOnce(reply({siteEntry:[{siteUrl:input.websiteUrl,permissionLevel:"siteOwner"}]})).mockResolvedValueOnce(reply({rows:[{keys:["午餐餐牌"],clicks:0,impressions:80,ctr:0,position:9}]})).mockResolvedValueOnce(reply({rows:datedRows()}));
      const context = await readGscContext({...input,market,marketOnly:true}, {withToken:token,fetch:fetcher,now:()=>new Date("2026-10-28T00:00:00Z")});
      expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({type:"web",aggregationType:"byPage",dimensionFilterGroups:[{groupType:"and",filters:[{dimension:"country",operator:"equals",expression:country},{dimension:"page",operator:"includingRegex",expression:"^https://shop\\.example\\.test/"}]}],rowLimit:25,dataState:"final"});
      expect(context.analytics).toEqual({startDate:"2026-09-28",endDate:"2026-10-25",country,searchType:"web",dimensions:"query",dataState:"final",aggregation:"byPage",pageFilter:"^https://shop\\.example\\.test/",rowLimit:25,reportedDays:28});
      expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({dimensions:["date"],rowLimit:28});
    }
  });
  it("queries only a verified matching property and returns source/time/metrics", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reply({siteEntry:[{siteUrl:"https://unrelated.test/",permissionLevel:"siteOwner"},{siteUrl:"sc-domain:example.test",permissionLevel:"siteFullUser"}]})).mockResolvedValueOnce(reply({rows:[{keys:["shop hours"],clicks:2,impressions:12,ctr:1/6,position:4}]}));
    const result = await readGscContext(input, {withToken:token, fetch:fetcher, now:()=>new Date("2026-10-27T00:00:00Z")});
    expect(result.status).toBe("ready"); expect(result.scope).toBe("sc-domain:example.test");
    expect(result.items[0]).toMatchObject({title:"shop hours",metrics:{clicks:2,impressions:12,position:4}});
    expect(result.source).toBe("gsc"); expect(result.observedAt).toBe("2026-10-27T00:00:00.000Z");
    expect(fetcher.mock.calls.map(c=>[String(c[0]),c[1]?.method??"GET"])).toEqual([["https://www.googleapis.com/webmasters/v3/sites","GET"],["https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aexample.test/searchAnalytics/query","POST"]]);
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({startDate:"2026-09-27",endDate:"2026-10-24",dimensions:["query"],rowLimit:25});
  });
  it("never queries an unrelated/unverified property or locale-derived market", async () => {
    const fetcher=vi.fn().mockResolvedValue(reply({siteEntry:[{siteUrl:"https://evil-example.test/",permissionLevel:"siteOwner"},{siteUrl:"https://shop.example.test/",permissionLevel:"siteUnverifiedUser"}]}));
    expect((await readGscContext(input,{withToken:token,fetch:fetcher})).status).toBe("empty"); expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await readGscContext({...input,market:"unsupported"},{withToken:token,fetch:fetcher})).status).toBe("unsupported"); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("distinguishes no rows, rejected authentication, malformed data and timeouts", async () => {
    const sites=()=>reply({siteEntry:[{siteUrl:input.websiteUrl,permissionLevel:"siteOwner"}]});
    for (const [response,status] of [[reply({}),"empty"],[reply({error:{}}),"failed"],[reply({},401),"reconnect"],[reply({rows:[{keys:["valid"],clicks:1,impressions:2,ctr:.5,position:3},{keys:["bad"],clicks:-1}]}),"partial"]] as const) {
      const fetcher=vi.fn().mockResolvedValueOnce(sites()).mockResolvedValueOnce(response);
      expect((await readGscContext(input,{withToken:token,fetch:fetcher})).status).toBe(status);
    }
    const fetcher=vi.fn().mockRejectedValue(new DOMException("timeout","TimeoutError"));
    const failed=await readGscContext(input,{withToken:token,fetch:fetcher}); expect(failed).toMatchObject({status:"failed",items:[],reason:"timeout"});
  });
});
