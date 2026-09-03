import type { IGPayload, GBPPayload, AEOPayload, MerchantPerformanceEvidence } from "@sme-scanner/scoring";
import { getMarketConfig, type Market } from "@sme-scanner/region";
import { buildMerchantQueryPlan } from "./query-plan";
import { resolveSearchTerm, resolveSearchTermEn } from "./place-type-terms";
import { domainFromUrl, type MerchantEntity } from "./entity-matcher";
import { shouldRetryAiMode } from "./retry-decision";
import { nameVariants } from "./name-variants";
import {
  normalizeGoogleAiModeRun,
  normalizeGoogleMapsRun,
  normalizeGoogleSearchRun,
  toAeoPerformanceRun,
} from "./serpapi-normalizers";
import {
  fetchGoogleSearchWithAiOverview,
  type SerpApiFetcher,
} from "./ai-overview-fetch";
import type { ClaimedScanJob, ScanStage } from "./processor";
import { scrapeGBP } from "./gbp-collector";
import type { ProviderResult, ProviderConfidence } from "./provider-result";
import { hasUsableAeoEvidence } from "./aeo-evidence";
import { resolveIgConfidence } from "./ig-confidence";
import { resolveAeoConfidence } from "./aeo-confidence";
import { deriveTrustProvider } from "./trust-confidence";
import {
  isSerpApiQuotaExhausted,
  resolveSerpApiKeys,
  withSerpApiKeyFallback,
} from "./serpapi-keys";
import { normalizeEvidence } from "./evidence-normalize";

const IG_USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/;
const IG_SHORTCODE_RE = /^[A-Za-z0-9_-]{1,64}$/;
const IG_STORY_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

function instagramMediaPermalink(kind: "p" | "reel", shortcode: string): string | null {
  return IG_SHORTCODE_RE.test(shortcode)
    ? `https://www.instagram.com/${kind}/${shortcode}/`
    : null;
}

function instagramStoryPermalink(username: string, storyId: string): string | null {
  return IG_USERNAME_RE.test(username) && IG_STORY_ID_RE.test(storyId)
    ? `https://www.instagram.com/stories/${username}/${storyId}/`
    : null;
}

export async function collectScanProviders(
  job: ClaimedScanJob,
  setStage: (stage: ScanStage) => Promise<void>,
) {
  const market = ((job.region as Market) === "tw" ? "tw" : "hk") as Market;
  await setStage("collecting_ig_gbp");
  // Trimmed and checked here rather than passed through as "": scrapeIG posts
  // this straight into username_or_url, and RapidAPI answers an empty one with
  // HTTP 200 and {"message":"username_or_url is required"} -- which scrapeIG
  // cannot tell apart from a real lookup failure, so it retried three times and
  // the module surfaced as IG_PROVIDER_FAILED. A merchant with no Instagram is
  // not a failure and is not retryable.
  const igHandle = job.ig_handle?.trim() ?? "";
  const [igResult, gbpResult] = await Promise.all([
    igHandle ? scrapeIG(igHandle) : Promise.resolve({ payload: { available: false, followers: 0 }, raw: null }),
    scrapeGBP(job.business_name, job.district || "", market, job.merchant_evidence),
  ]);
  await setStage("collecting_aeo");
  const aeoResult = await runSerpAEO(
    job.business_name,
    job.industry || "",
    job.district || "",
    job.website_url,
    gbpResult.provider.status === "measured" ? gbpResult.provider.data : { available: false },
    market,
  );

  const collectedAt = new Date().toISOString();
  const toProvider = <T extends { available: boolean }>(
    payload: T,
    keyPresent: boolean,
    unavailableCode: string,
    failedCode: string,
    options: {
      usable?: (value: T) => boolean;
      // Defaults to the pre-existing literal so a call site that doesn't pass
      // a grader keeps its old behaviour rather than silently changing.
      confidence?: (value: T) => ProviderConfidence;
    } = {},
  ): ProviderResult<T> => {
    const usable = options.usable ?? ((value: T) => value.available);
    const confidence = options.confidence ?? (() => "medium" as const);
    if (payload.available && usable(payload)) {
      return { status: "measured", data: payload, confidence: confidence(payload), collectedAt };
    }
    return keyPresent
      ? { status: "failed", limitationCode: failedCode, retryable: true }
      : { status: "unavailable", limitationCode: unavailableCode };
  };

  const raw = { ig: igResult.raw, gbp: gbpResult.raw, aeo: aeoResult.raw };
  const evidenceRaw = {
    ...(igResult.raw ? { ig: igResult.raw } : {}),
    ...(gbpResult.raw ? { gbp: gbpResult.raw } : {}),
    ...(aeoResult.raw ? { aeo: aeoResult.raw } : {}),
  };
  // "The merchant gave us no handle" is a third state, distinct from both "our
  // key is missing" (NOT_CONFIGURED) and "the lookup broke" (FAILED). Reporting
  // it as failed told merchants a retryable error had occurred when there was
  // nothing to retry, and dragged trust to TRUST_NOT_MEASURED alongside it.
  const igProvider: ProviderResult<IGPayload> = igHandle
    ? toProvider(igResult.payload, Boolean(process.env.RAPIDAPI_INSTAGRAM_KEY), "IG_PROVIDER_NOT_CONFIGURED", "IG_PROVIDER_FAILED", { confidence: (payload) => resolveIgConfidence(payload, job.ig_match_provenance) })
    : { status: "unavailable", limitationCode: "IG_HANDLE_NOT_PROVIDED" };
  const gbpProvider = gbpResult.provider;

  return {
    ig: igProvider,
    gbp: gbpProvider,
    trust: deriveTrustProvider(igProvider, gbpProvider, collectedAt),
    // Same resolver runSerpAEO uses to pick a key, so "configured" here cannot
    // disagree with whether the collector actually had one. Reading SERPAPI_KEY
    // directly told an operator who had set SERPAPI_API_KEY that AEO was not
    // configured, and marked a real, retryable failure as permanent.
    aeo: toProvider(aeoResult.payload, resolveSerpApiKeys().length > 0, "AEO_PROVIDER_NOT_CONFIGURED", "AEO_PROVIDER_FAILED", { usable: hasUsableAeoEvidence, confidence: resolveAeoConfidence }),
    evidence: normalizeEvidence(evidenceRaw, collectedAt),
    raw,
  };
}

async function scrapeIG(igHandle: string): Promise<{ payload: IGPayload; raw: NonNullable<import("@sme-scanner/contracts").RawData["ig"]> | null }> {
  const rapidApiKey = process.env.RAPIDAPI_INSTAGRAM_KEY;
  if (!rapidApiKey) {
    console.error("[scrapeIG] No RAPIDAPI_INSTAGRAM_KEY");
    return { payload: { available: false, followers: 0 }, raw: null };
  }

  const rapidHeaders = {
    "x-rapidapi-host": "instagram-scraper-stable-api.p.rapidapi.com",
    "x-rapidapi-key": rapidApiKey,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const postBody = (params: Record<string, string>) => new URLSearchParams(params).toString();

  // ── 1. Profile ──
  let profileData: Record<string, any> | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch("https://instagram-scraper-stable-api.p.rapidapi.com/ig_get_fb_profile.php", {
        method: "POST",
        headers: rapidHeaders,
        body: postBody({ username_or_url: igHandle }),
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) {
        console.error("[scrapeIG] Profile HTTP", resp.status, "attempt", attempt + 1);
        if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      // Untyped RapidAPI response boundary -- matches parsePostItems/parseReelItems below.
      const raw = (await resp.json()) as any;
      const data = raw.user_data ?? raw.data ?? raw;
      if (raw.error || raw.message || (!data.username && !data.pk && !data.id)) {
        const errMsg = String(raw.error ?? raw.message ?? "no user data");
        console.error("[scrapeIG] Profile API error attempt", attempt + 1, ":", errMsg);
        if (attempt < 2) {
          // Retry on ANY API-level error — rate limits use various messages:
          // "429", "quota exceeded", "Too Many Requests", etc.
          const isRateLimit = /429|quota|rate.?limit|too.?many/i.test(errMsg);
          await new Promise((r) => setTimeout(r, isRateLimit ? 5000 : 2000));
          continue;
        }
        return { payload: { available: false, followers: 0 }, raw: null };
      }
      profileData = data;
      break;
    } catch (e) {
      console.error("[scrapeIG] Profile exception attempt", attempt + 1, ":", e);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
    }
  }

  if (!profileData) {
    console.error("[scrapeIG] All profile attempts failed for:", igHandle);
    return { payload: { available: false, followers: 0 }, raw: null };
  }

  const followers = profileData.follower_count ?? 0;
  const following = profileData.following_count ?? 0;
  const postsCount = profileData.media_count ?? 0;
  const bio = profileData.biography ?? "";
  const fullName = profileData.full_name ?? "";
  const isPrivate = profileData.is_private ?? false;
  const isVerified = profileData.is_verified ?? false;
  const profilePicUrl = profileData.profile_pic_url_hd ?? profileData.profile_pic_url ?? "";
  const externalUrl = profileData.external_url || profileData.bio_links?.[0]?.url || null;

  if (isPrivate) {
    console.log("[scrapeIG] Private account:", igHandle);
    return { payload: { available: true, username: igHandle, followers }, raw: null };
  }

  console.log("[scrapeIG] Profile success:", fullName || igHandle, "followers:", followers);

  // ── 2. Parallel fan-out: posts, reels, highlights, stories ──
  const [postsResult, reelsResult, highlightsResult, storiesResult] = await Promise.allSettled([
    // Try plain username (same format as highlights which works). Full URL returns carousel children.
    fetch("https://instagram-scraper-stable-api.p.rapidapi.com/get_ig_user_posts.php", {
      method: "POST",
      headers: rapidHeaders,
      body: postBody({ username_or_url: igHandle, pagination_token: "", amount: "20" }),
      signal: AbortSignal.timeout(10000),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null),

    // Try plain username first; we'll fall back to URL format if this returns nothing
    fetch("https://instagram-scraper-stable-api.p.rapidapi.com/get_ig_user_reels.php", {
      method: "POST",
      headers: rapidHeaders,
      body: postBody({ username_or_url: igHandle, pagination_token: "", amount: "12" }),
      signal: AbortSignal.timeout(10000),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null),

    fetch("https://instagram-scraper-stable-api.p.rapidapi.com/get_ig_user_highlights.php", {
      method: "POST",
      headers: rapidHeaders,
      body: postBody({ username_or_url: igHandle, amount: "20", pagination_token: "" }),
      signal: AbortSignal.timeout(10000),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null),

    fetch("https://instagram-scraper-stable-api.p.rapidapi.com/get_ig_user_stories.php", {
      method: "POST",
      headers: rapidHeaders,
      body: postBody({ username_or_url: igHandle }),
      signal: AbortSignal.timeout(10000),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);

  // ── Parse posts ──
  type RawPost = NonNullable<import("@sme-scanner/contracts").RawData["ig"]>["posts"][0];
  type PayloadPost = NonNullable<IGPayload["posts_last_12"]>[0];
  const parsedPosts: PayloadPost[] = [];
  const rawPosts: RawPost[] = [];

  // Reel codes found inside the posts feed (product_type === "clips")
  const reelCodesFromPosts: Array<{ code: string; id: string }> = [];

  const parsePostItems = (rawData: any) => {
    if (!rawData) return;
    // API returns { posts: [...], pagination_token: "..." } — must check rawData.posts
    const items = Array.isArray(rawData)
      ? rawData
      : (rawData.posts ?? rawData.items ?? rawData.user_posts ?? rawData.data?.items ?? rawData.data?.user_posts ?? rawData.data ?? rawData.results ?? []);
    for (const p of items.slice(0, 20)) {
      const node = p.node ?? p;
      const code = String(node.code ?? node.shortcode ?? "");

      // Detect reels in the posts feed: product_type="clips" or media_type=2 (video) but not IGTV
      const rawMediaType = node.media_type as number | undefined;
      const isVideo =
        node.is_video === true ||
        rawMediaType === 2 ||
        (Array.isArray(node.video_versions) && node.video_versions.length > 0) ||
        node.video_duration !== undefined;
      const isReel = node.product_type === "clips" || (isVideo && node.product_type !== "igtv" && node.product_type !== "feed");

      const captionText = (typeof node.caption === "string" ? node.caption : "") || node.caption?.text || node.edge_media_to_caption?.edges?.[0]?.node?.text || "";
      const takenAt = node.taken_at ?? node.taken_at_timestamp;
      const createdAt = node.created_at ?? node.timestamp ?? node.created_time;
      const parsedDate = takenAt
        ? new Date((typeof takenAt === "number" ? takenAt : Number(takenAt)) * 1000).toISOString()
        : createdAt ? new Date(createdAt).toISOString() : undefined;
      const mediaType = isReel || isVideo
        ? "GraphVideo"
        : (node.carousel_media ?? node.carousel_media_count) ? "GraphSidecar" : "GraphImage";
      const likeCount = node.like_count ?? node.likes?.count ?? node.likes ?? node.edge_liked_by?.count ?? node.edge_media_preview_like?.count ?? node.fb_like_count ?? 0;
      const commentCount = node.comment_count ?? node.comments?.count ?? node.comments ?? node.edge_media_to_comment?.count ?? node.edge_media_preview_comment?.count ?? 0;
      const thumbnailUrl = node.thumbnail_url ?? node.image_versions2?.candidates?.[0]?.url ?? node.display_url ?? undefined;
      const id = String(node.id ?? node.pk ?? code ?? "");

      if (isReel) {
        // Collect code for enrichment via get_media_data_v2.php; skip adding to posts panel
        if (code) reelCodesFromPosts.push({ code, id });
        continue;
      }

      parsedPosts.push({ id, caption: captionText, media_type: mediaType, like_count: likeCount, comment_count: commentCount, posted_at: parsedDate });
      rawPosts.push({
        id,
        caption: captionText,
        media_type: mediaType,
        like_count: likeCount,
        comment_count: commentCount,
        posted_at: parsedDate ?? "",
        thumbnail_url: thumbnailUrl,
        permalink: instagramMediaPermalink("p", code),
      });
    }
  };

  if (postsResult.status === "fulfilled" && postsResult.value) {
    parsePostItems(postsResult.value);
  }

  // Detect carousel children: ≤3 items all with composite ids (contains "_") and zero engagement
  const looksLikeCarouselChildren =
    parsedPosts.length > 0 &&
    parsedPosts.length <= 3 &&
    parsedPosts.every((p) => p.id.includes("_") && p.like_count === 0 && p.comment_count === 0);

  // Fallback: if username format returned carousel children, retry with full URL format
  if (parsedPosts.length === 0 || looksLikeCarouselChildren) {
    console.log("[scrapeIG] Posts fallback: trying URL format (username returned", looksLikeCarouselChildren ? "carousel children" : "nothing", ")");
    parsedPosts.length = 0;
    rawPosts.length = 0;
    try {
      const fallbackResp = await fetch("https://instagram-scraper-stable-api.p.rapidapi.com/get_ig_user_posts.php", {
        method: "POST",
        headers: rapidHeaders,
        body: postBody({ username_or_url: `https://www.instagram.com/${igHandle}`, pagination_token: "", amount: "20" }),
        signal: AbortSignal.timeout(10000),
      });
      if (fallbackResp.ok) {
        const fd = await fallbackResp.json();
        if (fd) parsePostItems(fd);
      }
    } catch (e) {
      console.error("[scrapeIG] Posts URL fallback error:", e);
    }
  }

  // Final hover fallback if still no posts
  if (parsedPosts.length === 0) {
    try {
      const hoverUrl = `https://instagram-scraper-stable-api.p.rapidapi.com/ig_get_fb_profile_hover.php?username_or_url=${encodeURIComponent(igHandle)}`;
      const hr = await fetch(hoverUrl, {
        method: "GET",
        headers: { "x-rapidapi-host": "instagram-scraper-stable-api.p.rapidapi.com", "x-rapidapi-key": rapidApiKey },
        signal: AbortSignal.timeout(10000),
      });
      if (hr.ok) {
        const hd = (await hr.json()) as any;
        parsePostItems({ items: hd.user_posts ?? [] });
      }
    } catch (e) {
      console.error("[scrapeIG] Hover fallback error:", e);
    }
  }

  // ── Enrich reels found inside posts feed via get_media_data_v2 ──
  // product_type="clips" items were detected in parsePostItems; fetch their full reel data now.
  // This runs in parallel with the reels-endpoint parsing below.
  type RawReel = NonNullable<import("@sme-scanner/contracts").RawData["ig"]>["reels"][0];
  type PayloadReel = NonNullable<IGPayload["reels_last_12"]>[0];
  const parsedReels: PayloadReel[] = [];
  const rawReels: RawReel[] = [];

  if (reelCodesFromPosts.length > 0) {
    console.log("[scrapeIG] Fetching reel data for", reelCodesFromPosts.length, "reels found in posts feed:", reelCodesFromPosts.map((r) => r.code));
    const reelDataResults = await Promise.allSettled(
      reelCodesFromPosts.slice(0, 6).map(({ code }) =>
        fetch(
          `https://instagram-scraper-stable-api.p.rapidapi.com/get_media_data_v2.php?media_code=${encodeURIComponent(code)}`,
          {
            method: "GET",
            headers: { "x-rapidapi-host": "instagram-scraper-stable-api.p.rapidapi.com", "x-rapidapi-key": rapidApiKey },
            signal: AbortSignal.timeout(8000),
          }
        )
          .then((r) => r.ok ? r.json() : null)
          .catch(() => null)
      )
    );
    for (const [index, result] of reelDataResults.entries()) {
      if (result.status !== "fulfilled" || !result.value) continue;
      const sourceCode = reelCodesFromPosts[index]?.code ?? "";
      // Untyped RapidAPI response boundary -- see the resp.json() sites above.
      const d = result.value as any;
      const node = d.data ?? d.items?.[0] ?? d.media ?? d;
      if (!node) continue;
      const id = String(node.id ?? node.pk ?? "");
      if (!id) continue;
      const captionText = (typeof node.caption === "string" ? node.caption : "") || node.caption?.text || "";
      const takenAt = node.taken_at;
      const parsedDate = takenAt ? new Date((typeof takenAt === "number" ? takenAt : Number(takenAt)) * 1000).toISOString() : undefined;
      const playCount = node.play_count ?? node.view_count ?? node.ig_play_count ?? 0;
      const likeCount = node.like_count ?? 0;
      const commentCount = node.comment_count ?? 0;
      const thumbnailUrl = node.image_versions2?.candidates?.[0]?.url ?? node.thumbnail_url ?? undefined;
      parsedReels.push({ id, caption: captionText, play_count: playCount, like_count: likeCount, comment_count: commentCount, posted_at: parsedDate });
      rawReels.push({
        id,
        caption: captionText,
        play_count: playCount,
        like_count: likeCount,
        comment_count: commentCount,
        posted_at: parsedDate ?? "",
        thumbnail_url: thumbnailUrl,
        permalink: instagramMediaPermalink("reel", sourceCode),
      });
    }
    console.log("[scrapeIG] Reels from posts feed enriched:", parsedReels.length);
  }

  const parseReelItems = (raw: any) => {
    if (!raw) return;
    // API returns { reels: [...], pagination_token: "..." } — must check raw.reels
    const items = Array.isArray(raw) ? raw : (raw.reels ?? raw.items ?? raw.reels_media ?? raw.data?.items ?? raw.data ?? raw.results ?? []);
    for (const p of items.slice(0, 12)) {
      // Response: reels[].node.media — data lives at node.media, not node directly
      const node = p.node?.media ?? p.node ?? p.media ?? p;
      const captionText = (typeof node.caption === "string" ? node.caption : "") || node.caption?.text || "";
      const takenAt = node.taken_at ?? node.taken_at_timestamp;
      const parsedDate = takenAt ? new Date((typeof takenAt === "number" ? takenAt : Number(takenAt)) * 1000).toISOString() : undefined;
      const playCount = node.play_count ?? node.view_count ?? node.ig_play_count ?? 0;
      const likeCount = node.like_count ?? node.likes?.count ?? 0;
      const commentCount = node.comment_count ?? node.comments?.count ?? 0;
      const thumbnailUrl = node.image_versions2?.candidates?.[0]?.url ?? node.thumbnail_url ?? node.cover_frame_url ?? undefined;
      const code = String(node.code ?? node.shortcode ?? "");
      const id = String(node.id ?? node.pk ?? code ?? "");
      if (!id) continue;
      // Dedup: skip if an enriched version already exists (get_media_data_v2 IDs have _userId suffix)
      const alreadyEnriched = parsedReels.some(r => r.id === id || r.id.startsWith(id + "_"));
      if (alreadyEnriched) continue;
      parsedReels.push({ id, caption: captionText, play_count: playCount, like_count: likeCount, comment_count: commentCount, posted_at: parsedDate });
      rawReels.push({
        id,
        caption: captionText,
        play_count: playCount,
        like_count: likeCount,
        comment_count: commentCount,
        posted_at: parsedDate ?? "",
        thumbnail_url: thumbnailUrl,
        permalink: instagramMediaPermalink("reel", code),
      });
    }
  };

  if (reelsResult.status === "fulfilled" && reelsResult.value) {
    parseReelItems(reelsResult.value);
  }

  // Reels fallback: if username format returned nothing, retry with full URL format
  if (parsedReels.length === 0) {
    console.log("[scrapeIG] Reels fallback: trying URL format");
    try {
      const reelsFallback = await fetch("https://instagram-scraper-stable-api.p.rapidapi.com/get_ig_user_reels.php", {
        method: "POST",
        headers: rapidHeaders,
        body: postBody({ username_or_url: `https://www.instagram.com/${igHandle}`, pagination_token: "", amount: "20" }),
        signal: AbortSignal.timeout(10000),
      });
      if (reelsFallback.ok) {
        const rd = await reelsFallback.json();
        parseReelItems(rd);
      }
    } catch (e) {
      console.error("[scrapeIG] Reels URL fallback error:", e);
    }
  }

  // Fallback: if reels endpoint returned nothing, extract video posts from posts feed
  if (parsedReels.length === 0 && parsedPosts.length > 0) {
    console.log("[scrapeIG] Reels fallback: scanning posts feed for video items");
    for (const p of rawPosts) {
      if (p.media_type === "GraphVideo") {
        parsedReels.push({ id: p.id, caption: p.caption, play_count: 0, like_count: p.like_count, comment_count: p.comment_count, posted_at: p.posted_at });
        rawReels.push({
          id: p.id,
          caption: p.caption,
          play_count: 0,
          like_count: p.like_count,
          comment_count: p.comment_count,
          posted_at: p.posted_at,
          thumbnail_url: p.thumbnail_url,
          permalink: p.permalink ?? null,
        });
      }
    }
    console.log("[scrapeIG] Reels fallback found:", parsedReels.length, "video posts");
  }

  // ── Parse highlights ──
  type RawHighlight = NonNullable<import("@sme-scanner/contracts").RawData["ig"]>["highlights"][0];
  const rawHighlights: RawHighlight[] = [];
  const highlightTitles: string[] = [];

  if (highlightsResult.status === "fulfilled" && highlightsResult.value) {
    // Untyped RapidAPI response boundary -- see the resp.json() sites above.
    const raw = highlightsResult.value as any;
    const items = Array.isArray(raw) ? raw : (raw.user_highlights ?? raw.highlights ?? raw.data ?? raw.items ?? []);
    for (const h of items) {
      const node = h.node ?? h;
      const title = node.title ?? node.name ?? "";
      const id = String(node.id ?? node.pk ?? "");
      const coverUrl = node.cover_media?.cropped_image_version?.url ?? node.cover?.url ?? undefined;
      rawHighlights.push({ id, title, cover_url: coverUrl });
      if (title) highlightTitles.push(title);
    }
  }

  // ── Parse stories ──
  type RawStory = NonNullable<NonNullable<import("@sme-scanner/contracts").RawData["ig"]>["stories"]>[0];
  const rawStories: RawStory[] = [];
  let storiesCount = 0;
  if (storiesResult.status === "fulfilled" && storiesResult.value) {
    // Untyped RapidAPI response boundary -- see the resp.json() sites above.
    const raw = storiesResult.value as any;
    const providerItems = Array.isArray(raw) ? raw : (raw.items ?? raw.stories ?? raw.data ?? []);
    const items = Array.isArray(providerItems) ? providerItems : [];
    storiesCount = items.length;
    for (const item of items.slice(0, 20)) {
      const node = item?.node?.media ?? item?.node ?? item?.media ?? item;
      const id = String(node?.id ?? node?.pk ?? "").trim();
      if (!IG_STORY_ID_RE.test(id)) continue;
      const rawTimestamp = node.taken_at ?? node.taken_at_timestamp;
      const timestamp = typeof rawTimestamp === "string" && !rawTimestamp.trim()
        ? Number.NaN
        : typeof rawTimestamp === "number" ? rawTimestamp : Number(rawTimestamp);
      const publishedDate = Number.isFinite(timestamp)
        ? new Date(timestamp * 1000)
        : null;
      const postedAt = publishedDate && Number.isFinite(publishedDate.getTime())
        ? publishedDate.toISOString()
        : "";
      const thumbnailCandidate = node.thumbnail_url
        ?? node.image_versions2?.candidates?.[0]?.url
        ?? node.display_url
        ?? null;
      const thumbnailUrl = typeof thumbnailCandidate === "string"
        ? thumbnailCandidate.slice(0, 2_048)
        : null;
      const isVideo = node.media_type === 2
        || node.is_video === true
        || (Array.isArray(node.video_versions) && node.video_versions.length > 0);
      rawStories.push({
        id,
        media_type: isVideo ? "GraphVideo" : "GraphImage",
        thumbnail_url: thumbnailUrl,
        posted_at: postedAt,
        permalink: instagramStoryPermalink(igHandle, id),
      });
    }
  }

  console.log("[scrapeIG] posts:", parsedPosts.length, "reels:", parsedReels.length, "highlights:", rawHighlights.length, "stories:", storiesCount);

  const payload: IGPayload = {
    available: true,
    username: igHandle,
    bio: bio || undefined,
    followers,
    following,
    posts_count: postsCount,
    profile_pic_url: profilePicUrl || undefined,
    is_verified: isVerified,
    external_url: externalUrl || undefined,
    posts_last_12: parsedPosts.length > 0 ? parsedPosts : undefined,
    reels_count: parsedReels.length,
    reels_last_12: parsedReels.length > 0 ? parsedReels : undefined,
    highlights_count: rawHighlights.length,
    highlight_titles: highlightTitles.length > 0 ? highlightTitles : undefined,
    stories_count: storiesCount,
  };

  const rawIg: NonNullable<import("@sme-scanner/contracts").RawData["ig"]> = {
    profile: {
      username: igHandle,
      full_name: fullName,
      bio,
      followers,
      following,
      posts_count: postsCount,
      profile_pic_url: profilePicUrl,
      is_verified: isVerified,
      external_url: externalUrl,
    },
    posts: rawPosts,
    reels: rawReels,
    highlights: rawHighlights,
    stories: rawStories,
    stories_count: storiesCount,
  };

  return { payload, raw: rawIg };
}

async function runSerpAEO(
  bizName: string,
  industry: string,
  district: string,
  websiteUrl: string | null,
  gbp: GBPPayload,
  market: Market,
): Promise<{ payload: AEOPayload; raw: NonNullable<import("@sme-scanner/contracts").RawData["aeo"]> | null }> {
  // fetchSerpApi owns per-request key selection and failover; this only needs to
  // know whether ANY key is configured before doing the work.
  const serpApiKey = resolveSerpApiKeys()[0];
  if (!serpApiKey) {
    console.error("[runSerpAEO] No SerpAPI key configured");
    return { payload: { available: false, serpapi_runs: [], performance_runs: [] }, raw: null };
  }
  const marketCfg = getMarketConfig(market);

  const entity: MerchantEntity = {
    businessName: bizName,
    aliases: [bizName, gbp.name]
      .filter((v): v is string => Boolean(v?.trim()))
      .flatMap(nameVariants),
    domain: domainFromUrl(websiteUrl),
    websiteUrl,
    placeId: gbp.place_id ?? null,
    gbpName: gbp.name ?? null,
    district: district || null,
    categories: gbp.categories ?? [],
  };
  const searchTerm = resolveSearchTerm(gbp.categories, industry, market);
  const searchTermEn = resolveSearchTermEn(gbp.categories, industry);
  const districtEn = marketCfg.districts.find((d) => d.zh === district)?.en ?? "";
  const plan = buildMerchantQueryPlan({ term: searchTerm, termEn: searchTermEn, district, districtEn }, market);
  const evidenceRuns = await Promise.all(
    plan.map(async (planItem) => {
      const requestedAt = new Date().toISOString();
      try {
        if (planItem.engine === "google") {
          const data = await fetchGoogleSearchWithAiOverview(
            {
              engine: "google",
              q: planItem.query,
              hl: planItem.hl,
              gl: planItem.gl,
              location: planItem.location ?? marketCfg.serpLocation,
              device: planItem.device,
              api_key: serpApiKey,
              num: "10",
            },
            serpApiKey,
            fetchSerpApi,
          );
          return normalizeGoogleSearchRun({ plan: planItem, entity, requestedAt, data });
        }

        if (planItem.engine === "google_ai_mode") {
          const data = await fetchSerpApi(
            {
              engine: "google_ai_mode",
              q: planItem.query,
              hl: planItem.hl,
              gl: planItem.gl,
              location: planItem.location ?? marketCfg.serpLocation,
              device: planItem.device,
              api_key: serpApiKey,
            },
            20000,
          );
          return normalizeGoogleAiModeRun({ plan: planItem, entity, requestedAt, data });
        }

        // Maps ignores gl for searches (it only affects the Place Results API), so `ll`
        // is the geo anchor — without it "餐廳 中西區" geocodes to Tainan's 中西區.
        const data = await fetchSerpApi({
          engine: "google_maps",
          q: planItem.query,
          hl: planItem.hl,
          gl: planItem.gl,
          ll: planItem.ll ?? marketCfg.mapsLl,
          api_key: serpApiKey,
        });
        return normalizeGoogleMapsRun({ plan: planItem, entity, requestedAt, data });
      } catch (e) {
        const data = {
          search_metadata: { status: "Error", id: null, total_time_taken: null },
          error: e instanceof Error ? e.message : "Unknown SerpAPI error",
        };
        if (planItem.engine === "google_maps") {
          return normalizeGoogleMapsRun({ plan: planItem, entity, requestedAt, data });
        }
        if (planItem.engine === "google_ai_mode") {
          return normalizeGoogleAiModeRun({ plan: planItem, entity, requestedAt, data });
        }
        return normalizeGoogleSearchRun({ plan: planItem, entity, requestedAt, data });
      }
    }),
  );

  // Bounded retry: if the AI-mode run is ambiguous (a fuzzy match or no match at all) and no other
  // run in this scan already confirms a citation, try once more with the brand-phrased query —
  // brand phrasing is far more likely to produce a confident match than the generic "need" query.
  // Caps the added cost at <=1 extra SerpAPI call per scan, only on genuine ambiguity. The decision
  // itself lives in shouldRetryAiMode (lib/merchant-performance/retry-decision.ts) so it's
  // unit-testable without mocking SerpAPI.
  const brandQueryText = plan.find((p) => p.query_type === "brand")?.query ?? `${bizName} ${district}`;
  const needsRetry = shouldRetryAiMode(evidenceRuns);

  let finalRuns = evidenceRuns;
  if (needsRetry) {
    const retryPlanItem = {
      id: "ai-mode-retry-brand",
      query: brandQueryText,
      query_type: "brand" as const,
      engine: "google_ai_mode" as const,
      hl: "zh-TW" as const,
      gl: marketCfg.gl as "hk" | "tw",
      location: marketCfg.serpLocation,
      ll: null,
      device: "desktop" as const,
    };
    const requestedAt = new Date().toISOString();
    try {
      const data = await fetchSerpApi(
        {
          engine: "google_ai_mode",
          q: retryPlanItem.query,
          hl: retryPlanItem.hl,
          gl: retryPlanItem.gl,
          location: retryPlanItem.location,
          device: "desktop",
          api_key: serpApiKey,
        },
        20000,
      );
      const retryRun = normalizeGoogleAiModeRun({ plan: retryPlanItem, entity, requestedAt, data });
      // Fail open: keep both runs regardless of whether the retry improved confidence, so the
      // evidence panel still shows what was tried. Scoring only benefits when it actually helps.
      finalRuns = [...evidenceRuns, retryRun];
    } catch (e) {
      // Mirror the main run loop: normalize the failure into an error-run so the evidence panel
      // shows the retry was attempted. toAeoPerformanceRun marks it unavailable, so scoring skips it.
      const data = {
        search_metadata: { status: "Error", id: null, total_time_taken: null },
        error: e instanceof Error ? e.message : "Unknown SerpAPI error",
      };
      finalRuns = [...evidenceRuns, normalizeGoogleAiModeRun({ plan: retryPlanItem, entity, requestedAt, data })];
    }
  }

  const merchantPerformance: MerchantPerformanceEvidence = {
    version: "2026-06-18",
    generated_at: new Date().toISOString(),
    entity: {
      business_name: bizName,
      aliases: entity.aliases,
      domain: entity.domain,
      website_url: websiteUrl,
      place_id: entity.placeId,
      gbp_name: entity.gbpName,
      district: entity.district,
      vertical: searchTerm,
    },
    runs: finalRuns,
  };

  const serpRuns: NonNullable<import("@sme-scanner/contracts").RawData["aeo"]>["serpapi_runs"] = finalRuns
    .filter((run) => run.engine === "google" || run.engine === "google_ai_mode")
    .map((run) => {
      const perf = toAeoPerformanceRun(run);
      return {
        query: run.query,
        // The .filter() above already guarantees this, but its predicate isn't
        // inferred as a type guard, so narrow the literal type explicitly.
        engine: run.engine as "google" | "google_ai_mode",
        ai_overview: run.raw_refs.ai_overview_text
          ? {
              text: run.raw_refs.ai_overview_text,
              brand_mentioned: run.merchant_presence.ai_mentioned,
              sources: run.merchant_presence.ai_citation_urls,
            }
          : null,
        ai_mode: run.raw_refs.ai_mode_markdown
          ? {
              text: run.raw_refs.ai_mode_markdown,
              brand_mentioned: run.merchant_presence.ai_mentioned,
            }
          : null,
        organic_results: (run.raw_refs.organic_results ?? []).map((result) => ({
          title: result.title,
          url: result.link,
          snippet: result.snippet,
          position: result.position,
        })),
        brand_organic_rank: run.merchant_presence.organic_rank,
        competitors_mentioned: run.competitors.map((competitor) => competitor.name),
        available: perf.available && !perf.unsupported,
      };
    });

  const payloadRuns: AEOPayload["serpapi_runs"] = finalRuns
    .filter((run) => run.engine === "google" || run.engine === "google_ai_mode")
    .map((run) => ({
      query: run.query,
      ai_overview_mentioned: run.raw_refs.ai_overview_text ? run.merchant_presence.ai_mentioned : false,
      ai_mode_mentioned: run.engine === "google_ai_mode" ? run.merchant_presence.ai_mentioned : false,
      brand_organic_rank: run.merchant_presence.organic_rank,
      competitors_mentioned: run.competitors.map((competitor) => competitor.name),
    }));

  // Website analysis
  let website: AEOPayload["website"] = { available: false };
  let rawWebsite: NonNullable<import("@sme-scanner/contracts").RawData["aeo"]>["website"] = null;
  if (websiteUrl) {
    try {
      const resp = await fetch(websiteUrl, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const html = await resp.text();
      const hasFaqSchema = html.includes('"FAQPage"') || html.includes("FAQPage");
      const metaDescLen = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)?.[1] || "").length;
      const h1Count = (html.match(/<h1[\/\s>]/gi) || []).length;
      website = { available: true, has_faq_schema: hasFaqSchema, meta_description_len: metaDescLen, h1_count: h1Count };
      rawWebsite = { url: websiteUrl, has_faq_schema: hasFaqSchema, meta_description_len: metaDescLen, h1_count: h1Count };
    } catch { /* website unreachable */ }
  }

  return {
    payload: {
      available: true,
      serpapi_runs: payloadRuns,
      performance_runs: finalRuns.map(toAeoPerformanceRun),
      website,
    },
    raw: {
      serpapi_runs: serpRuns,
      website: rawWebsite,
      merchant_performance: merchantPerformance,
    },
  };
}

function serpApiError(error: string) {
  return { search_metadata: { status: "Error", id: null, total_time_taken: null }, error };
}

/**
 * This function OWNS key selection: any `api_key` in `params` is overridden per
 * attempt so the quota failover can swap keys. Callers need not set it.
 */
async function fetchSerpApi(params: Record<string, string>, timeoutMs = 15000): Promise<any> {
  // Identify the call in logs WITHOUT leaking the api_key.
  const label = `${params.engine ?? "google"} q="${params.q ?? params.page_token ?? ""}"`;
  const keys = resolveSerpApiKeys();
  if (keys.length === 0) return serpApiError("SerpAPI key not configured");

  async function attemptWithKey(apiKey: string): Promise<{ body: any; quotaExhausted: boolean }> {
    const searchParams = new URLSearchParams({ ...params, api_key: apiKey });
    const url = `https://serpapi.com/search.json?${searchParams.toString()}`;
    const maxAttempts = 3;
    let lastError = "Unknown SerpAPI error";

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
        // SerpAPI returns a JSON body with an `error` field even on 4xx/5xx — read it for the real
        // reason (e.g. "You've run out of searches") instead of a generic "HTTP 429". Untyped
        // response boundary -- see the resp.json() sites above.
        const body = (await resp.json().catch(() => null)) as any;

        if (resp.ok && body && !body.error) {
          return { body, quotaExhausted: false };
        }

        const apiError = body && typeof body.error === "string" ? body.error : `HTTP ${resp.status}`;
        lastError = apiError;

        // Quota, auth (401/403) and bad-request (400) errors will not recover on retry with the
        // SAME key — fail fast rather than burning more searches. Quota is reported upwards so a
        // different key can be tried; auth and bad-request would fail identically on any key.
        const isQuota = isSerpApiQuotaExhausted(resp.status, body);
        const isAuth = resp.status === 401 || resp.status === 403 || /invalid api[_ ]?key|api key/i.test(apiError);
        if (isQuota || isAuth || resp.status === 400) {
          const kind = isQuota ? "QUOTA" : isAuth ? "AUTH" : "BAD_REQUEST";
          console.error(`[serpapi] ${label} — ${resp.status} ${kind}: ${apiError}`);
          return { body: serpApiError(apiError), quotaExhausted: isQuota };
        }

        // Transient (5xx / unexpected) — log and retry with backoff.
        console.error(`[serpapi] ${label} — attempt ${attempt}/${maxAttempts} failed (HTTP ${resp.status}): ${apiError}`);
      } catch (e) {
        lastError = e instanceof Error ? e.message : "SerpAPI fetch exception";
        console.error(`[serpapi] ${label} — attempt ${attempt}/${maxAttempts} exception: ${lastError}`);
      }
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, attempt * 1500));
    }

    // Exhausted the transient retries; not a quota problem, so do not spend the fallback key.
    return { body: serpApiError(lastError), quotaExhausted: false };
  }

  const body = await withSerpApiKeyFallback(keys, async (apiKey) => {
    const outcome = await attemptWithKey(apiKey);
    if (outcome.quotaExhausted && keys.length > 1) {
      console.error(`[serpapi] ${label} — key exhausted, trying fallback key`);
    }
    return { result: outcome.body, quotaExhausted: outcome.quotaExhausted };
  });

  return body ?? serpApiError("SerpAPI key not configured");
}
