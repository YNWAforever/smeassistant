import type { IgMatchProvenance, InstagramCandidate } from "./types";

const HANDLE_SHAPE = /^[a-z0-9._]{1,30}$/;
const HAS_ALPHANUMERIC = /[a-z0-9]/;

/**
 * First-path-segment values instagram.com uses for its own surfaces. Without
 * this set, `instagram.com/p/Cabc123` parses as the merchant "@p" and the scan
 * silently profiles a nonexistent account.
 */
const RESERVED_PATHS = new Set([
  "p", "reel", "reels", "explore", "stories", "tv", "s", "share",
  "accounts", "about", "directory", "legal", "developer", "developers",
  "api", "help", "privacy", "terms", "web", "direct", "challenge",
  "oauth", "graphql", "session", "emails", "ads", "business", "creators",
  "download", "press", "blog",
]);

function validHandle(candidate: string): string | null {
  const handle = candidate.toLocaleLowerCase("en");
  if (!HANDLE_SHAPE.test(handle)) return null;
  if (handle.startsWith(".") || handle.endsWith(".")) return null;
  if (!HAS_ALPHANUMERIC.test(handle)) return null;
  if (RESERVED_PATHS.has(handle)) return null;
  return handle;
}

export function instagramHandleFromUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // Exact-suffix matching, not `includes`: "instagram.com.evil.example" must
  // not resolve as Instagram.
  const host = url.hostname.toLocaleLowerCase("en");
  if (host !== "instagram.com" && !host.endsWith(".instagram.com")) return null;
  const [first] = url.pathname.split("/").filter(Boolean);
  return first ? validHandle(first) : null;
}

export function normalizeInstagramHandle(value: string): string | null {
  const trimmed = value.normalize("NFKC").trim();
  if (!trimmed) return null;
  const fromUrl = instagramHandleFromUrl(trimmed);
  if (fromUrl) return fromUrl;
  return validHandle(trimmed.replace(/^@+/, "").replace(/\/+$/, ""));
}

export function instagramProfileUrl(handle: string): string {
  return `https://www.instagram.com/${handle}/`;
}

export function buildInstagramCandidate(
  handle: string,
  provenance: Exclude<IgMatchProvenance, "manual_typed">,
  extra: { displayName?: string; bioSnippet?: string } = {},
): InstagramCandidate {
  return {
    id: `ig:${handle}`,
    handle,
    profileUrl: instagramProfileUrl(handle),
    provenance,
    ...(extra.displayName ? { displayName: extra.displayName } : {}),
    ...(extra.bioSnippet ? { bioSnippet: extra.bioSnippet } : {}),
  };
}

/**
 * Path A. The confirmed GBP candidate's `websiteUrl` is frequently the
 * merchant's Instagram profile for HK/TW SMEs, and it was already paid for at
 * discovery -- so this costs nothing and is more precise than any search.
 */
export function instagramCandidateFromWebsite(websiteUrl: string | undefined): InstagramCandidate | null {
  if (!websiteUrl) return null;
  const handle = instagramHandleFromUrl(websiteUrl);
  return handle ? buildInstagramCandidate(handle, "gbp_cross_referenced") : null;
}
