import type { Metadata } from "next";

import { requireMembership, type Membership } from "@/lib/auth";
import { normaliseLocale, type PrototypeLocale } from "@/lib/copy";
import { loadWorkspaceContext, type WorkspaceContext } from "@/lib/workspace/queries";
import { defaultLocationSlug, resolveLocationSlug } from "@/lib/workspace/shell";

/**
 * Shared prologue for every `/[locale]/owner/[workspaceSlug]/**` page:
 * membership check (fails closed via redirect), workspace context, and the
 * `?location=` scope resolved against the real location list (default =
 * primary; `all` allowed). Pages stay thin and identical in shape.
 */
export interface OwnerPageContext {
  locale: PrototypeLocale;
  isChinese: boolean;
  workspaceSlug: string;
  membership: Membership;
  ctx: WorkspaceContext;
  locationSlug: string;
  locations: Array<{ slug: string; name: string }>;
  query: Record<string, string | undefined>;
}

export interface OwnerPageProps {
  params: Promise<{ locale: string; workspaceSlug: string; actionId?: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function loadOwnerPage(props: OwnerPageProps, opts: { minRole?: Membership["role"] } = {}): Promise<OwnerPageContext> {
  const { locale: rawLocale, workspaceSlug } = await props.params;
  const locale = normaliseLocale(rawLocale);
  const membership = await requireMembership(workspaceSlug, locale, opts.minRole ? { minRole: opts.minRole } : undefined);
  const ctx = await loadWorkspaceContext(membership);
  const raw = props.searchParams ? await props.searchParams : {};
  const query = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, first(v)]));
  const locationSlug = resolveLocationSlug(query.location, ctx.locations, defaultLocationSlug(ctx.locations));
  return {
    locale,
    isChinese: locale !== "en",
    workspaceSlug,
    membership,
    ctx,
    locationSlug,
    locations: ctx.locations.map((l) => ({ slug: l.slug, name: l.name })),
    query,
  };
}

export async function ownerPageMetadata(props: OwnerPageProps, title: { en: string; zh: string }): Promise<Metadata> {
  const locale = normaliseLocale((await props.params).locale);
  return { title: locale === "en" ? title.en : title.zh, robots: { index: false, follow: false } };
}

/** Whether a manager's location scope covers the given location (owner/viewer always in scope for reading). */
export function inScopeFor(membership: Membership, locationId: string | null): boolean {
  if (membership.role !== "manager" || !membership.locationScope) return true;
  return locationId === null ? false : membership.locationScope.includes(locationId);
}
