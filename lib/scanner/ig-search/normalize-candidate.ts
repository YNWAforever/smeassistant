import { buildInstagramCandidate, instagramHandleFromUrl } from "./handle";
import type { InstagramCandidate } from "./types";

const MAX_SNIPPET = 200;

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * SerpApi organic titles for Instagram profiles are shaped
 * `<display name> (@<handle>) • Instagram photos and videos`. Everything from
 * the bullet onwards is Instagram's own boilerplate, and the parenthesised
 * handle is already carried structurally.
 */
function displayNameFromTitle(value: unknown): string | undefined {
  const title = text(value);
  if (!title) return undefined;
  const beforeBullet = title.split("•")[0] ?? title;
  return text(beforeBullet.replace(/\(@[^)]*\)\s*$/u, ""));
}

export function normalizeInstagramOrganicResult(raw: unknown): InstagramCandidate | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as { link?: unknown; title?: unknown; snippet?: unknown };
  if (typeof row.link !== "string") return null;
  const handle = instagramHandleFromUrl(row.link);
  if (!handle) return null;

  const displayName = displayNameFromTitle(row.title);
  const bioSnippet = text(row.snippet)?.slice(0, MAX_SNIPPET);
  return buildInstagramCandidate(handle, "picker_confirmed", {
    ...(displayName ? { displayName } : {}),
    ...(bioSnippet ? { bioSnippet } : {}),
  });
}
