// Re-run of audit E32 against the current checkout (pure functions; no network/DB).
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const repo = process.cwd();
const { offerPriceMismatch, offerDatesMissing } = await import(pathToFileURL(resolve(repo, 'lib/agents/offer-checks.ts')));
const { collectorPhases } = await import(pathToFileURL(resolve(repo, 'lib/funnel/scan-progress.ts')));
const { parseReportSlug } = await import(pathToFileURL(resolve(repo, 'lib/report-access/slug.ts')));
const hk = { title:'套餐', details:'', terms:'', price:{amount:88,currency:'HKD'}, valid_from:'2026-10-01',valid_until:'2026-10-31',claims:[],photo_alt_text:null };
const tw = { ...hk, price:{amount:1280,currency:'TWD'} };
const cases = {
  hk_ntd_symbol: offerPriceMismatch('套餐 NT$88。有效期2026-10-01至2026-10-31。',hk),
  hk_usd_symbol: offerPriceMismatch('套餐 US$88。有效期2026-10-01至2026-10-31。',hk),
  hk_correct: offerPriceMismatch('套餐 HK$88。有效期2026-10-01至2026-10-31。',hk),
  hk_correct_hkd_word: offerPriceMismatch('套餐 HKD 88，2026年10月1日至10月31日',hk),
  hk_bare_dollar: offerPriceMismatch('套餐 $88，2026-10-01至2026-10-31',hk),
  hk_wrong_amount: offerPriceMismatch('套餐 HK$98。',hk),
  tw_thousands: offerPriceMismatch('套餐 NT$1,280，2026/10/01–2026/10/31',tw),
  tw_yuan: offerPriceMismatch('套餐 1,280元，2026/10/01–2026/10/31',tw),
  tw_hk_symbol: offerPriceMismatch('套餐 HK$1,280',tw),
  missing_end: offerDatesMissing('由2026-10-01開始供應。',hk),
  missing_start: offerDatesMissing('供應至2026-10-31。',hk),
  both_dates: offerDatesMissing('2026-10-01至2026-10-31供應',hk),
  local_dates_zh: offerDatesMissing('2026年10月1日至10月31日供應',hk),
  wrong_year: offerDatesMissing('2025-10-01至2025-10-31供應',hk),
  slash_dates_tw: offerDatesMissing('2026/10/01–2026/10/31',tw),
  en_dates: offerDatesMissing('Valid 1 Oct 2026 – 31 Oct 2026',hk),
  inFlight: collectorPhases('collecting_aeo','processing',null),
  slug_underscore: parseReportSlug('3cuOKFmHdiYf00BOs27E_NO1'),
  slug_slash: parseReportSlug('abc/def123'),
  slug_long: parseReportSlug('a'.repeat(65)),
  slug_encoded: parseReportSlug('abc%2Fdef'),
};
console.log(JSON.stringify(cases,null,1));
