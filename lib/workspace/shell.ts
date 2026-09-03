import type { ShellWorkspace } from "@/components/product-ui";
import type { PrototypeLocale } from "@/lib/copy";
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace";
import type { WorkspaceContext } from "@/lib/workspace/queries";

/**
 * Pure helpers that turn a loaded WorkspaceContext into the props the shell
 * renders. No I/O here so the layout stays thin and these stay unit-testable;
 * the client shell imports the string helpers too, so nothing in this file
 * may reach for server-only modules at runtime (the imports above are types).
 */

const ROLE_LABELS: Record<PrototypeLocale, Record<WorkspaceRole, string>> = {
  en: { owner: "Owner", manager: "Manager", viewer: "Viewer" },
  "zh-HK": { owner: "店主", manager: "經理", viewer: "檢視者" },
  "zh-TW": { owner: "店主", manager: "經理", viewer: "檢視者" },
};

export function roleLabel(role: WorkspaceRole, locale: PrototypeLocale): string {
  return ROLE_LABELS[locale][role];
}

/** First user-perceived character of the name (a CJK glyph or a Latin letter), upper-cased; "?" when empty. */
export function avatarInitial(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : "?";
}

/**
 * The initials the account button shows: first letters of the first two words
 * ("Willy Lai" → "WL"), or the first character of a single word ("錦汶館" → "錦").
 */
export function accountInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return avatarInitial(words[0]);
  return words
    .slice(0, 2)
    .map((word) => avatarInitial(word))
    .join("");
}

/** `?location=` may only name "all" or one of the workspace's own location slugs (§3.1). */
export function locationWhitelist(locations: ReadonlyArray<{ slug: string }>): string[] {
  return ["all", ...locations.map((location) => location.slug)];
}

export function resolveLocationSlug(
  param: string | null | undefined,
  locations: ReadonlyArray<{ slug: string }>,
  fallback: string,
): string {
  const value = param ?? "";
  return locationWhitelist(locations).includes(value) ? value : fallback;
}

/** The primary location, else the first, else "all" (a workspace without locations yet). */
export function defaultLocationSlug(locations: ReadonlyArray<{ slug: string; isPrimary?: boolean }>): string {
  return locations.find((location) => location.isPrimary)?.slug ?? locations[0]?.slug ?? "all";
}

/**
 * `scan_snapshots.coverage` is copied from `audit_jobs.score_coverage`, a 0–1
 * fraction; older rows may already hold a percentage. Render both as a whole
 * percent, never recompute (guardrail 2).
 */
export function formatCoverage(coverage: number | null): number | null {
  if (coverage === null || !Number.isFinite(coverage)) return null;
  return Math.round(coverage <= 1 ? coverage * 100 : coverage);
}

/** "n / allowance" for the sidebar usage card; `null` allowance is unlimited (§3.10). */
export function usagePercent(approvedDeliveries: number, allowance: number | null): number | null {
  if (allowance === null || allowance <= 0) return null;
  return Math.min(100, Math.round((approvedDeliveries / allowance) * 100));
}

export function buildShellWorkspace(
  context: WorkspaceContext,
  locale: PrototypeLocale,
  extras: { urgentActions?: number } = {},
): ShellWorkspace {
  const { workspace, locations, usage, unreadNotifications, membership, account } = context;
  return {
    slug: workspace.slug,
    name: workspace.name,
    avatarInitial: avatarInitial(workspace.name),
    locations: locations.map((location) => ({ slug: location.slug, name: location.name })),
    defaultLocationSlug: defaultLocationSlug(locations),
    usage: { approvedDeliveries: usage.approvedDeliveries, allowance: usage.allowance },
    account: { name: account.name, email: account.email, roleLabel: roleLabel(membership.role, locale) },
    unreadNotifications,
    demo: workspace.isDemo,
    ...(extras.urgentActions !== undefined ? { urgentActions: extras.urgentActions } : {}),
  };
}
