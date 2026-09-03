// packages/scoring/src/benchmarks.ts

type Industry = "餐飲" | "美容" | "診所" | "本地服務" | "零售" | "其他";

type BenchmarkKey =
  | "ig.followers"
  | "ig.bio_length"
  | "ig.post_gap_days"
  | "ig.post_recency_days"
  | "ig.engagement_rate"
  | "ig.highlights"
  | "ig.cta_present"
  | "gbp.reviews"
  | "gbp.rating"
  | "gbp.review_freshness_days"
  | "gbp.owner_response_rate"
  | "gbp.photos"
  | "gbp.hours_complete"
  | "trust.review_count"
  | "trust.review_count_min"
  | "trust.review_count_avg"
  | "trust.rating_min"
  | "trust.rating_avg"
  | "trust.ig_followers_min"
  | "trust.ig_followers_avg";

type BenchmarkRow = Record<BenchmarkKey, number | boolean>;

const BENCHMARKS: Record<Industry, BenchmarkRow> = {
  "餐飲": {
    "ig.followers": 500,
    "ig.bio_length": 45,
    "ig.post_gap_days": 7,
    "ig.post_recency_days": 14,
    "ig.engagement_rate": 2,
    "ig.highlights": 3,
    "ig.cta_present": true,
    "gbp.reviews": 50,
    "gbp.rating": 4.0,
    "gbp.review_freshness_days": 30,
    "gbp.owner_response_rate": 60,
    "gbp.photos": 10,
    "gbp.hours_complete": true,
    "trust.review_count": 20,
    "trust.review_count_min": 20,
    "trust.review_count_avg": 50,
    "trust.rating_min": 3.8,
    "trust.rating_avg": 4.0,
    "trust.ig_followers_min": 200,
    "trust.ig_followers_avg": 500,
  },
  "美容": {
    "ig.followers": 800,
    "ig.bio_length": 50,
    "ig.post_gap_days": 5,
    "ig.post_recency_days": 14,
    "ig.engagement_rate": 3,
    "ig.highlights": 5,
    "ig.cta_present": true,
    "gbp.reviews": 30,
    "gbp.rating": 4.2,
    "gbp.review_freshness_days": 30,
    "gbp.owner_response_rate": 70,
    "gbp.photos": 15,
    "gbp.hours_complete": true,
    "trust.review_count": 15,
    "trust.review_count_min": 15,
    "trust.review_count_avg": 30,
    "trust.rating_min": 4.0,
    "trust.rating_avg": 4.2,
    "trust.ig_followers_min": 300,
    "trust.ig_followers_avg": 800,
  },
  "診所": {
    "ig.followers": 300,
    "ig.bio_length": 40,
    "ig.post_gap_days": 10,
    "ig.post_recency_days": 14,
    "ig.engagement_rate": 1.5,
    "ig.highlights": 2,
    "ig.cta_present": true,
    "gbp.reviews": 20,
    "gbp.rating": 4.0,
    "gbp.review_freshness_days": 60,
    "gbp.owner_response_rate": 50,
    "gbp.photos": 8,
    "gbp.hours_complete": true,
    "trust.review_count": 10,
    "trust.review_count_min": 10,
    "trust.review_count_avg": 20,
    "trust.rating_min": 3.8,
    "trust.rating_avg": 4.0,
    "trust.ig_followers_min": 100,
    "trust.ig_followers_avg": 300,
  },
  "本地服務": {
    "ig.followers": 400,
    "ig.bio_length": 40,
    "ig.post_gap_days": 7,
    "ig.post_recency_days": 14,
    "ig.engagement_rate": 2,
    "ig.highlights": 3,
    "ig.cta_present": true,
    "gbp.reviews": 40,
    "gbp.rating": 4.0,
    "gbp.review_freshness_days": 30,
    "gbp.owner_response_rate": 50,
    "gbp.photos": 10,
    "gbp.hours_complete": true,
    "trust.review_count": 10,
    "trust.review_count_min": 10,
    "trust.review_count_avg": 40,
    "trust.rating_min": 4.0,
    "trust.rating_avg": 4.0,
    "trust.ig_followers_min": 150,
    "trust.ig_followers_avg": 400,
  },
  "零售": {
    "ig.followers": 600,
    "ig.bio_length": 45,
    "ig.post_gap_days": 7,
    "ig.post_recency_days": 14,
    "ig.engagement_rate": 2,
    "ig.highlights": 3,
    "ig.cta_present": true,
    "gbp.reviews": 60,
    "gbp.rating": 4.0,
    "gbp.review_freshness_days": 30,
    "gbp.owner_response_rate": 60,
    "gbp.photos": 12,
    "gbp.hours_complete": true,
    "trust.review_count": 20,
    "trust.review_count_min": 20,
    "trust.review_count_avg": 60,
    "trust.rating_min": 3.8,
    "trust.rating_avg": 4.0,
    "trust.ig_followers_min": 250,
    "trust.ig_followers_avg": 600,
  },
  "其他": {
    "ig.followers": 300,
    "ig.bio_length": 35,
    "ig.post_gap_days": 10,
    "ig.post_recency_days": 14,
    "ig.engagement_rate": 1.5,
    "ig.highlights": 2,
    "ig.cta_present": true,
    "gbp.reviews": 25,
    "gbp.rating": 3.8,
    "gbp.review_freshness_days": 60,
    "gbp.owner_response_rate": 40,
    "gbp.photos": 8,
    "gbp.hours_complete": true,
    "trust.review_count": 10,
    "trust.review_count_min": 10,
    "trust.review_count_avg": 25,
    "trust.rating_min": 3.5,
    "trust.rating_avg": 3.8,
    "trust.ig_followers_min": 100,
    "trust.ig_followers_avg": 300,
  },
};

export function getBenchmark(industry: string | null | undefined, key: BenchmarkKey): number | boolean {
  const row = BENCHMARKS[industry as Industry] ?? BENCHMARKS["其他"];
  return row[key];
}
