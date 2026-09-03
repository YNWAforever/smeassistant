import type { Finding, GBPPayload, ModuleScore } from "../types";
import { getBenchmark } from "../benchmarks";
import { computeOwnerResponseRate } from "../response-rate";
import { creditFraction, deriveTarget, gradedDeduction } from "../graduated-score";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function scoreGBP(payload: GBPPayload, industry?: string | null): ModuleScore {
  if (!payload.available) {
    return {
      status: "unavailable",
      score: null,
      confidence: "none",
      evidenceCollectedAt: null,
      limitationCode: "GBP_NOT_MEASURED",
      findings: [],
    };
  }

  const findings: Finding[] = [];
  let score = 100;
  const now = Date.now();

  // gbp.reviews_volume_low
  const reviewsCount = payload.reviews_count ?? 0;
  const reviewsTarget = deriveTarget(getBenchmark(industry, "gbp.reviews") as number, "higher_is_better");
  const reviewsCredit = creditFraction(reviewsCount, reviewsTarget, "higher_is_better");
  const reviewsDeduction = gradedDeduction(20, reviewsCredit);
  if (reviewsDeduction > 0) {
    score -= reviewsDeduction;
    findings.push({
      finding_key: "gbp.reviews_volume_low",
      module: "gbp",
      // Severity stays anchored to the old raw threshold, not the new
      // credit fraction, on purpose: the design deliberately reuses
      // existing calibration rather than inventing a new severity
      // boundary nobody has reviewed. Near this boundary the deduction is
      // now smooth, so "critical" and "warning" can cost nearly the same
      // points -- severity marks a qualitatively broken state, not a
      // promise that critical always costs more than warning.
      severity: reviewsCount < 10 ? "critical" : "warning",
      score_impact: -reviewsDeduction,
      owner_message_zh: `你喺 Google 只有 ${reviewsCount} 個評語，${industry || "同行"} 平均有 ${getBenchmark(industry, "gbp.reviews")} 個，理想目標係去到 ${reviewsTarget} 個先算追得上做得好嘅同行。太少 review 令新客唔敢試你，直接影響 Google 本地排名同點擊率。`,
      owner_message_en: `You have only ${reviewsCount} Google reviews — the ${industry || "industry"} average is ${getBenchmark(industry, "gbp.reviews")}, but ${reviewsTarget} is the real target to compete with the businesses doing this well. Too few reviews deter new customers and directly hurts your Google local ranking and click-through rate.`,
      owner_action_zh: "今個星期 send 個 Google review 連結俾最近 10 個客，直接叫佢哋幫手留一兩句評語，目標呢個月加 5 個新 review。",
      owner_action_en: "Text your last 10 customers a direct Google review link and ask for 1-2 lines about their experience — aim for 5 new reviews this month.",
      evidence: { reviews_count: reviewsCount },
      v02_agent_hint: "review_reply_agent",
    });
  }

  // gbp.rating_low
  const rating = payload.rating ?? 0;
  if (rating > 0) {
    const ratingTarget = deriveTarget(getBenchmark(industry, "gbp.rating") as number, "higher_is_better", { ceiling: 5.0 });
    const ratingCredit = creditFraction(rating, ratingTarget, "higher_is_better", { floor: 1.0 });
    const ratingDeduction = gradedDeduction(25, ratingCredit);
    if (ratingDeduction > 0) {
      score -= ratingDeduction;
      findings.push({
        finding_key: "gbp.rating_low",
        module: "gbp",
        // Severity stays anchored to the old raw threshold, not the new
        // credit fraction, on purpose: the design deliberately reuses
        // existing calibration rather than inventing a new severity
        // boundary nobody has reviewed. Near this boundary the deduction is
        // now smooth, so "critical" and "warning" can cost nearly the same
        // points -- severity marks a qualitatively broken state, not a
        // promise that critical always costs more than warning.
        severity: rating < 3.5 ? "critical" : "warning",
        score_impact: -ratingDeduction,
        owner_message_zh: `你嘅 Google 評分係 ${rating.toFixed(1)} 分，${industry || "同行"} 平均係 ${getBenchmark(industry, "gbp.rating")} 分，理想目標係去到 ${ratingTarget.toFixed(1)} 分先追得上表現好嘅同行。低評分會直接減少客人 click 入你嘅意願，甚至 Google 會降低你嘅排名。`,
        owner_message_en: `Your Google rating is ${rating.toFixed(1)} — the ${industry || "industry"} average is ${getBenchmark(industry, "gbp.rating")}, and ${ratingTarget.toFixed(1)} is the real target to aim for. A low rating directly reduces customers' willingness to click on you and can cause Google to lower your ranking.`,
        owner_action_zh: "今個星期揀返最近 3 個負評，逐個回覆道歉並講出實際改善方法，例如換咗貨源或者調整咗流程。",
        owner_action_en: "This week, pick your 3 most recent negative reviews and reply to each one with a genuine apology and the specific fix you've made, e.g. a supplier change or process update.",
        evidence: { rating },
        v02_agent_hint: "review_reply_agent",
      });
    }
  }

  // gbp.review_freshness
  const reviews = payload.reviews ?? [];
  if (reviews.length > 0) {
    const latestReviewTime = reviews
      .map((r) => (r.time ? new Date(r.time).getTime() : 0))
      .filter((t) => t > 0)
      .reduce((max, t) => Math.max(max, t), 0);

    if (latestReviewTime > 0) {
      const daysSinceLatest = (now - latestReviewTime) / MS_PER_DAY;
      const freshnessTarget = deriveTarget(getBenchmark(industry, "gbp.review_freshness_days") as number, "lower_is_better");
      const freshnessCredit = creditFraction(daysSinceLatest, freshnessTarget, "lower_is_better", { ceiling: 90 });
      const freshnessDeduction = gradedDeduction(15, freshnessCredit);
      if (freshnessDeduction > 0) {
        score -= freshnessDeduction;
        findings.push({
          finding_key: "gbp.review_freshness",
          module: "gbp",
          severity: "warning",
          score_impact: -freshnessDeduction,
          owner_message_zh: `你最近 ${Math.round(daysSinceLatest)} 日都冇新評語。${industry || "同行"} 平均 ${getBenchmark(industry, "gbp.review_freshness_days")} 日內會有新評語，理想情況係 ${Math.round(freshnessTarget)} 日內。Google 算法會認為你嘅業務活躍度低。定期邀請新客人留評語，保持新鮮度。`,
          owner_message_en: `You haven't received a new review in the past ${Math.round(daysSinceLatest)} days. The ${industry || "industry"} average is a new review every ${getBenchmark(industry, "gbp.review_freshness_days")} days, and the ideal is within ${Math.round(freshnessTarget)} days. Google's algorithm will see your business as less active. Regularly invite new customers to leave reviews to maintain freshness.`,
          owner_action_zh: "今個星期揀 3 個熟客，親自 WhatsApp 佢哋 Google review 連結，禮貌咁邀請佢哋留返個新評語。",
          owner_action_en: "This week, WhatsApp 3 regular customers directly with your Google review link and politely ask them to leave a fresh review.",
          evidence: { days_since_last_review: Math.round(daysSinceLatest) },
          v02_agent_hint: "review_reply_agent",
        });
      }
    }
  } else if (reviewsCount > 0) {
    // Has reviews count but no review data — treat as potentially stale, skip
  }

  // gbp.owner_response_low. Google Places returns at most ~5 reviews, so the
  // scraped sample is often far smaller than reviews_count (the real
  // population). A rate is only measurable when the sample covers the whole
  // population; otherwise responded/reviews.length would silently score
  // against reviews we never looked at.
  if (reviews.length > 0) {
    const { measurable, rate: responseRate } = computeOwnerResponseRate(reviews, payload.reviews_count);
    if (measurable && responseRate !== null) {
      const responseTarget = deriveTarget(getBenchmark(industry, "gbp.owner_response_rate") as number, "higher_is_better", { ceiling: 100 });
      const responseCredit = creditFraction(responseRate * 100, responseTarget, "higher_is_better");
      const responseDeduction = gradedDeduction(15, responseCredit);
      if (responseDeduction > 0) {
        score -= responseDeduction;
        const responseRatePct = Math.round(responseRate * 100);
        findings.push({
          finding_key: "gbp.owner_response_low",
          module: "gbp",
          severity: "warning",
          score_impact: -responseDeduction,
          owner_message_zh: `你只回覆咗 ${responseRatePct}% 嘅評語。${industry || "同行"} 平均回覆率係 ${getBenchmark(industry, "gbp.owner_response_rate")}%，理想目標係 ${Math.round(responseTarget)}%。回覆評語係向新客人展示你重視服務嘅最佳方式。建議每條評語都要回覆，特別係負評。`,
          owner_message_en: `You've only responded to ${responseRatePct}% of your reviews. The ${industry || "industry"} average response rate is ${getBenchmark(industry, "gbp.owner_response_rate")}%, and ${Math.round(responseTarget)}% is the real target. Replying to reviews is the best way to show new customers you care about service. Aim to reply to every review, especially negative ones.`,
          owner_action_zh: "今個星期抽 20 分鐘，登入 Google Business Profile 回覆晒所有未覆嘅評語，由最新嘅負評開始覆起。",
          owner_action_en: "Set aside 20 minutes this week to log into Google Business Profile and reply to every unanswered review, starting with the most recent negative one.",
          evidence: { response_rate: responseRatePct },
          v02_agent_hint: "review_reply_agent",
        });
      }
    }
  }

  // gbp.photos_freshness. No per-industry benchmark exists for "days since
  // last photo" — target and ceiling derive from today's own flat 90-day
  // cutoff instead of benchmarks.ts, industry-invariant like the cutoff was.
  if (payload.latest_photo_at) {
    const latestPhotoTime = new Date(payload.latest_photo_at).getTime();
    const daysSincePhoto = (now - latestPhotoTime) / MS_PER_DAY;
    const photoFreshnessTarget = 45;
    const photoFreshnessCredit = creditFraction(daysSincePhoto, photoFreshnessTarget, "lower_is_better", { ceiling: 90 });
    const photoFreshnessDeduction = gradedDeduction(10, photoFreshnessCredit);
    if (photoFreshnessDeduction > 0) {
      score -= photoFreshnessDeduction;
      findings.push({
        finding_key: "gbp.photos_freshness",
        module: "gbp",
        severity: "warning",
        score_impact: -photoFreshnessDeduction,
        owner_message_zh: `你上次上載相片係 ${Math.round(daysSincePhoto)} 日前，理想情況係 ${photoFreshnessTarget} 日內就要有新相。新鮮嘅相片可以提高 Google 搜尋排名，亦令客人更容易了解你嘅環境同服務。`,
        owner_message_en: `Your last photo upload was ${Math.round(daysSincePhoto)} days ago — aim for a fresh photo at least every ${photoFreshnessTarget} days. Fresh photos improve your Google search ranking and help customers understand your space and services.`,
        owner_action_zh: "今個星期用手機影 5 張最新嘅店面、產品或者服務相片，上載去 Google Business Profile。",
        owner_action_en: "This week, take 5 fresh photos of your storefront, products, or service on your phone and upload them to Google Business Profile.",
        evidence: { days_since_photo: Math.round(daysSincePhoto) },
        v02_agent_hint: "gbp_photo_pack_agent",
      });
    }
  }

  // gbp.photos_volume. Only penalize a measured count — the SerpApi GBP
  // fallback cannot report photos, so treating undefined as 0 would dock
  // points for a signal never observed.
  const photosCount = payload.photos_count;
  if (photosCount !== undefined) {
    const photosTarget = deriveTarget(getBenchmark(industry, "gbp.photos") as number, "higher_is_better");
    const photosCredit = creditFraction(photosCount, photosTarget, "higher_is_better");
    const photosDeduction = gradedDeduction(10, photosCredit);
    if (photosDeduction > 0) {
      score -= photosDeduction;
      findings.push({
        finding_key: "gbp.photos_volume",
        module: "gbp",
        severity: "warning",
        score_impact: -photosDeduction,
        owner_message_zh: `你嘅 Google 商家只有 ${photosCount} 張相片，${industry || "同行"} 平均有 ${getBenchmark(industry, "gbp.photos")} 張以上，理想目標係 ${photosTarget} 張。相片多嘅商家平均獲得 42% 更多 Google 地圖點擊。`,
        owner_message_en: `Your Google Business profile has only ${photosCount} photos — the ${industry || "industry"} average is ${getBenchmark(industry, "gbp.photos")} or more, and ${photosTarget} is the real target. Businesses with more photos get an average of 42% more Google Maps clicks.`,
        owner_action_zh: "今個星期補影同上載至少 10 張相片，包括舖面、招牌、內部環境同埋熱賣產品各幾張。",
        owner_action_en: "This week, shoot and upload at least 10 photos covering your storefront, signage, interior, and a few of your best-selling products or services.",
        evidence: { photos_count: photosCount },
        v02_agent_hint: "gbp_photo_pack_agent",
      });
    }
  }

  // gbp.hours_incomplete: hours_complete === false
  if (payload.hours_complete === false) {
    score -= 15;
    findings.push({
      finding_key: "gbp.hours_incomplete",
      module: "gbp",
      severity: "critical",
      score_impact: -15,
      owner_message_zh:
        `你嘅 Google 商家資料未有完整填寫營業時間。${industry || "同行"}大多都有完整營業時間。客人唔知你幾點開門，直接轉去搵競爭對手。立即登入 Google Business Profile 補全。`,
      owner_message_en:
        `Your Google Business profile is missing complete opening hours. Most ${industry || "industry"} businesses have full hours listed. Customers who can't find when you're open will go straight to a competitor — log in to Google Business Profile now to fill this in.`,
      owner_action_zh:
        "今日就登入 Google Business Profile，逐日填妥星期一至日嘅正確營業時間，包括假期特別安排。",
      owner_action_en:
        "Log into Google Business Profile today and fill in accurate opening hours for every day of the week, including any holiday exceptions.",
      evidence: { hours_complete: false },
      v02_agent_hint: "gbp_post_agent",
    });
  }

  // gbp.categories_missing: categories.length < 1
  const categories = payload.categories ?? [];
  if (categories.length < 1) {
    score -= 10;
    findings.push({
      finding_key: "gbp.categories_missing",
      module: "gbp",
      severity: "warning",
      score_impact: -10,
      owner_message_zh:
        `你嘅 Google 商家未設置業務類別。設置正確類別可以讓你出現喺更多相關搜尋結果，係免費嘅 SEO 優化。${industry || "同行"}成功嘅商家都會設置至少一個類別。`,
      owner_message_en:
        `Your Google Business profile has no business category set. Setting the right category lets you appear in more relevant search results — it's free SEO. Successful ${industry || "industry"} businesses always set at least one category.`,
      owner_action_zh:
        "今日入去 Google Business Profile 嘅「業務類別」設定，加返一個最貼切嘅主要類別同最多 9 個相關次要類別。",
      owner_action_en:
        "Go into the Google Business Profile category settings today and set the single most accurate primary category, plus up to 9 relevant secondary categories.",
      evidence: { categories_count: 0 },
      v02_agent_hint: "gbp_post_agent",
    });
  }

  // gbp.posts_inactive: recent_posts_count === 0
  // Only penalize when posts were actually measured. The Google Places API doesn't return GBP posts,
  // so the scraper never sets recent_posts_count — treating undefined as 0 would dock -10 from every
  // business for a signal we never observed. `=== 0` fires only on a real measured zero.
  if (payload.recent_posts_count === 0) {
    score -= 10;
    findings.push({
      finding_key: "gbp.posts_inactive",
      module: "gbp",
      severity: "info",
      score_impact: -10,
      owner_message_zh:
        `你最近冇喺 Google 商家發佈任何帖文。定期發佈優惠、活動或者更新，可以提高你喺 Google 搜尋嘅曝光率。${industry || "同行"}活躍嘅商家會每週發佈帖文保持曝光。`,
      owner_message_en:
        `You haven't published any posts on your Google Business profile recently. Regularly posting offers, events, or updates increases your visibility in Google Search. Active ${industry || "industry"} businesses post weekly to maintain exposure.`,
      owner_action_zh:
        "今個星期發佈第一個 Google Post，介紹一個現有優惠、新產品或者近期活動，配一張相就得。",
      owner_action_en:
        "Publish your first Google Post this week featuring a current promotion, new product, or recent event — one photo is enough to get started.",
      evidence: { recent_posts_count: 0 },
      v02_agent_hint: "gbp_post_agent",
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
