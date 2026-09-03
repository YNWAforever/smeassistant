import type { AEOEvidenceEngine, AEOQueryType } from "@sme-scanner/scoring";
import { getMarketConfig, type Market } from "@sme-scanner/region";

export type MerchantQueryPlanInput = {
  term: string;
  termEn: string;
  district: string;
  districtEn: string;
};

export type MerchantQueryPlanItem = {
  id: string;
  query: string;
  query_type: AEOQueryType;
  engine: AEOEvidenceEngine;
  hl: "zh-TW" | "en";
  gl: "hk" | "tw";
  location: string | null;
  // google_maps only: search-origin GPS anchor (@lat,lng,zoom). Maps ignores gl,
  // so this is the only signal keeping ambiguous district names in-market.
  ll: string | null;
  device: "desktop" | "mobile";
};

function districtTerm(district: string, geoLabelZh: string): string {
  return district.trim() || geoLabelZh;
}

export function buildMerchantQueryPlan(
  input: MerchantQueryPlanInput,
  market: Market,
): MerchantQueryPlanItem[] {
  const cfg = getMarketConfig(market);
  const term = input.term.trim() || "本地服務";
  const termEn = input.termEn.trim() || "local services";
  const district = districtTerm(input.district, cfg.geoLabelZh);
  const districtEn = input.districtEn.trim();
  const gl = cfg.gl as "hk" | "tw";
  // SerpAPI's locations DB only accepts canonical names ("Hong Kong"), never the
  // localized display label (香港) — that fails the whole run with "Unsupported location".
  // Prefer the district-level anchor (searcher physically inside the scanned district):
  // it sharpens local-pack/organic results and disambiguates names like 中西區 that
  // exist in both Hong Kong and Tainan. Districts without a SerpAPI entry use the
  // market-level anchor.
  const districtGeo = cfg.districts.find((d) => d.zh === input.district.trim());
  const location = districtGeo?.serpLocation ?? cfg.serpLocation;
  const mapsLl = districtGeo?.mapsLl ?? cfg.mapsLl;
  // Cantonese "邊間…好" for HK; Mandarin "哪一家…比較好" for TW.
  const needQuery =
    market === "tw"
      ? `${district}哪一家${term}比較好`
      : `${district}邊間${term}好`;
  // "best {termEn} in {districtEn}, {geoLabelEn}" — drop the district clause if we have no English
  // name. geoLabelEn keeps this correct across markets ("Hong Kong" / "Taiwan").
  const discoveryEnQuery = districtEn
    ? `best ${termEn} in ${districtEn}, ${cfg.geoLabelEn}`
    : `best ${termEn} in ${cfg.geoLabelEn}`;

  // hk only: qualify the organic zh discovery query with 香港. The bare "${district} 推薦"
  // phrase lexically matches Taiwan food-blog titles (台南中西區美食推薦…), which outrank the
  // location anchor in organic results — live-tested 2026-07-05: 8/9 Tainan results without
  // the qualifier vs 9/9 Hong Kong with it, same district-level location applied. tw stays
  // bare: "台灣臺北市" tested worse (generic pages displace local results) and tw city names
  // have no cross-market ambiguity. The need/maps queries also stay bare — Cantonese phrasing
  // and the maps ll anchor already keep them in-market.
  const discoveryZhDistrict =
    market === "hk" && input.district.trim() ? `${cfg.geoLabelZh}${district}` : district;

  // No brand query: echoing the merchant's own name back at Google is low-value evidence — ranking
  // #1 on your own name is expected and tells us nothing. The English discovery query fills that
  // slot instead, catching English-searching customers.
  return [
    { id: "search-discovery-zh", query: `${term} ${discoveryZhDistrict} 推薦`, query_type: "discovery", engine: "google", hl: "zh-TW", gl, location, ll: null, device: "desktop" },
    { id: "search-discovery-en", query: discoveryEnQuery, query_type: "discovery", engine: "google", hl: "en", gl, location, ll: null, device: "desktop" },
    { id: "ai-mode-need-zh", query: needQuery, query_type: "need", engine: "google_ai_mode", hl: "zh-TW", gl, location, ll: null, device: "desktop" },
    { id: "maps-discovery-zh", query: `${term} ${district}`, query_type: "maps", engine: "google_maps", hl: "zh-TW", gl, location, ll: mapsLl, device: "desktop" },
  ];
}
