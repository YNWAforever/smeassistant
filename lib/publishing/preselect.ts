import type { GbpReviewTarget } from "@/lib/oauth/google-reviews";

const PREFIX_CODE_POINTS = 40;

/** NFC, collapsed and trimmed whitespace, lower case, then the first 40 code points. */
function prefix(text: string): string {
  const normalized = text.normalize("NFC").replace(/\s+/gu, " ").trim().toLowerCase();
  return Array.from(normalized).slice(0, PREFIX_CODE_POINTS).join("");
}

/**
 * Pick the review the reply most likely answers (spec §3.1): the first target
 * (the list is newest first) whose excerpt starts like one of the candidate
 * review texts the draft was written from. Otherwise the newest target, or
 * null when there is none. This is only a default; the owner confirms the
 * target before anything is published.
 */
export function preselectTarget(targets: GbpReviewTarget[], candidateTexts: string[]): string | null {
  const candidates = new Set(candidateTexts.map(prefix).filter((value) => value !== ""));
  if (candidates.size > 0) {
    const match = targets.find((target) => {
      const excerpt = prefix(target.excerpt);
      return excerpt !== "" && candidates.has(excerpt);
    });
    if (match) return match.reviewName;
  }
  return targets[0]?.reviewName ?? null;
}
