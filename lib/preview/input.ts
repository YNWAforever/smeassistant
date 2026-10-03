import type { PrototypeLocale } from "@/lib/copy";
import { isLocale } from "@/lib/locale";

/**
 * The preview request body (spec §2.5 step 2). `review` is 10–1,500
 * characters after trimming, counted in Unicode code points so an emoji
 * counts once; `rating` is absent or an integer 1–5 (an explicit null is
 * refused); `locale` is a supported UI locale. Unknown keys are ignored. The
 * refusal carries no detail, so nothing about the input is echoed back.
 */
export type PreviewRating = 1 | 2 | 3 | 4 | 5;

export type PreviewInput =
  | { ok: true; review: string; rating: PreviewRating | null; locale: PrototypeLocale }
  | { ok: false };

const MIN_REVIEW = 10;
const MAX_REVIEW = 1500;

function isRating(value: unknown): value is PreviewRating {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

export function parsePreviewInput(body: unknown): PreviewInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false };
  const { review, rating, locale } = body as Record<string, unknown>;
  if (typeof review !== "string" || !isLocale(locale)) return { ok: false };
  const text = review.trim();
  const length = [...text].length;
  if (length < MIN_REVIEW || length > MAX_REVIEW) return { ok: false };
  if (rating !== undefined && !isRating(rating)) return { ok: false };
  return { ok: true, review: text, rating: rating ?? null, locale };
}
