import type { Finding, IGPayload, ModuleScore } from "../types";
import { getBenchmark } from "../benchmarks";
import { creditFraction, deriveTarget, gradedDeduction } from "../graduated-score";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function scoreIG(payload: IGPayload, industry?: string | null): ModuleScore {
  if (!payload.available) {
    return {
      status: "unavailable",
      score: null,
      confidence: "none",
      evidenceCollectedAt: null,
      limitationCode: "IG_NOT_MEASURED",
      findings: [],
    };
  }

  const findings: Finding[] = [];
  let score = 100;

  // ig.profile_clarity: bio available but short
  const bioLength = payload.bio?.length ?? 0;
  if (payload.bio !== undefined) {
    const bioTarget = deriveTarget(getBenchmark(industry, "ig.bio_length") as number, "higher_is_better");
    const bioCredit = creditFraction(bioLength, bioTarget, "higher_is_better");
    const bioDeduction = gradedDeduction(15, bioCredit);
    if (bioDeduction > 0) {
      score -= bioDeduction;
      findings.push({
        finding_key: "ig.profile_clarity",
        module: "ig",
        severity: "warning",
        score_impact: -bioDeduction,
        owner_message_zh: `你嘅 IG bio 得 ${bioLength} 個字，${industry || "同行"} 平均係 ${getBenchmark(industry, "ig.bio_length")} 個字，理想目標係 ${bioTarget} 個字。客人睇唔出你係咩業務，第一印象差咗，直接影響 profile visit 轉化。`,
        owner_message_en: `Your IG bio is only ${bioLength} characters — the ${industry || "industry"} average is ${getBenchmark(industry, "ig.bio_length")} characters, and ${bioTarget} is the real target. Visitors can't tell what your business does, which hurts first impressions and profile-to-customer conversion.`,
        owner_action_zh: "今個星期重寫 bio，包含你做咩生意、服務地區同一個明確行動呼籲（例如「WhatsApp 我哋預約」），寫夠 30 至 50 個字。",
        owner_action_en: "This week, rewrite your bio to include what you do, the area you serve, and a clear call to action (e.g. \"WhatsApp us to book\") — aim for 30–50 characters.",
        evidence: { bio_length: bioLength },
        v02_agent_hint: "ig_bio_rewrite_agent",
      });
    }
  }

  // ig.bio_cta: no external_url present
  // We infer external_url presence from the payload — if not provided or falsy
  const hasUrl = !!(payload as IGPayload & { external_url?: string }).external_url;
  if (!hasUrl) {
    score -= 15;
    findings.push({
      finding_key: "ig.bio_cta",
      module: "ig",
      severity: "warning",
      score_impact: -15,
      owner_message_zh:
        `你嘅 IG bio 冇外部連結（Link in Bio）。${industry || "同行"}大多都有連結去網站或者 WhatsApp。客人想了解更多或者預約，佢哋唔知去邊。加個 WhatsApp 連結可以帶嚟更多查詢。`,
      owner_message_en: `Your IG bio has no external link (Link in Bio). Most ${industry || "businesses"} in your space link to a website or WhatsApp. When customers want to learn more or make a booking, they have nowhere to go. Adding a WhatsApp link can generate more enquiries.`,
      owner_action_zh: "今個星期喺 IG bio 加一個 WhatsApp click-to-chat 連結（或者 Linktree），等客人一撳就可以直接查詢。",
      owner_action_en: "This week, add a WhatsApp click-to-chat link (or a Linktree) to your IG bio so customers can reach out with one tap.",
      evidence: { has_url: false },
      v02_agent_hint: "ig_bio_rewrite_agent",
    });
  }

  // ig.follower_count_low
  const followerCount = payload.followers ?? 0;
  const followerTarget = deriveTarget(getBenchmark(industry, "ig.followers") as number, "higher_is_better");
  const followerCredit = creditFraction(followerCount, followerTarget, "higher_is_better");
  const followerDeduction = gradedDeduction(20, followerCredit);
  if (followerDeduction > 0) {
    score -= followerDeduction;
    findings.push({
      finding_key: "ig.follower_count_low",
      module: "ig",
      // Severity stays anchored to the old raw threshold, not the new credit
      // fraction, on purpose: the design deliberately reuses existing
      // calibration rather than inventing a new severity boundary nobody has
      // reviewed. Near this boundary the deduction is now smooth, so
      // "critical" and "warning" can cost nearly the same points — severity
      // marks a qualitatively broken state, not a promise that critical
      // always costs more than warning. (Same reasoning as gbp.ts's
      // reviews_volume_low and rating_low.)
      severity: followerCount < 100 ? "critical" : "warning",
      score_impact: -followerDeduction,
      owner_message_zh: `你嘅 IG 只有 ${followerCount} 個 followers，${industry || "同行"} 成功帳號平均超過 ${getBenchmark(industry, "ig.followers")} 個，理想目標係 ${followerTarget} 個。追蹤人數太少代表你嘅宣傳觸及率極低，就算出再多 post，真正睇到嘅潛在客人都好有限。`,
      owner_message_en: `Your IG has only ${followerCount} followers — successful ${industry || "industry"} accounts average over ${getBenchmark(industry, "ig.followers")}, and ${followerTarget} is the real target. A low follower count means extremely limited reach: even frequent posts will be seen by very few potential customers.`,
      owner_action_zh: "今個星期出 3 條 Reels，用返個 industry 熱門音樂/trend，再喺 bio 連結加個 IG Story 投票，帶動 profile 訪客轉做 followers。",
      owner_action_en: "Post 3 Reels this week using trending audio in your category, and add an IG Story poll to your bio link to convert profile visits into follows.",
      evidence: { followers: followerCount },
      v02_agent_hint: "ig_growth_agent",
    });
  }

  // ig.content_consistency: posting recency. The zero-posts case is a hard
  // floor — categorically worse than "posted but stale," not a point further
  // along the same curve. The has-posts-but-stale case is graduated, with a
  // ceiling of max(2x target, 30) so the curve reaches full deduction exactly
  // at today's existing 30-day critical cliff, not before it.
  const posts = payload.posts_last_12 ?? [];
  const postTimes = posts
    .map((p) => (p.posted_at ? new Date(p.posted_at).getTime() : null))
    .filter((d): d is number => d !== null);

  if (posts.length === 0) {
    score -= 20;
    findings.push({
      finding_key: "ig.content_consistency",
      module: "ig",
      severity: "critical",
      score_impact: -20,
      owner_message_zh:
        "你過去 12 個月冇發現任何 post，IG 算法已經唔再推你。客人搵你嘅時候只見到一個空帳號，印象極差。",
      owner_message_en: "No posts were found on your IG in the past 12 months — the algorithm has stopped promoting your account. When customers look you up, they see an empty profile, which makes a very poor first impression.",
      owner_action_zh: "今個星期用手機影 3 張你舖頭、產品或者服務嘅相，直接出 post，唔使等「完美」先出。",
      owner_action_en: "This week, take 3 phone photos of your shop, products, or service and publish them as posts — don't wait for a \"perfect\" shot.",
      evidence: { days_since_last_post: null },
      v02_agent_hint: "content_calendar_agent",
    });
  } else if (postTimes.length > 0) {
    const recencyAverage = getBenchmark(industry, "ig.post_recency_days") as number;
    const recencyTarget = deriveTarget(recencyAverage, "lower_is_better");
    const daysSinceLast = Math.round((Date.now() - Math.max(...postTimes)) / MS_PER_DAY);
    const recencyCredit = creditFraction(daysSinceLast, recencyTarget, "lower_is_better", { ceiling: 30 });
    const recencyDeduction = gradedDeduction(20, recencyCredit);
    if (recencyDeduction > 0) {
      score -= recencyDeduction;
      findings.push({
        finding_key: "ig.content_consistency",
        module: "ig",
        // Severity stays anchored to the old raw threshold, not the new credit
        // fraction, on purpose: the design deliberately reuses existing
        // calibration rather than inventing a new severity boundary nobody has
        // reviewed. Near this boundary the deduction is now smooth, so
        // "critical" and "warning" can cost nearly the same points — severity
        // marks a qualitatively broken state, not a promise that critical
        // always costs more than warning. (Same reasoning as gbp.ts's
        // reviews_volume_low and rating_low, and ig.ts's follower_count_low.)
        severity: daysSinceLast > 30 ? "critical" : "warning",
        score_impact: -recencyDeduction,
        owner_message_zh: `你已經 ${daysSinceLast} 日冇出過 IG post，${industry || "同行"} 理想情況係每 ${recencyTarget} 日內出一次。長期唔更新，IG 演算法會大幅減少你嘅曝光，客人亦會以為你已經結業。`,
        owner_message_en: `You haven't posted on IG for ${daysSinceLast} days — the ideal is at least once every ${recencyTarget} days. A long silence sharply cuts your reach in the algorithm and makes customers think you've closed.`,
        owner_action_zh: "即刻用手機影一張相出 post，重新開始活躍 — 唔好等內容夠靚先出，先止住流失緊嘅曝光。",
        owner_action_en: "Post something today, even a quick phone photo — restart activity now rather than waiting for the perfect shot, to stop the reach bleed.",
        evidence: { days_since_last_post: daysSinceLast },
        v02_agent_hint: "content_calendar_agent",
      });
    }
  }

  // ig.content_mix: all posts same media_type
  if (posts.length > 0) {
    const types = posts
      .map((p) => p.media_type)
      .filter((t): t is string => !!t);
    const uniqueTypes = new Set(types);
    if (types.length > 0 && uniqueTypes.size === 1) {
      score -= 15;
      findings.push({
        finding_key: "ig.content_mix",
        module: "ig",
        severity: "warning",
        score_impact: -15,
        owner_message_zh: `你嘅 IG post 只用單一格式（例如全部相，冇 Reels）。${industry || "行業"}成功嘅帳號會混合相、Reels 同 Story。Reels 目前係 IG 演算法最優先推送嘅格式，唔用 Reels 等於放棄最大嘅免費曝光機會。`,
        owner_message_en: `Your IG posts use only one format (e.g. all photos, no Reels). Successful ${industry || "industry"} accounts mix photos, Reels, and Stories. Reels are the highest-priority format for the IG algorithm right now — not using Reels means missing out on the biggest free reach opportunity.`,
        owner_action_zh: "今個星期用手機影一條 15 秒 Reels（例如產品開箱或者服務過程），加背景音樂出 post，試吓混合格式。",
        owner_action_en: "This week, film one 15-second Reel on your phone (e.g. a product unboxing or behind-the-scenes clip) with background music to start mixing up your formats.",
        evidence: { types_found: [...uniqueTypes] },
        v02_agent_hint: "reels_hook_agent",
      });
    }
  }

  // ig.engagement_low: (avg_likes + avg_comments) / followers, graduated against
  // the target. This is the one gradeable check whose single existing tier was
  // "critical" rather than "warning" — it stays critical throughout the whole
  // below-target range, mirroring what every other single-tier check does with
  // its own (warning) severity.
  const followers = payload.followers ?? 0;
  if (posts.length > 0 && followers > 0) {
    const totalLikes = posts.reduce((sum, p) => sum + (p.like_count ?? 0), 0);
    const totalComments = posts.reduce(
      (sum, p) => sum + (p.comment_count ?? 0),
      0,
    );
    const avgLikes = totalLikes / posts.length;
    const avgComments = totalComments / posts.length;
    const engagementRate = (avgLikes + avgComments) / followers;
    const engagementTarget = deriveTarget(getBenchmark(industry, "ig.engagement_rate") as number, "higher_is_better");
    const engagementCredit = creditFraction(engagementRate * 100, engagementTarget, "higher_is_better");
    const engagementDeduction = gradedDeduction(20, engagementCredit);

    if (engagementDeduction > 0) {
      score -= engagementDeduction;
      const engRatePct = (engagementRate * 100).toFixed(2);
      findings.push({
        finding_key: "ig.engagement_low",
        module: "ig",
        severity: "critical",
        score_impact: -engagementDeduction,
        owner_message_zh: `你嘅 IG 互動率只有 ${engRatePct}%，${industry || "同行"} 平均係 ${getBenchmark(industry, "ig.engagement_rate")}%，理想目標係 ${engagementTarget}%。低互動率代表你嘅內容唔吸引目標客人，演算法會進一步減少你嘅曝光。改善內容質量同 hashtag 策略可以提升互動。`,
        owner_message_en: `Your IG engagement rate is only ${engRatePct}% — the ${industry || "industry"} average is ${getBenchmark(industry, "ig.engagement_rate")}%, and ${engagementTarget}% is the real target. Low engagement means your content isn't resonating with your target customers, and the algorithm will further reduce your reach. Improving content quality and hashtag strategy can help.`,
        owner_action_zh: "今個星期喺下一個 post 度加一個問題做 caption（例如「你哋鐘意邊款？」），再用 5 至 8 個相關 hashtag，鼓勵客人留言。",
        owner_action_en: "In your next post this week, add a question to the caption (e.g. \"Which one do you prefer?\") and use 5–8 relevant hashtags to encourage comments.",
        evidence: { engagement_rate: parseFloat(engRatePct) },
        v02_agent_hint: "reels_hook_agent",
      });
    }
  }

  // ig.story_highlights_missing
  const highlightsTarget = deriveTarget(getBenchmark(industry, "ig.highlights") as number, "higher_is_better");
  const highlightsCredit = creditFraction(payload.highlights_count ?? 0, highlightsTarget, "higher_is_better");
  const highlightsDeduction = gradedDeduction(15, highlightsCredit);
  if (highlightsDeduction > 0) {
    score -= highlightsDeduction;
    findings.push({
      finding_key: "ig.story_highlights_missing",
      module: "ig",
      severity: "warning",
      score_impact: -highlightsDeduction,
      owner_message_zh: `你嘅 IG 有 ${payload.highlights_count ?? 0} 個 Story Highlights。${industry || "同行"} 平均有 ${getBenchmark(industry, "ig.highlights")} 個，理想目標係 ${highlightsTarget} 個，用嚟展示服務、價錢同客人評價。新客第一個動作就係睇 highlights。`,
      owner_message_en: `Your IG has ${payload.highlights_count ?? 0} Story Highlights. ${industry || "Industry"} peers average ${getBenchmark(industry, "ig.highlights")}, and ${highlightsTarget} is the real target — used to showcase services, pricing, and reviews. The first thing a new customer does is check your highlights.`,
      owner_action_zh: "今個星期整 3 個 Story Highlights：「服務／產品」、「價錢」同「客人評價」，將舊 Story 或者新相分類擺入去。",
      owner_action_en: "This week, create 3 Story Highlights — \"Services/Products\", \"Pricing\", and \"Reviews\" — and sort existing or new Stories into them.",
      evidence: {
        highlights_count: payload.highlights_count ?? 0,
        highlight_titles: payload.highlight_titles ?? [],
      },
      v02_agent_hint: "ig_bio_rewrite_agent",
    });
  }

  // ig.reels_missing: reels_count === 0
  if ((payload.reels_count ?? 0) === 0) {
    score -= 15;
    findings.push({
      finding_key: "ig.reels_missing",
      module: "ig",
      severity: "warning",
      score_impact: -15,
      owner_message_zh:
        `你嘅 IG 冇發佈任何 Reels。Reels 係目前 IG 演算法最優先推送嘅格式，唔用 Reels 等於放棄最大嘅免費曝光機會。${industry || "同行"}成功嘅帳號平均每月都會發佈 Reels。`,
      owner_message_en: `Your IG has no Reels published. Reels are the highest-priority format for the IG algorithm right now — not publishing Reels means you're giving up the biggest free reach opportunity. Successful ${industry || "industry"} accounts typically post Reels every month.`,
      owner_action_zh: "今個星期用手機影同剪一條 15 至 30 秒嘅 Reels，介紹一個產品或者服務重點，用返熱門音樂發佈。",
      owner_action_en: "This week, film and edit one 15–30 second Reel highlighting a product or service, and publish it using a trending audio track.",
      evidence: { reels_count: 0 },
      v02_agent_hint: "reels_hook_agent",
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
