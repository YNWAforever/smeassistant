import { createHash } from "node:crypto";
import type { RawData } from "@sme-scanner/contracts";
import { isSensitiveQueryName } from "./sensitive-name";
import type {
  EvidenceCandidate,
  EvidenceProvider,
  EvidenceType,
} from "@sme-scanner/contracts";

const MAX_SOURCE_ID_LENGTH = 200;
const MAX_URL_LENGTH = 2_048;
const MAX_TEXT_LENGTH = 2_000;
const MAX_NAME_LENGTH = 200;
const MAX_METADATA_STRING_LENGTH = 200;
const MAX_DATE_LENGTH = 100;

export interface EvidenceRetentionPolicy {
  instagram: boolean;
  googleMaps: boolean;
}

export function evidenceRetentionPolicy(
  env: Record<string, string | undefined> = process.env,
): EvidenceRetentionPolicy {
  return {
    instagram: env.EVIDENCE_SNAPSHOT_INSTAGRAM_ALLOWED === "true",
    googleMaps: env.EVIDENCE_SNAPSHOT_GOOGLE_MAPS_ALLOWED === "true",
  };
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function boundedNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, value))
    : 0;
}

function isBlockedIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((octet) => octet > 255)) return false;
  const [first, second, third] = octets;
  return first === 0 || first === 10 || first === 127 || first >= 224
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 0 && (third === 0 || third === 2))
    || (first === 192 && second === 88 && third === 99)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19))
    || (first === 198 && second === 51 && third === 100)
    || (first === 203 && second === 0 && third === 113);
}

function isPublicEvidenceHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  return Boolean(host)
    && host !== "localhost"
    && !host.endsWith(".localhost")
    && !host.includes(":")
    && !isBlockedIpv4(host);
}

function publicUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH) return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== "https:" && url.protocol !== "http:")
      || url.username
      || url.password
      || !isPublicEvidenceHost(url.hostname)
      || [...url.searchParams.keys()].some(isSensitiveQueryName)) {
      return null;
    }
    url.hash = "";
    const normalized = url.toString();
    return normalized.length <= MAX_URL_LENGTH ? normalized : null;
  } catch {
    return null;
  }
}

function digest(value: string): string {
  return "sha256:" + createHash("sha256").update(value).digest("hex");
}

function stableSourceId(value: unknown, fallbackParts: Array<string | null>): string | null {
  const raw = boundedString(value, 10_000);
  if (raw) {
    return raw.length <= MAX_SOURCE_ID_LENGTH && /^[A-Za-z0-9._:-]+$/.test(raw)
      ? raw
      : digest("provider-id:" + raw);
  }
  const fallback = fallbackParts.filter((part): part is string => Boolean(part)).join("|");
  return fallback ? digest("evidence-fallback:" + fallback) : null;
}

function retention(provider: EvidenceProvider, policy: EvidenceRetentionPolicy) {
  const allowed = provider === "instagram" ? policy.instagram : policy.googleMaps;
  return allowed ? "snapshot_permitted" as const : "metadata_only" as const;
}

function candidate(
  provider: EvidenceProvider,
  evidenceType: EvidenceType,
  sourceId: string | null,
  sourceUrl: string | null,
  mediaUrl: string | null,
  capturedAt: string,
  publishedAt: string | null,
  text: string | null,
  metadata: EvidenceCandidate["metadata"],
  policy: EvidenceRetentionPolicy,
): EvidenceCandidate[] {
  return sourceId ? [{
    provider,
    evidenceType,
    sourceId,
    sourceUrl,
    mediaUrl,
    capturedAt: boundedString(capturedAt, MAX_DATE_LENGTH) ?? "",
    publishedAt,
    text,
    metadata,
    retention: retention(provider, policy),
  }] : [];
}

const EVIDENCE_LIMITS: Record<string, number> = {
  "instagram:profile": 1,
  "instagram:post": 6,
  "instagram:reel": 6,
  "instagram:story": 6,
  "instagram:highlight": 8,
  "google_maps:photo": 6,
  "google_maps:post": 3,
  "google_maps:review": 5,
};

function boundedCandidateCollector(target: EvidenceCandidate[]) {
  const seen = new Set<string>();
  const counts = new Map<string, number>();

  return (...candidates: EvidenceCandidate[]) => {
    for (const item of candidates) {
      const typeKey = item.provider + ":" + item.evidenceType;
      const limit = EVIDENCE_LIMITS[typeKey];
      if (!limit) continue;
      const identity = JSON.stringify([item.provider, item.evidenceType, item.sourceId]);
      if (seen.has(identity)) continue;
      const count = counts.get(typeKey) ?? 0;
      if (count >= limit) continue;
      seen.add(identity);
      counts.set(typeKey, count + 1);
      target.push(item);
    }
  };
}

export function normalizeEvidence(
  raw: RawData,
  capturedAt: string,
  policy = evidenceRetentionPolicy(),
): EvidenceCandidate[] {
  const result: EvidenceCandidate[] = [];
  const collect = boundedCandidateCollector(result);
  const ig = raw.ig;
  if (ig) {
    const username = boundedString(ig.profile.username, 30);
    const validUsername = username && /^[A-Za-z0-9._]+$/.test(username) ? username : null;
    const profileMedia = publicUrl(ig.profile.profile_pic_url);
    if (validUsername) {
      collect(...candidate(
        "instagram",
        "profile",
        validUsername,
        "https://www.instagram.com/" + encodeURIComponent(validUsername) + "/",
        profileMedia,
        capturedAt,
        null,
        boundedString(ig.profile.bio, MAX_TEXT_LENGTH),
        {
          username: validUsername,
          fullName: boundedString(ig.profile.full_name, MAX_NAME_LENGTH) ?? "",
          followers: boundedNumber(ig.profile.followers),
          following: boundedNumber(ig.profile.following),
          posts: boundedNumber(ig.profile.posts_count),
          verified: ig.profile.is_verified === true,
        },
        policy,
      ));
    }

    for (const post of ig.posts) {
      const sourceUrl = publicUrl(post.permalink);
      const mediaUrl = publicUrl(post.thumbnail_url);
      collect(...candidate(
        "instagram",
        "post",
        stableSourceId(post.id, [sourceUrl, mediaUrl]),
        sourceUrl,
        mediaUrl,
        capturedAt,
        boundedString(post.posted_at, MAX_DATE_LENGTH),
        boundedString(post.caption, MAX_TEXT_LENGTH),
        {
          mediaType: boundedString(post.media_type, MAX_METADATA_STRING_LENGTH) ?? "",
          likes: boundedNumber(post.like_count),
          comments: boundedNumber(post.comment_count),
        },
        policy,
      ));
    }

    for (const reel of ig.reels) {
      const sourceUrl = publicUrl(reel.permalink);
      const mediaUrl = publicUrl(reel.thumbnail_url);
      collect(...candidate(
        "instagram",
        "reel",
        stableSourceId(reel.id, [sourceUrl, mediaUrl]),
        sourceUrl,
        mediaUrl,
        capturedAt,
        boundedString(reel.posted_at, MAX_DATE_LENGTH),
        boundedString(reel.caption, MAX_TEXT_LENGTH),
        {
          plays: boundedNumber(reel.play_count),
          likes: boundedNumber(reel.like_count),
          comments: boundedNumber(reel.comment_count),
        },
        policy,
      ));
    }

    for (const story of (ig.stories ?? [])) {
      const sourceUrl = publicUrl(story.permalink);
      const mediaUrl = publicUrl(story.thumbnail_url);
      collect(...candidate(
        "instagram",
        "story",
        stableSourceId(story.id, [sourceUrl, mediaUrl]),
        sourceUrl,
        mediaUrl,
        capturedAt,
        boundedString(story.posted_at, MAX_DATE_LENGTH),
        null,
        { mediaType: boundedString(story.media_type, MAX_METADATA_STRING_LENGTH) ?? "" },
        policy,
      ));
    }

    for (const highlight of ig.highlights) {
      const mediaUrl = publicUrl(highlight.cover_url);
      collect(...candidate(
        "instagram",
        "highlight",
        stableSourceId(highlight.id, [mediaUrl]),
        null,
        mediaUrl,
        capturedAt,
        null,
        boundedString(highlight.title, MAX_NAME_LENGTH),
        { itemCount: boundedNumber(highlight.items_count) },
        policy,
      ));
    }
  }

  const gbp = raw.gbp;
  if (gbp) {
    const mapsUrl = publicUrl(gbp.maps_url);
    for (const photo of (gbp.photos ?? [])) {
      const sourceUrl = publicUrl(photo.source_url) ?? mapsUrl;
      const mediaUrl = publicUrl(photo.image_url);
      collect(...candidate(
        "google_maps",
        "photo",
        stableSourceId(photo.id, [mediaUrl]),
        sourceUrl,
        mediaUrl,
        capturedAt,
        null,
        null,
        { attribution: boundedString(photo.attribution, MAX_METADATA_STRING_LENGTH) ?? "Google Maps" },
        policy,
      ));
    }

    for (const post of (gbp.posts ?? [])) {
      const itemLink = publicUrl(post.link);
      const mediaUrl = publicUrl(post.image_url);
      collect(...candidate(
        "google_maps",
        "post",
        stableSourceId(post.id, [itemLink, mediaUrl]),
        itemLink ?? mapsUrl,
        mediaUrl,
        capturedAt,
        boundedString(post.published_at, MAX_DATE_LENGTH),
        boundedString(post.text, MAX_TEXT_LENGTH),
        { actionLink: publicUrl(post.action_link) },
        policy,
      ));
    }

    for (const review of gbp.reviews) {
      const itemLink = publicUrl(review.link);
      const mediaUrl = (review.images ?? []).slice(0, 1).map(publicUrl).find(Boolean) ?? null;
      collect(...candidate(
        "google_maps",
        "review",
        stableSourceId(review.id, [itemLink, mediaUrl]),
        itemLink ?? mapsUrl,
        mediaUrl,
        capturedAt,
        boundedString(review.time, MAX_DATE_LENGTH),
        boundedString(review.text, MAX_TEXT_LENGTH),
        {
          rating: boundedNumber(review.rating),
          ownerResponse: boundedString(review.owner_response, MAX_TEXT_LENGTH),
        },
        policy,
      ));
    }
  }

  return result;
}
