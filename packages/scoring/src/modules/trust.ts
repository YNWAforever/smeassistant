import type { AgentKey, Finding, GBPPayload, IGPayload, ModuleScore, Severity } from "../types";
import { getBenchmark } from "../benchmarks";
import { computeOwnerResponseRate } from "../response-rate";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

interface Tier {
  condition: (metrics: Metrics, benchmarks: ReturnType<typeof getBenchmarks>) => boolean;
  impact: number;
  severity: Severity;
  messageZh: (metrics: Metrics, benchmarks: ReturnType<typeof getBenchmarks>) => string;
  messageEn: (metrics: Metrics, benchmarks: ReturnType<typeof getBenchmarks>) => string;
}

function isCriticallyWeak(m: Metrics): boolean {
  if (m.gbpAvailable && m.igAvailable) return m.reviews < 5 && m.followers < 500;
  if (m.gbpAvailable) return m.reviews < 5;
  if (m.igAvailable) return m.followers < 100;
  return false;
}

type FindingDef = {
  key: string;
  tiers: Tier[];
  requiresGBP?: boolean;
  requiresIG?: boolean;
  /**
   * Required, not optional. Every trust finding previously inherited a single
   * hardcoded "review_reply_agent" from the shared push below, so "your Instagram
   * follower count is low" routed to an agent that drafts review replies. Making
   * it a required field on the table means a new finding cannot be added without
   * deciding where it routes.
   */
  agentHint: AgentKey;
};

interface Metrics {
  reviews: number;
  rating: number;
  daysSinceLastReview: number | null;
  responseRate: number | null;
  hasResponseData: boolean;
  followers: number;
  gbpAvailable: boolean;
  igAvailable: boolean;
}

function getBenchmarks(industry: string | null | undefined) {
  const safeIndustry = industry || undefined;
  return {
    reviewCountMin: getBenchmark(safeIndustry, "trust.review_count_min") as number,
    reviewCountAvg: getBenchmark(safeIndustry, "trust.review_count_avg") as number,
    ratingMin: getBenchmark(safeIndustry, "trust.rating_min") as number,
    ratingAvg: getBenchmark(safeIndustry, "trust.rating_avg") as number,
    igFollowersMin: getBenchmark(safeIndustry, "trust.ig_followers_min") as number,
    igFollowersAvg: getBenchmark(safeIndustry, "trust.ig_followers_avg") as number,
    industry: safeIndustry ?? "其他",
  };
}

function resolveTier(tiers: Tier[], m: Metrics, b: ReturnType<typeof getBenchmarks>): Tier | null {
  for (const tier of tiers) {
    if (tier.condition(m, b)) return tier;
  }
  return null;
}

function defineFindings(): FindingDef[] {
  return [
    // 1. review_volume
    {
      key: "trust.review_volume",
      agentHint: "gbp_optimization_agent",
      requiresGBP: true,
      tiers: [
        {
          condition: (m) => m.reviews < 5,
          impact: -25,
          severity: "critical",
          messageZh: (m) => `你喺 Google 只有 ${m.reviews} 個評語，近乎零社會證明。新客見到冇人評論，極大機會直接跳過你。`,
          messageEn: (m) => `You have only ${m.reviews} Google reviews — almost no social proof. New customers who see no reviews are very likely to skip you.`,
        },
        {
          condition: (m, b) => m.reviews < b.reviewCountMin,
          impact: -15,
          severity: "warning",
          messageZh: (m, b) => `你嘅 Google 評論量 (${m.reviews}) 低於掃描器規則門檻 (${b.reviewCountMin})。增加真實評論有助建立更清晰嘅信任訊號。`,
          messageEn: (m, b) => `Your Google review count (${m.reviews}) is below the scanner rule threshold (${b.reviewCountMin}). Collecting more genuine reviews strengthens the trust signal used by this scanner.`,
        },
        {
          condition: (m, b) => m.reviews < b.reviewCountAvg,
          impact: -5,
          severity: "info",
          messageZh: (m, b) => `你嘅評論量 (${m.reviews}) OK，但未達掃描器規則門檻 (${b.reviewCountAvg})。持續累積真實評論可以加強信任訊號。`,
          messageEn: (m, b) => `Your review count (${m.reviews}) is acceptable, but has not reached the scanner rule threshold (${b.reviewCountAvg}). Consistently collecting genuine reviews can strengthen the trust signal.`,
        },
        {
          // impact: 0 — trust reflects deficits only; see scoreTrust's clamp comment.
          // Message kept as encouragement copy; a zero-impact finding still renders
          // in the full findings list without a misleading score number.
          condition: (m, b) => m.reviews >= b.reviewCountAvg,
          impact: 0,
          severity: "info",
          messageZh: (m, b) => `你嘅 Google 評論量 (${m.reviews}) 達到掃描器規則門檻 (${b.reviewCountAvg})。掃描器會將呢項視為較強嘅信任訊號。`,
          messageEn: (m, b) => `Your Google review count (${m.reviews}) meets the scanner rule threshold (${b.reviewCountAvg}). The scanner treats this as a stronger trust signal.`,
        },
      ],
    },
    // 2. review_rating
    {
      key: "trust.review_rating",
      agentHint: "review_reply_agent",
      requiresGBP: true,
      tiers: [
        {
          condition: (m) => m.rating > 0 && m.rating < 3.5,
          impact: -30,
          severity: "critical",
          messageZh: (m) => `你嘅 Google 評分只有 ${m.rating.toFixed(1)} 分，低於掃描器規則門檻。優先處理近期負評同服務問題，有助改善信任訊號。`,
          messageEn: (m) => `Your Google rating is only ${m.rating.toFixed(1)}, which is below the scanner rule threshold. Prioritise recent negative feedback and service issues to improve the trust signal.`,
        },
        {
          condition: (m, b) => m.rating > 0 && m.rating < b.ratingMin,
          impact: -20,
          severity: "warning",
          messageZh: (m, b) => `你嘅 Google 評分 (${m.rating.toFixed(1)}) 低於掃描器規則門檻 (${b.ratingMin})。檢視近期負評並回覆客人，可以改善掃描器所見嘅信任訊號。`,
          messageEn: (m, b) => `Your Google rating (${m.rating.toFixed(1)}) is below the scanner rule threshold (${b.ratingMin}). Review recent negative feedback and reply to customers to improve the trust signal observed by the scanner.`,
        },
        {
          condition: (m) => m.rating > 0 && m.rating < 4.5,
          impact: -5,
          severity: "info",
          messageZh: (m) => `你嘅 Google 評分 (${m.rating.toFixed(1)}) 合格，但未到令人安心嘅水平 (>4.5)。升到 4.5 以上可以明顯提升點擊率。`,
          messageEn: (m) => `Your Google rating (${m.rating.toFixed(1)}) is acceptable but below the reassuring level (>4.5). Reaching 4.5+ noticeably lifts click-through.`,
        },
        {
          // impact: 0 — trust reflects deficits only; see scoreTrust's clamp comment.
          condition: (m) => m.rating >= 4.5,
          impact: 0,
          severity: "info",
          messageZh: (m) => `你嘅 Google 評分 (${m.rating.toFixed(1)}) 係高評分，係信任加速器。客人見到 4.5+ 會更放心消費。`,
          messageEn: (m) => `Your Google rating (${m.rating.toFixed(1)}) is a high score — a trust accelerator. Customers who see 4.5+ feel much more confident spending with you.`,
        },
      ],
    },
    // 3. review_recency
    {
      key: "trust.review_recency",
      agentHint: "gbp_optimization_agent",
      requiresGBP: true,
      tiers: [
        {
          condition: (m) => m.daysSinceLastReview === null || m.daysSinceLastReview > 180,
          impact: -15,
          severity: "critical",
          messageZh: () => `你嘅 Google 超過 180 日冇新評論，客人會懷疑你係咪仲營業緊。長期冇新評論係業務停滯嘅強烈訊號。`,
          messageEn: () => `Your Google page has had no new reviews for over 180 days — customers will wonder if you're still open. A prolonged gap in reviews is a strong signal of business inactivity.`,
        },
        {
          condition: (m) => m.daysSinceLastReview !== null && m.daysSinceLastReview > 90,
          impact: -10,
          severity: "warning",
          messageZh: (m) => `你最近 ${m.daysSinceLastReview} 日都冇新評論。90 日係一個心理關口，客人見到會覺得你嘅活躍度唔夠。`,
          messageEn: (m) => `You haven't had a new review in the past ${m.daysSinceLastReview} days. 90 days is a psychological threshold — customers who see this will feel your activity is insufficient.`,
        },
        {
          condition: (m) => m.daysSinceLastReview !== null && m.daysSinceLastReview > 30,
          impact: -3,
          severity: "info",
          messageZh: (m) => `你 ${m.daysSinceLastReview} 日前有最新評論，持續有新評論係好事。維持每月有新評論可以保持活躍度。`,
          messageEn: (m) => `Your latest review was ${m.daysSinceLastReview} days ago — getting reviews regularly is good practice. Maintaining at least one new review per month helps keep your profile active.`,
        },
        {
          // impact: 0 — trust reflects deficits only; see scoreTrust's clamp comment.
          condition: (m) => m.daysSinceLastReview !== null && m.daysSinceLastReview <= 7,
          impact: 0,
          severity: "info",
          messageZh: (m) => `最近 ${m.daysSinceLastReview} 日內有新評論，證明生意活躍。客人見到新鮮評論會更放心消費。`,
          messageEn: (m) => `A new review within the last ${m.daysSinceLastReview} days shows an active business. Customers who see fresh reviews feel much more confident.`,
        },
      ],
    },
    // 4. owner_engagement
    {
      key: "trust.owner_engagement",
      agentHint: "review_reply_agent",
      requiresGBP: true,
      tiers: [
        {
          condition: (m) => m.hasResponseData && m.responseRate !== null && m.responseRate === 0 && m.reviews >= 10,
          impact: -15,
          severity: "critical",
          messageZh: (m) => `你嘅 Google 有 ${m.reviews} 條評論，但你從未回覆過任何一條。唔覆評論等於話俾新客知你唔在乎佢哋嘅體驗。Google 排名會受影響。`,
          messageEn: (m) => `You have ${m.reviews} Google reviews but have never replied to any of them. Not replying tells new customers you don't care about their experience — and it negatively affects your Google ranking.`,
        },
        {
          condition: (m) => m.hasResponseData && m.responseRate !== null && m.responseRate < 0.30,
          impact: -10,
          severity: "warning",
          messageZh: (m) => `你只回覆咗 ${Math.round(m.responseRate! * 100)}% 嘅評語。回覆評語係向新客展示你重視服務嘅最直接方式。目標係 60%+ 回覆率。`,
          messageEn: (m) => `You've only replied to ${Math.round(m.responseRate! * 100)}% of reviews. Replying to reviews is the most direct way to show new customers that you care about service quality. Aim for 60%+ response rate.`,
        },
        {
          condition: (m) => m.hasResponseData && m.responseRate !== null && m.responseRate < 0.80,
          impact: -3,
          severity: "info",
          messageZh: (m) => `你嘅回覆率 (${Math.round(m.responseRate! * 100)}%) OK，但未覆蓋大部分評語。升到 80%+ 可以進一步提升信任。`,
          messageEn: (m) => `Your response rate (${Math.round(m.responseRate! * 100)}%) is acceptable, but doesn't cover most reviews. Reaching 80%+ can further strengthen customer trust.`,
        },
        {
          // impact: 0 — trust reflects deficits only; see scoreTrust's clamp comment.
          condition: (m) => m.hasResponseData && m.responseRate !== null && m.responseRate >= 0.80,
          impact: 0,
          severity: "info",
          messageZh: (m) => `你嘅回覆率 (${Math.round(m.responseRate! * 100)}%) 好高，證明你重視每個客人。高回覆率係 Google ranking 嘅加分位。`,
          messageEn: (m) => `Your response rate (${Math.round(m.responseRate! * 100)}%) is excellent, showing that you value every customer. A high response rate is a positive signal for Google ranking.`,
        },
      ],
    },
    // 5. social_proof
    {
      key: "trust.social_proof",
      agentHint: "ig_growth_agent",
      requiresIG: true,
      tiers: [
        {
          condition: (m) => m.followers < 100,
          impact: -20,
          severity: "critical",
          messageZh: (m) => `你嘅 IG 只有 ${m.followers} 個追蹤，數碼存在感極弱。客人會覺得「冇人 follow，係咪有問題？」`,
          messageEn: (m) => `Your IG has only ${m.followers} followers — your digital presence is extremely weak. Customers may wonder: "Nobody follows this — is something wrong?"`,
        },
        {
          condition: (m, b) => m.followers < b.igFollowersMin,
          impact: -12,
          severity: "warning",
          messageZh: (m, b) => `你嘅 IG 追蹤數 (${m.followers}) 低於掃描器規則門檻 (${b.igFollowersMin})。持續發佈相關內容有助建立更清晰嘅社交證明。`,
          messageEn: (m, b) => `Your IG following (${m.followers}) is below the scanner rule threshold (${b.igFollowersMin}). Publishing relevant content consistently can build a clearer social-proof signal.`,
        },
        {
          condition: (m, b) => m.followers < b.igFollowersAvg,
          impact: -5,
          severity: "info",
          messageZh: (m, b) => `你嘅 IG 追蹤數 (${m.followers}) OK，但未達掃描器規則門檻 (${b.igFollowersAvg})。繼續經營內容可以加強社交證明。`,
          messageEn: (m, b) => `Your IG following (${m.followers}) is acceptable, but has not reached the scanner rule threshold (${b.igFollowersAvg}). Continuing to create relevant content can strengthen social proof.`,
        },
        {
          // impact: 0 — trust reflects deficits only; see scoreTrust's clamp comment.
          condition: (m, b) => m.followers >= b.igFollowersAvg,
          impact: 0,
          severity: "info",
          messageZh: (m, b) => `你嘅 IG 追蹤數 (${m.followers}) 達到掃描器規則門檻 (${b.igFollowersAvg})。掃描器會將呢項視為較強嘅社交證明。`,
          messageEn: (m, b) => `Your IG following (${m.followers}) meets the scanner rule threshold (${b.igFollowersAvg}). The scanner treats this as a stronger social-proof signal.`,
        },
      ],
    },
    // 6. cross_signal
    {
      key: "trust.cross_signal",
      agentHint: "gbp_optimization_agent",
      tiers: [
        {
          condition: (m) => isCriticallyWeak(m),
          impact: -25,
          severity: "critical",
          messageZh: (m) => {
            if (m.gbpAvailable && m.igAvailable) return `你嘅 Google 評論同 IG 追蹤雙雙極弱。客人喺兩個主要信任入口都搵唔到足夠訊號，基本上冇信任基礎。你需要同時發力兩個平台。`;
            if (m.gbpAvailable) return `你嘅 Google 評論量極低 (${m.reviews})，而且缺少 IG 社交證明。客人喺唯一可用嘅信任入口都搵唔到足夠訊號。`;
            return `你嘅 IG 追蹤極低 (${m.followers})，而且缺少 Google 評論證明。客人喺唯一可用嘅社交平台都搵唔到足夠訊號。`;
          },
          messageEn: (m) => {
            if (m.gbpAvailable && m.igAvailable) return `Both your Google reviews and IG following are critically weak. Customers find no trust signals at either major entry point — you essentially have no trust foundation. You need to build both platforms simultaneously.`;
            if (m.gbpAvailable) return `Your Google review count is extremely low (${m.reviews}) and you lack IG social proof. Customers can't find enough trust signals even at the one available entry point.`;
            return `Your IG following is extremely low (${m.followers}) and you lack Google review proof. Customers can't find enough trust signals even on the one available social platform.`;
          },
        },
        {
          condition: (m, b) => {
            if (!m.gbpAvailable && !m.igAvailable) return false;
            const reviewWeak = m.gbpAvailable && m.reviews < b.reviewCountMin;
            const igWeak = m.igAvailable && m.followers < b.igFollowersMin;
            return (reviewWeak || igWeak) && !isCriticallyWeak(m);
          },
          impact: -12,
          severity: "warning",
          messageZh: (m, b) => {
            const reviewWeak = m.gbpAvailable && m.reviews < b.reviewCountMin;
            const igWeak = m.igAvailable && m.followers < b.igFollowersMin;
            if (reviewWeak && igWeak) return `你嘅 Google 評論同 IG 追蹤都低於掃描器規則門檻。兩個信任入口都需要加強。`;
            if (reviewWeak) return `你嘅 Google 評論量偏弱，雖然 IG 有基本存在感，但缺少 Google 信任入口。`;
            return `你嘅 IG 追蹤偏弱，雖然 Google 有基本評論量，但缺少社交證明。`;
          },
          messageEn: (m, b) => {
            const reviewWeak = m.gbpAvailable && m.reviews < b.reviewCountMin;
            const igWeak = m.igAvailable && m.followers < b.igFollowersMin;
            if (reviewWeak && igWeak) return `Both your Google reviews and IG following are below the scanner rule threshold. Both trust entry points need strengthening.`;
            if (reviewWeak) return `Your Google review count is weak — while IG provides a basic presence, you're missing the Google trust entry point.`;
            return `Your IG following is weak — while Google has a basic review count, you're lacking social proof.`;
          },
        },
        {
          // impact: 0 — trust reflects deficits only; see scoreTrust's clamp comment.
          condition: (m, b) => m.gbpAvailable && m.igAvailable && m.reviews >= b.reviewCountAvg && m.followers >= b.igFollowersAvg,
          impact: 0,
          severity: "info",
          messageZh: (m, b) => `你嘅 Google 評論 (${m.reviews}) 同 IG 追蹤 (${m.followers}) 都達到掃描器規則門檻。掃描器會將雙平台訊號視為較完整。`,
          messageEn: (m, b) => `Your Google reviews (${m.reviews}) and IG following (${m.followers}) both meet the scanner rule threshold. The scanner treats the two-platform signal as more complete.`,
        },
        {
          condition: (m, b) => {
            const reviewOk = !m.gbpAvailable || m.reviews >= b.reviewCountAvg;
            const igOk = !m.igAvailable || m.followers >= b.igFollowersAvg;
            return reviewOk || igOk;
          },
          impact: 0,
          severity: "info",
          messageZh: (m, b) => {
            const reviewOk = m.gbpAvailable && m.reviews >= b.reviewCountAvg;
            const igOk = m.igAvailable && m.followers >= b.igFollowersAvg;
            if (reviewOk && igOk) return `雙平台信任訊號都達標。`;
            if (!m.gbpAvailable) return `IG 社交證明充足，Google 評論數據暫未有。兩邊都齊全會更理想。`;
            if (!m.igAvailable) return `Google 評論量充足，IG 追蹤數據暫未有。兩邊都齊全會更理想。`;
            if (reviewOk) return `Google 評論量充足，雖然 IG 有待加強，但已有一個可靠信任入口。`;
            return `IG 社交證明充足，雖然 Google 評論有待加強，但已有基本信任基礎。`;
          },
          messageEn: (m, b) => {
            const reviewOk = m.gbpAvailable && m.reviews >= b.reviewCountAvg;
            const igOk = m.igAvailable && m.followers >= b.igFollowersAvg;
            if (reviewOk && igOk) return `Trust signals on both platforms are up to standard.`;
            if (!m.gbpAvailable) return `IG social proof is solid, though Google review data isn't available yet. Having both would be ideal.`;
            if (!m.igAvailable) return `Google review count is solid, though IG follower data isn't available yet. Having both would be ideal.`;
            if (reviewOk) return `Google review count is solid — while IG needs improvement, you already have one reliable trust entry point.`;
            return `IG social proof is solid — while Google reviews need improvement, you have a basic trust foundation.`;
          },
        },
      ],
    },
  ];
}

function buildEvidence(m: Metrics, b: ReturnType<typeof getBenchmarks>): Record<string, unknown> {
  return {
    reviews_count: m.reviews,
    scanner_rule_review_floor: b.reviewCountMin,
    scanner_rule_review_target: b.reviewCountAvg,
    rating: m.rating,
    scanner_rule_rating_floor: b.ratingMin,
    scanner_rule_rating_target: b.ratingAvg,
    days_since_last_review: m.daysSinceLastReview,
    response_rate: m.responseRate !== null ? Math.round(m.responseRate * 100) : null,
    ig_followers: m.followers,
    scanner_rule_ig_followers_floor: b.igFollowersMin,
    scanner_rule_ig_followers_target: b.igFollowersAvg,
  };
}

function computeMetrics(gbp: GBPPayload, ig: IGPayload): Metrics {
  const now = Date.now();

  // Use most-recent review timestamp from scraped reviews
  let daysSinceLastReview: number | null = null;
  if (gbp.available && gbp.reviews && gbp.reviews.length > 0) {
    const times = gbp.reviews
      .map((r) => (r.time ? new Date(r.time).getTime() : 0))
      .filter((t) => t > 0);
    if (times.length > 0) {
      daysSinceLastReview = Math.round((now - Math.max(...times)) / MS_PER_DAY);
    }
  }

  // Response rate is only measurable when the scraped sample covers the whole
  // population (reviews_count). Google Places returns at most ~5 reviews, so a
  // sample numerator over a population denominator (or over the sample size itself)
  // is not a valid rate either way — see computeOwnerResponseRate.
  let responseRate: number | null = null;
  let hasResponseData = false;
  if (gbp.available && gbp.reviews && gbp.reviews.length > 0) {
    const result = computeOwnerResponseRate(gbp.reviews, gbp.reviews_count);
    hasResponseData = result.measurable;
    responseRate = result.rate;
  }

  return {
    reviews: gbp.available ? (gbp.reviews_count ?? 0) : 0,
    rating: gbp.available ? (gbp.rating ?? 0) : 0,
    daysSinceLastReview,
    responseRate,
    hasResponseData,
    followers: ig.available ? (ig.followers ?? 0) : 0,
    gbpAvailable: gbp.available,
    igAvailable: ig.available,
  };
}

export function scoreTrust(gbp: GBPPayload, ig: IGPayload, industry?: string | null): ModuleScore {
  if (!gbp.available || !ig.available) {
    return {
      status: "unavailable",
      score: null,
      confidence: "none",
      evidenceCollectedAt: null,
      limitationCode: "TRUST_NOT_MEASURED",
      findings: [],
    };
  }

  const findings: Finding[] = [];
  let score = 100;

  const m = computeMetrics(gbp, ig);
  const b = getBenchmarks(industry);

  for (const def of defineFindings()) {
    if (def.requiresGBP && !m.gbpAvailable) continue;
    if (def.requiresIG && !m.igAvailable) continue;

    const tier = resolveTier(def.tiers, m, b);
    if (!tier) continue;

    score += tier.impact;

    findings.push({
      finding_key: def.key as Finding["finding_key"],
      module: "trust",
      severity: tier.severity,
      score_impact: tier.impact,
      owner_message_zh: tier.messageZh(m, b),
      owner_message_en: tier.messageEn(m, b),
      evidence: buildEvidence(m, b),
      v02_agent_hint: def.agentHint,
    });
  }

  return {
    status: "measured",
    // Trust reflects deficits only: every tier's `impact` is now <= 0 (the former
    // bonus tiers were set to 0, not deleted, so their encouragement copy still
    // renders as an informational finding). score can therefore only fall from 100,
    // never rise above it — Math.min(100, ...) is unreachable from above and kept
    // only as a defensive guard, not because any code path still needs it.
    score: Math.max(0, Math.min(100, score)),
    confidence: "medium",
    evidenceCollectedAt: null,
    limitationCode: null,
    findings,
  };
}
