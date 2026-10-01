import { inLocationScope } from "@/lib/auth";
import { localDate } from "@/lib/offers/dates";
import { createOffer, offerReadScope } from "@/lib/offers/service";
import { toOfferView } from "@/lib/offers/view";
import { offerRepository } from "@/lib/repositories/offers";
import { json, offerRouteContext, readBody, requestLocale, serviceDeps, unavailable, UUID_RE } from "./_shared/context";

/**
 * GET  /api/workspaces/[workspaceId]/offers?location= → { offers: OfferView[] }   any member
 * POST /api/workspaces/[workspaceId]/offers { title, details, … } → 201 { offer }   owner / in-scope manager
 * Both 404 unless OFFERS_ENABLED is exactly "true" (spec §6).
 */
type Params = { params: Promise<{ workspaceId: string }> };

export async function GET(req: Request, { params }: Params) {
  const { workspaceId } = await params;
  const guard = await offerRouteContext(req, { workspaceId }, { mutation: false });
  if (!guard.ok) return guard.response;
  const { membership, workspace } = guard.ctx;
  const location = new URL(req.url).searchParams.get("location");
  if (location !== null && location !== "" && (!UUID_RE.test(location) || !inLocationScope(membership, location))) {
    return json({ error: "forbidden" }, 403);
  }
  try {
    const repo = offerRepository();
    const [rows, counts] = await Promise.all([repo.list(workspace.id, { locationIds: offerReadScope(membership) }), repo.draftCounts(workspace.id)]);
    const today = localDate(workspace.timezone, new Date());
    const locale = requestLocale(req, null);
    const offers = rows
      .filter((row) => !location || row.location_id === null || row.location_id === location)
      .map((row) => toOfferView(row, { today, locale, draftCount: counts.get(row.id) ?? 0 }));
    return json({ offers });
  } catch {
    return unavailable("offer_list_failed");
  }
}

export async function POST(req: Request, { params }: Params) {
  const { workspaceId } = await params;
  const guard = await offerRouteContext(req, { workspaceId }, { mutation: true });
  if (!guard.ok) return guard.response;
  const body = await readBody(req);
  if (!body) return json({ error: "Invalid JSON" }, 400);
  const locale = requestLocale(req, body);
  try {
    const deps = serviceDeps(req, guard.ctx, locale);
    const result = await createOffer(deps, body);
    if (!result.ok) return json({ error: result.error }, result.status);
    return json({ offer: toOfferView(result.offer, { today: localDate(guard.ctx.workspace.timezone, deps.now), locale }) }, 201);
  } catch {
    return unavailable("offer_create_failed");
  }
}
