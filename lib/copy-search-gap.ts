import type { PrototypeLocale } from "./copy";
import type { GapReason, Observation } from "./workspace/search-gap";

type SearchCopy = {
  title: string; lead: string; selectLocation: string; read: string; refresh: string; loading: string; failed: string; retry: string;
  chooseRead: string; checkedAt: string; records: string; noRecords: string; draft: string; createBrief: string; briefTitle: string; missing: string; why: string;
  stepReview: string; stepFacts: string; stepDraft: string; source: string; limits: string; queries: string; query: string; impressions: string; clicks: string;
  confirmLabel: string; approve: string; approved: string; openAction: string; ownerOnly: string; observe: string; observeNote: string;
  before: string; after: string; savedAt: string; pending: string; reasons: Record<GapReason, string>; observations: Record<Observation["reason"], string>;
};
export const searchCopy: Record<PrototypeLocale, SearchCopy> = {
  en: {
    title: "Search gaps", lead: "Read this location’s Search Console queries, review a brief, then confirm a next task. No text is sent or published.",
    selectLocation: "Choose one location to read its website. All locations cannot supply a baseline.", read: "Read search gaps", refresh: "Read again", loading: "Reading…", failed: "This read or save is unavailable. Your saved confirmations are unchanged.", retry: "Reload saved reads",
    chooseRead: "Choose a saved read", checkedAt: "Last checked", records: "Saved search reads", noRecords: "No saved search reads for this location.", draft: "Draft · Recommended", createBrief: "Review brief", briefTitle: "Review how your website answers these searches", missing: "These reported searches had impressions but no clicks. We have not checked whether your pages answer them.",
    why: "This is a reason to review your wording, not proof of missing content, a ranking opportunity or a Hong Kong win.",
    stepReview: "Read the listed searches and check the matching pages and their titles.", stepFacts: "Confirm the shop facts and whether the page answers the question. Do not invent prices, services or promises.", stepDraft: "Choose one page to improve. Open the task or Ask Kinnso for a draft; review and confirm any text separately before copying or sending it.",
    source: "Observed source", limits: "Only a bounded sample of up to 25 queries in 28 finalized days, filtered to the shop’s market. Hidden queries and other languages are not full coverage. Review rule: a Chinese-language query with at least 20 impressions and no clicks; at most five suggestions. This is a heuristic, not a measured content gap. US/English SERPs and LLM mentions are not local wins.",
    queries: "Observed queries to review", query: "Query", impressions: "Impressions", clicks: "Clicks", confirmLabel: "I reviewed this brief and its sources. Add this next task for the shop.", approve: "Confirm brief and add task", approved: "Confirmed · saved brief is fixed", openAction: "Open confirmed task", ownerOnly: "An owner must confirm the brief before a task is added.", observe: "Observe later signals", observeNote: "Compare only the exact reported queries in matching, separate 28-day windows after confirmation. Changes do not prove the task caused a result. No lift or whole-site totals are inferred.",
    before: "Before", after: "Later", savedAt: "Read saved", pending: "Not confirmed",
    reasons: { review_queries: "Some reported searches are worth reviewing. This is a suggestion, not a measured win.", thin: "Too little reported local search evidence to suggest a gap.", language_limited: "Only English or other unsupported query language is available. This cannot establish a local-language opportunity.", no_review_queries: "No reported queries meet this review rule. This does not prove that nothing is missing.", coverage_missing: "Market-filtered Search Console evidence is missing. Worldwide results, English SERPs and LLM mentions cannot fill it.", source_unavailable: "Local Search Console evidence is unavailable. Check the connection and this shop’s verified website property." },
    observations: { approval_required: "Confirm the brief before observing.", baseline_missing: "There is no sufficiently complete comparable baseline for this brief.", later_window_required: "There is not yet a separate 28-day window entirely after confirmation. No change can be shown yet.", coverage_changed: "The later source, coverage or settings do not match the baseline. No change is shown.", query_missing: "A confirmed query is missing or has too little later evidence. Missing is not zero.", comparable: "Observed query counts in comparable windows. No causation is established." },
  },
  "zh-HK": {
    title: "搜尋有咩要補？", lead: "睇呢間分店嘅 Search Console 搜尋字，睇過建議再確認下一步。唔會自動送出或發布文字。",
    selectLocation: "請先揀一間分店，先可以讀嗰間舖嘅網站。全部分店唔可以當作比較起點。", read: "睇搜尋資料", refresh: "再讀一次", loading: "讀取中…", failed: "暫時未能讀取或儲存，已存嘅確認內容會保留。", retry: "重讀已存資料",
    chooseRead: "揀一份已存資料", checkedAt: "最近檢查時間", records: "已存嘅搜尋資料", noRecords: "呢間分店未有已存嘅搜尋資料。", draft: "草稿 · 建議", createBrief: "睇建議草稿", briefTitle: "睇吓網站有冇答清楚呢啲搜尋", missing: "呢啲搜尋有曝光，但未有點擊。我哋未檢查你嘅網頁有冇答到佢哋。",
    why: "可以用嚟檢查網站點寫，但唔代表已證實缺少內容、排名機會，亦唔係香港成效。",
    stepReview: "睇返列出嘅搜尋字，再檢查相關網頁同標題。", stepFacts: "確認舖頭資料同網頁有冇答到問題。唔好估價錢、服務或承諾。", stepDraft: "揀一頁想改善嘅網頁。打開待辦或用「問 Kinnso」寫草稿；複製或送出前，要另外睇過同確認文字。",
    source: "實際讀到嘅來源", limits: "只係按舖頭市場篩選嘅 28 日已定稿資料，最多 25 個搜尋字。隱藏搜尋同其他語言唔代表完整覆蓋。檢查規則：中文搜尋最少 20 次曝光、零點擊，最多五項。只係建議檢查，未證實網站缺少內容。美國／英文搜尋結果同 LLM 提及唔等於香港成效。",
    queries: "可以檢查嘅搜尋字", query: "搜尋字", impressions: "曝光", clicks: "點擊", confirmLabel: "我睇過呢份建議同來源，確認為舖頭加呢項下一步。", approve: "確認建議並加入待辦", approved: "已確認 · 已存建議唔會改寫", openAction: "打開已確認待辦", ownerOnly: "要由擁有人確認建議，先會加入待辦。", observe: "睇之後嘅資料", observeNote: "只比較同一批搜尋字、設定相同而且確認後完整嘅另一段 28 日。變化唔代表係呢項工作帶嚟，唔會推算升幅或全站總數。",
    before: "之前", after: "之後", savedAt: "資料儲存時間", pending: "未確認",
    reasons: { review_queries: "有啲搜尋字可以睇吓。呢個係建議，唔係已量度嘅成效。", thin: "本地搜尋資料太少，暫時未夠提出缺口建議。", language_limited: "暫時只有英文或未支援語言嘅搜尋字，唔夠證明本地語言嘅機會。", no_review_queries: "未有搜尋字符合呢個檢查規則，唔代表網站冇嘢要補。", coverage_missing: "未有按市場篩選嘅 Search Console 資料。全球結果、英文搜尋同 LLM 提及唔可以代替。", source_unavailable: "暫時未有本地 Search Console 資料，請檢查連接同呢間舖已驗證嘅網站。" },
    observations: { approval_required: "確認建議後先可以睇之後嘅資料。", baseline_missing: "呢份建議未有足夠完整、可以比較嘅起點資料。", later_window_required: "未有確認後完整而且分開嘅另一段 28 日，暫時唔可以顯示變化。", coverage_changed: "之後嘅來源、覆蓋或設定同之前唔同，唔會顯示變化。", query_missing: "有已確認嘅搜尋字未再出現，或者之後資料太少。缺少資料唔等於零。", comparable: "以下係可比較時段實際讀到嘅搜尋數字，未能證明因果。" },
  },
  "zh-TW": {
    title: "搜尋有什麼要補？", lead: "查看這間分店的 Search Console 搜尋字，讀過建議再確認下一步。不會自動送出或發布文字。",
    selectLocation: "請先選一間分店，才能讀取那間店的網站。全部分店不能當作比較起點。", read: "查看搜尋資料", refresh: "再讀一次", loading: "讀取中…", failed: "暫時無法讀取或儲存，已存的確認內容會保留。", retry: "重讀已存資料",
    chooseRead: "選一份已存資料", checkedAt: "最近檢查時間", records: "已存的搜尋資料", noRecords: "這間分店還沒有已存的搜尋資料。", draft: "草稿 · 建議", createBrief: "查看建議草稿", briefTitle: "看看網站有沒有回答清楚這些搜尋", missing: "這些搜尋有曝光，但沒有點擊。我們還沒檢查你的網頁是否回答了這些問題。",
    why: "可以用來檢查網站怎麼寫，但不代表已證實缺少內容、排名機會，也不是本地成效。",
    stepReview: "查看列出的搜尋字，再檢查相關網頁和標題。", stepFacts: "確認店裡資料和網頁有沒有回答問題。不要猜價格、服務或承諾。", stepDraft: "選一頁想改善的網頁。開啟待辦或用「問 Kinnso」寫草稿；複製或送出前，要另外讀過並確認文字。",
    source: "實際讀到的來源", limits: "只是依店家市場篩選的 28 天已定稿資料，最多 25 個搜尋字。隱藏搜尋和其他語言不代表完整覆蓋。檢查規則：中文搜尋至少 20 次曝光、零點擊，最多五項。只是建議檢查，尚未證實網站缺少內容。美國／英文搜尋結果和 LLM 提及不等於本地成效。",
    queries: "可以檢查的搜尋字", query: "搜尋字", impressions: "曝光", clicks: "點擊", confirmLabel: "我讀過這份建議和來源，確認為店裡加這項下一步。", approve: "確認建議並加入待辦", approved: "已確認 · 已存建議不會改寫", openAction: "開啟已確認待辦", ownerOnly: "要由擁有人確認建議，才會加入待辦。", observe: "查看之後的資料", observeNote: "只比較同一批搜尋字、設定相同且確認後完整的另一段 28 天。變化不代表是這項工作帶來的，不會推算升幅或全站總數。",
    before: "之前", after: "之後", savedAt: "資料儲存時間", pending: "未確認",
    reasons: { review_queries: "有些搜尋字可以看看。這是建議，不是已量測的成效。", thin: "本地搜尋資料太少，暫時不足以提出缺口建議。", language_limited: "暫時只有英文或未支援語言的搜尋字，不足以證明本地語言的機會。", no_review_queries: "沒有搜尋字符合這個檢查規則，不代表網站沒有需要補的內容。", coverage_missing: "還沒有依市場篩選的 Search Console 資料。全球結果、英文搜尋和 LLM 提及不能代替。", source_unavailable: "暫時沒有本地 Search Console 資料，請檢查連接和這間店已驗證的網站。" },
    observations: { approval_required: "確認建議後才能查看之後的資料。", baseline_missing: "這份建議還沒有足夠完整、可以比較的起點資料。", later_window_required: "還沒有確認後完整且分開的另一段 28 天，暫時不能顯示變化。", coverage_changed: "之後的來源、覆蓋或設定和之前不同，不會顯示變化。", query_missing: "有已確認的搜尋字沒有再出現，或之後資料太少。缺少資料不等於零。", comparable: "以下是可比較時段實際讀到的搜尋數字，尚未證明因果。" },
  },
};
