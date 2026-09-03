import type { AEOPayload, Finding, ModuleScore } from "../types";

export function scoreAEO(payload: AEOPayload, _industry?: string | null): ModuleScore {
  if (!payload.available) {
    return {
      status: "unavailable",
      score: null,
      confidence: "none",
      evidenceCollectedAt: null,
      limitationCode: "AEO_NOT_MEASURED",
      findings: [],
    };
  }

  const performanceRuns = payload.performance_runs ?? [];
  if (performanceRuns.length > 0) {
    return scoreAEOPerformance(payload);
  }

  const findings: Finding[] = [];
  let score = 100;

  const runs = payload.serpapi_runs ?? [];

  // No usable evidence and no website signal — we cannot claim visibility either way, so do not
  // return the bare starting 100 (that would reward a merchant we never managed to measure).
  if (runs.length === 0 && !payload.website?.available) {
    return {
      status: "unavailable",
      score: null,
      confidence: "none",
      evidenceCollectedAt: null,
      limitationCode: "AEO_NOT_MEASURED",
      findings: [],
    };
  }

  // aeo.ai_overview_missing
  if (runs.length > 0) {
    const overviewMentionedCount = runs.filter((r) => r.ai_overview_mentioned).length;
    const overviewMentionRate = overviewMentionedCount / runs.length;

    if (overviewMentionRate === 0) {
      score -= 30;
      findings.push({
        finding_key: "aeo.ai_overview_missing",
        module: "aeo",
        severity: "critical",
        score_impact: -30,
        owner_message_zh:
          "你完全唔出現喺 Google AI Overview（Google 搜尋頂部嘅 AI 摘要框）。當客人用 Google 搵你所在行業嘅服務，AI 只會推薦你嘅競爭對手。Google AI Overview 係影響點擊率最大嘅新功能。唔出現等於比競爭對手少一個最顯眼嘅入口。",
        owner_message_en: "You don't appear at all in Google AI Overviews (the AI summary box at the top of Google Search). When customers search for services in your industry, the AI only recommends your competitors. Google AI Overview is the highest-impact new feature for click-through. Not appearing means you're missing the most prominent entry point compared to competitors.",
        owner_action_zh: "今個星期喺網站加返清晰嘅服務、地區同常見問題內容，等 Google AI 有足夠資料引用你。",
        owner_action_en: "This week, add clear service, location, and FAQ content to your website so Google's AI has enough material to cite you.",
        evidence: { ai_overview_mention_rate: 0, runs_checked: runs.length },
        v02_agent_hint: "aeo_faq_schema_agent",
      });
    } else if (overviewMentionRate < 0.5) {
      score -= 15;
      findings.push({
        finding_key: "aeo.ai_overview_missing",
        module: "aeo",
        severity: "warning",
        score_impact: -15,
        owner_message_zh: `你只喺 ${Math.round(overviewMentionRate * 100)}% 嘅 Google AI Overview 查詢中出現。大部分客人用 Google 搵你行業嘅服務時，AI 摘要仍然唔推薦你。提升網站結構化數據可以增加出現率。`,
        owner_message_en: `You only appear in ${Math.round(overviewMentionRate * 100)}% of Google AI Overview queries. Most customers searching for your industry's services still won't see you in the AI summary. Improving your website's structured data can increase your appearance rate.`,
        owner_action_zh: "今個星期為你嘅網站主要服務頁面加返結構化數據（schema markup），幫 Google AI 更容易理解同引用你嘅內容。",
        owner_action_en: "This week, add structured data (schema markup) to your main service pages to help Google's AI understand and cite your content more easily.",
        evidence: { ai_overview_mention_rate: parseFloat((overviewMentionRate * 100).toFixed(1)), runs_checked: runs.length },
        v02_agent_hint: "aeo_faq_schema_agent",
      });
    }

    // aeo.ai_mode_missing
    const aiModeMentionedCount = runs.filter((r) => r.ai_mode_mentioned).length;
    if (aiModeMentionedCount === 0) {
      score -= 20;
      findings.push({
        finding_key: "aeo.ai_mode_missing",
        module: "aeo",
        severity: "warning",
        score_impact: -20,
        owner_message_zh:
          "你唔出現喺 Google AI Mode（Google 嘅 AI 對話式搜尋）。AI Mode 係 Google 搜尋嘅下一代功能，愈來愈多用戶用佢搵本地服務推薦。唔出現等於喺未來嘅搜尋習慣中缺席。",
        owner_message_en: "You don't appear in Google AI Mode (Google's conversational AI search). AI Mode is the next-generation Google Search feature — more and more users are using it to find local service recommendations. Not appearing means you're absent from the future of search behaviour.",
        owner_action_zh: "今個星期將你嘅服務內容寫成客人會問嘅問題形式（例如「邊度有 XX 服務」），提升喺對話式搜尋中被提及嘅機會。",
        owner_action_en: "This week, rewrite some of your service content in the form of questions customers actually ask (e.g. \"where can I find XX service\") to improve your chances of being surfaced in conversational search.",
        evidence: { ai_mode_mention_count: 0, runs_checked: runs.length },
        v02_agent_hint: "aeo_faq_schema_agent",
      });
    }

    // aeo.organic_rank_poor
    const rankedRuns = runs.filter((r) => r.brand_organic_rank !== null);
    if (rankedRuns.length > 0) {
      const avgRank = rankedRuns.reduce((sum, r) => sum + (r.brand_organic_rank ?? 0), 0) / rankedRuns.length;
      if (avgRank > 5) {
        score -= 15;
        findings.push({
          finding_key: "aeo.organic_rank_poor",
          module: "aeo",
          severity: "warning",
          score_impact: -15,
          owner_message_zh: `你喺 Google 自然搜尋嘅平均排名係第 ${avgRank.toFixed(1)} 位。排名愈後，點擊率愈低。第 1 位嘅點擊率係第 5 位嘅三倍以上。提升 SEO 可以直接帶嚟更多免費流量。`,
          owner_message_en: `Your average Google organic rank is #${avgRank.toFixed(1)}. A low rank means customers see competitors before they see you.`,
          owner_action_zh: "今個星期揀一個主要服務頁面，將標題、meta description 同內文都加入客人實際會用嚟搜尋嘅字眼。",
          owner_action_en: "This week, pick one key service page and rework its title, meta description, and body copy to include the exact terms customers actually search for.",
          evidence: { avg_organic_rank: parseFloat(avgRank.toFixed(1)), runs_with_rank: rankedRuns.length },
          v02_agent_hint: "llms_txt_agent",
        });
      }
    } else {
      score -= 15;
      findings.push({
        finding_key: "aeo.organic_rank_poor",
        module: "aeo",
        severity: "warning",
        score_impact: -15,
        owner_message_zh:
          "你嘅品牌唔出現喺 Google 搜尋頭 10 位嘅結果。客人搵你行業嘅服務時，根本搵唔到你。改善網站 SEO 係最直接嘅解決方法。",
        owner_message_en: "When customers search for your type of service, you don't appear anywhere in the top 10 Google organic results — they simply can't find you and only see competitors.",
        owner_action_zh: "今個星期確認你嘅網站已經俾 Google 收錄（可以搜尋「site:你個網址」檢查），並提交網站地圖去 Google Search Console。",
        owner_action_en: "This week, confirm Google has indexed your site (search \"site:yourdomain\" to check) and submit your sitemap through Google Search Console.",
        evidence: { avg_organic_rank: null, runs_checked: runs.length },
        v02_agent_hint: "llms_txt_agent",
      });
    }
  }

  // aeo.website_meta_weak
  if (payload.website?.available && (payload.website?.meta_description_len ?? 0) < 50) {
    score -= 10;
    findings.push({
      finding_key: "aeo.website_meta_weak",
      module: "aeo",
      severity: "warning",
      score_impact: -10,
      owner_message_zh: `你嘅網站 meta description 太短（${payload.website?.meta_description_len ?? 0} 個字元）。建議寫 120–160 個字元，清楚描述你嘅服務。Meta description 係 Google AI 總結你網站時嘅主要來源。`,
      owner_message_en: `Your website meta description is too short (${payload.website?.meta_description_len ?? 0} characters). Aim for 120–160 characters that clearly describe your services. The meta description is the main source Google AI uses when summarising your website.`,
      owner_action_zh: "今日就編輯網站首頁嘅 meta description，寫 120 至 160 個字元，清楚講明你做咩、喺邊區同有咩特色。",
      owner_action_en: "Today, edit your homepage's meta description to 120–160 characters that clearly state what you do, where you're located, and what makes you different.",
      evidence: { meta_description_len: payload.website?.meta_description_len ?? 0 },
      v02_agent_hint: "llms_txt_agent",
    });
  }

  // aeo.website_h1_weak
  if (payload.website?.available && payload.website?.h1_count !== 1) {
    score -= 10;
    findings.push({
      finding_key: "aeo.website_h1_weak",
      module: "aeo",
      severity: "warning",
      score_impact: -10,
      owner_message_zh: `你嘅網站有 ${payload.website?.h1_count ?? 0} 個 H1 標題（正確應該係 1 個）。H1 係 Google AI 判斷你網站主題嘅最重要訊號。`,
      owner_message_en: `Your website has ${payload.website?.h1_count ?? 0} H1 heading(s) (the correct number is 1). The H1 is the most important signal Google AI uses to determine your website's topic.`,
      owner_action_zh: "今日就檢查你網站首頁嘅 HTML，確保得一個 H1 標題，清楚寫明你嘅主要業務。",
      owner_action_en: "Today, check your homepage's HTML and make sure there's exactly one H1 heading that clearly states your main business.",
      evidence: { h1_count: payload.website?.h1_count ?? 0 },
      v02_agent_hint: "aeo_faq_schema_agent",
    });
  }

  return {
    status: "measured",
    score: Math.max(0, Math.min(100, score)),
    confidence: "medium",
    evidenceCollectedAt: null,
    limitationCode: null,
    findings,
  };
}

function scoreAEOPerformance(payload: AEOPayload): ModuleScore {
  const findings: Finding[] = [];
  let score = 100;
  const runs = (payload.performance_runs ?? []).filter((run) => run.available && !run.unsupported);

  // Surfaces we could actually measure this scan.
  const organicRuns = runs.filter((run) => run.engine === "google" && run.query_type !== "brand");
  const mapsRuns = runs.filter((run) => run.engine === "google_maps");
  const aiRuns = runs.filter(
    (run) =>
      // AI Mode / AI Overview engines only count when they actually produced an answer.
      // `ai_answered === false` means the engine returned nothing, so an absent citation is not a
      // failure. Legacy runs without the field (null/undefined) keep counting so historical scores
      // are unchanged.
      ((run.engine === "google_ai_mode" || run.engine === "google_ai_overview") && run.ai_answered !== false) ||
      (run.engine === "google" && run.ai_overview_triggered === true),
  );

  // No usable discovery evidence on ANY surface. Returning the starting 100 here would award a
  // perfect AI-visibility score to a merchant we never managed to measure — the exact defect behind
  // r/v0vQfNdF, where failed SerpAPI runs left the module at 100 while the proof panel showed the
  // merchant absent everywhere. Treat it as "couldn't verify" (neutral) instead of "perfect".
  if (organicRuns.length === 0 && mapsRuns.length === 0 && aiRuns.length === 0) {
    return {
      status: "unavailable",
      score: null,
      confidence: "none",
      evidenceCollectedAt: null,
      limitationCode: "AEO_NOT_MEASURED",
      findings: [],
    };
  }

  // AI citation: among AI answers that actually appeared, is the merchant cited anywhere?
  const aiCitationCount = aiRuns.filter((run) => run.ai_cited && run.confidence !== "low" && run.confidence !== "none").length;
  if (aiRuns.length > 0 && aiCitationCount === 0) {
    score -= 20;
    // A "low" confidence run means the fuzzy matcher found a possible-but-unconfirmed mention —
    // that's meaningfully different from "none" (no signal at all), so the owner gets a hedged
    // message instead of a flat assertion of absence.
    const hasAmbiguousSignal = aiRuns.some((run) => run.confidence === "low");
    findings.push({
      finding_key: "aeo.ai_citation_missing",
      module: "aeo",
      severity: "warning",
      score_impact: -20,
      owner_message_zh: hasAmbiguousSignal
        ? "我哋喺 Google AI 回答入面搵到疑似提及你嘅商家，但未夠信心確認係咪真係你。可能係你個商家名有唔同寫法，令我哋未能百分百確認。"
        : "Google AI 回答未有引用你嘅官方網站或商家資料。即使有提及品牌名，冇引用來源都代表可信度同導流機會較弱。",
      owner_message_en: hasAmbiguousSignal
        ? "We found a possible mention of your business in Google's AI answers, but couldn't confidently confirm it's you — this can happen when your business name appears differently across platforms."
        : "Google's AI answers don't cite your official website or business listing. Even if your name is mentioned, no cited source means weaker credibility and fewer click-throughs.",
      owner_action_zh: hasAmbiguousSignal
        ? "今個星期檢查你嘅網站、Google Business Profile 同 IG 上面嘅商家名寫法是否完全一致，唔一致會令 AI 更難確認你身份。"
        : "今個星期喺網站首頁加一段清晰文字，講明你係邊個、做咩、喺邊區，等 Google AI 有清晰來源可以引用你。",
      owner_action_en: hasAmbiguousSignal
        ? "This week, check that your business name is written identically across your website, Google Business Profile, and IG — inconsistent naming makes it harder for AI to confirm it's you."
        : "This week, add a clear paragraph to your homepage stating who you are, what you do, and where you're located, so Google's AI has a clear source to cite.",
      evidence: { ai_runs_checked: aiRuns.length, ai_citation_count: 0 },
      v02_agent_hint: "aeo_content_agent",
    });
  }

  // Organic visibility: judge only the discovery/need queries, never the self-brand query.
  // Ranking #1 on your own name is expected and meaningless, so pooling it with discovery queries
  // would mask a merchant that is invisible everywhere except its own brand search.
  if (organicRuns.length > 0) {
    const rankedOrganic = organicRuns.filter((run) => Number.isFinite(run.organic_rank));
    if (rankedOrganic.length === 0) {
      // Present on no discovery query at all — the strongest "customers can't find you" signal,
      // unless the only evidence is a low-confidence (fuzzy) match, in which case hedge instead
      // of asserting a confirmed absence.
      score -= 15;
      const hasAmbiguousSignal = organicRuns.some((run) => run.confidence === "low");
      findings.push({
        finding_key: "aeo.search_visibility_poor",
        module: "aeo",
        severity: "warning",
        score_impact: -15,
        owner_message_zh: hasAmbiguousSignal
          ? "客人用「搵服務」類查詢搜尋你行業時，我哋搵到疑似你嘅結果，但未夠信心確認排名位置。"
          : "客人用「搵服務」類查詢搜尋你行業時，你冇出現喺 Google 自然搜尋頭 10 位嘅任何結果。即係話佢哋根本搵唔到你，只會見到競爭對手。",
        owner_message_en: hasAmbiguousSignal
          ? "When customers search for your type of service, we found a possible match for your business but couldn't confidently confirm its rank position."
          : "When customers search for your type of service, you don't appear anywhere in the top 10 Google organic results — they simply can't find you and only see competitors.",
        owner_action_zh: hasAmbiguousSignal
          ? "今個星期確認你嘅網站標題同商家名一致，方便我哋下次掃描更準確咁核實你嘅排名。"
          : "今個星期確認你嘅網站已經俾 Google 收錄，並喺首頁清楚寫明你嘅服務同地區關鍵字。",
        owner_action_en: hasAmbiguousSignal
          ? "This week, make sure your website title matches your business name consistently, so next scan can verify your ranking more confidently."
          : "This week, confirm Google has indexed your site and make sure your homepage clearly states your services and location keywords.",
        evidence: { avg_organic_rank: null, discovery_runs: organicRuns.length },
        v02_agent_hint: "seo_content_agent",
      });
    } else {
      // Best (lowest) position the merchant reaches across discovery queries. Appearing #2 on any
      // query means customers CAN find you, so grade by the best result, not the average: top-3 is
      // full marks, 4–10 is "visible but low" (-8), and not-found above is the -15 already handled.
      const bestRank = Math.min(...rankedOrganic.map((run) => run.organic_rank ?? Infinity));
      if (bestRank > 3) {
        score -= 8;
        findings.push({
          finding_key: "aeo.search_visibility_poor",
          module: "aeo",
          severity: "info",
          score_impact: -8,
          owner_message_zh: `你出現喺 Google 自然搜尋第 ${bestRank} 位（頭 10 名內），但未入頭 3 位。大部分點擊都落喺頭 3 位，提升排名可以帶嚟更多免費流量。`,
          owner_message_en: `You appear at #${bestRank} in Google organic results — visible, but below the top 3 where most clicks go. Climbing into the top 3 brings noticeably more free traffic.`,
          owner_action_zh: "今個星期為呢個服務頁面加強內容深度、加返啲客人常搜尋嘅關鍵字，爭取衝入頭 3 位，攞到大部分點擊。",
          owner_action_en: "This week, deepen this service page's content and add more of the keywords customers actually search, to push into the top 3 where most clicks go.",
          evidence: { best_organic_rank: bestRank, ranked_runs: rankedOrganic.length },
          v02_agent_hint: "seo_content_agent",
        });
      }
    }
  }

  // Maps / local-pack visibility. Mirror the organic logic: "available but found nowhere" is a real
  // absence and must be penalized, not silently ignored (the old code only handled rank > 5, so a
  // merchant absent from local results entirely escaped any penalty).
  if (mapsRuns.length > 0) {
    const rankedMaps = mapsRuns.filter((run) => Number.isFinite(run.maps_rank));
    if (rankedMaps.length === 0) {
      // Available but found nowhere in local results — the strongest "customers can't find you on
      // Maps" signal, unless the only evidence is a low-confidence (fuzzy) match, in which case
      // hedge instead of asserting a confirmed absence (same pattern as the organic branch above).
      score -= 15;
      const hasAmbiguousSignal = mapsRuns.some((run) => run.confidence === "low");
      findings.push({
        finding_key: "aeo.maps_visibility_poor",
        module: "aeo",
        severity: "warning",
        score_impact: -15,
        owner_message_zh: hasAmbiguousSignal
          ? "客人喺 Google 地圖搵你行業嘅服務時，我哋搵到疑似你嘅結果，但未夠信心確認你有出現喺本地搜尋結果。"
          : "客人喺 Google 地圖搵你行業嘅服務時，你冇出現喺本地搜尋結果。附近嘅客人搵唔到你，只會見到競爭對手。",
        owner_message_en: hasAmbiguousSignal
          ? "When customers use Google Maps to find your type of service, we found a possible match for your business but couldn't confidently confirm you appear in local results."
          : "When customers use Google Maps to find your type of service, you don't appear in the local results at all. Nearby customers can't find you and only see competitors.",
        owner_action_zh: hasAmbiguousSignal
          ? "今個星期確認你嘅 Google Business Profile 商戶名同分店地址一致，方便我哋下次掃描更準確咁核實你嘅 Maps 排名。"
          : "今個星期補齊 Google Business Profile 嘅相片、類別同營業時間，呢啲都係 Maps 排名嘅主要因素。",
        owner_action_en: hasAmbiguousSignal
          ? "This week, make sure your Google Business Profile name and branch address are consistent, so next scan can verify your Maps ranking more confidently."
          : "This week, complete your Google Business Profile's photos, category, and opening hours — these are key ranking factors for Maps.",
        evidence: { avg_maps_rank: null, maps_runs: mapsRuns.length },
        v02_agent_hint: "gbp_optimization_agent",
      });
    } else {
      // Same best-rank grading as organic: top-3 in the local pack is full marks, 4–10 is "visible
      // but low" (-8), not-found above is the -15 already handled.
      const bestMaps = Math.min(...rankedMaps.map((run) => run.maps_rank ?? Infinity));
      if (bestMaps > 3) {
        score -= 8;
        findings.push({
          finding_key: "aeo.maps_visibility_poor",
          module: "aeo",
          severity: "info",
          score_impact: -8,
          owner_message_zh: `你喺 Google 地圖本地搜尋排第 ${bestMaps} 位（頭 10 名內），但未入頭 3 位。附近客人通常只睇頭幾間，升到頭 3 位可以帶嚟更多到店客。`,
          owner_message_en: `You rank #${bestMaps} in Google Maps local results — visible, but below the top 3. Nearby customers usually only look at the first few, so reaching the top 3 drives more walk-ins.`,
          owner_action_zh: "今個星期更新多幾張近期相片，並鼓勵客人喺 Google 度打卡評分，呢啲都有助你喺 Maps 爬到頭 3 位。",
          owner_action_en: "This week, add a few more recent photos and encourage customers to check in and review on Google — both help push your Maps ranking into the top 3.",
          evidence: { best_maps_rank: bestMaps, maps_runs: rankedMaps.length },
          v02_agent_hint: "gbp_optimization_agent",
        });
      }
    }
  }

  const competitorCounts = new Map<string, number>();
  for (const run of runs) {
    // Dedupe within a run: a competitor can appear in both the organic results and the local pack of
    // a single query, so counting raw occurrences would let one query reach the `>= 2` threshold.
    // Counting once per run makes `>= 2` mean "outranked you in 2+ separate searches".
    for (const competitor of new Set(run.competitors_above)) {
      competitorCounts.set(competitor, (competitorCounts.get(competitor) ?? 0) + 1);
    }
  }
  const repeatedCompetitors = [...competitorCounts.entries()].filter(([, count]) => count >= 2);
  if (repeatedCompetitors.length > 0) {
    score -= 10;
    findings.push({
      finding_key: "aeo.competitor_gap",
      module: "aeo",
      severity: "info",
      score_impact: -10,
      owner_message_zh: `有 ${repeatedCompetitors.length} 個競爭對手重複喺搜尋或 AI 結果中排喺你前面。`,
      owner_message_en: `${repeatedCompetitors.length} competitor(s) repeatedly rank above you across search or AI results.`,
      owner_action_zh: `今個星期睇下 ${repeatedCompetitors[0]?.[0] ?? "排喺你前面嘅競爭對手"} 嘅 Google 資料，睇吓佢有咩你冇（例如相片數量、review 數量），揀一樣嚟追上。`,
      owner_action_en: `This week, look at ${repeatedCompetitors[0]?.[0] ?? "the competitor ranking above you"}'s Google listing and identify one concrete gap (e.g. photo count, review count) to close first.`,
      evidence: { repeated_competitors: repeatedCompetitors.map(([name, count]) => ({ name, count })) },
      v02_agent_hint: "competitive_gap_agent",
    });
  }

  if (payload.website?.available && (payload.website.meta_description_len ?? 0) < 50) {
    score -= 10;
    findings.push({
      finding_key: "aeo.website_content_weak",
      module: "aeo",
      severity: "warning",
      score_impact: -10,
      owner_message_zh: `你嘅網站描述太短（${payload.website.meta_description_len ?? 0} 個字元）。建議清楚寫出服務、地區、招牌產品同預約方法，幫助 Google 同客人理解你。`,
      owner_message_en: `Your website description is too short (${payload.website.meta_description_len ?? 0} characters). Clearly state your services, area, signature offerings, and how to book so Google and customers can understand you.`,
      owner_action_zh: "今個星期重寫網站首頁描述，清楚列明服務、地區、招牌產品同預約方法，最少 120 個字元。",
      owner_action_en: "This week, rewrite your homepage description to clearly list your services, area, signature offerings, and how to book — aim for at least 120 characters.",
      evidence: { meta_description_len: payload.website.meta_description_len ?? 0 },
      v02_agent_hint: "seo_content_agent",
    });
  }

  return {
    status: "measured",
    score: Math.max(0, Math.min(100, score)),
    confidence: "medium",
    evidenceCollectedAt: null,
    limitationCode: null,
    findings,
  };
}
