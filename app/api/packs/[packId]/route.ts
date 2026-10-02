import { json, UUID_RE } from "@/app/api/actions/_shared/mutation";
import { overviewFor, packsDisabledResponse } from "@/app/api/packs/_shared";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { packRepository } from "@/lib/repositories/packs";

/**
 * GET /api/packs/[packId] -> 200 { pack: PackOverview }
 * Any member with the pack's location in scope. The pack's workspace and
 * location are read from the stored row before anything is authorized, never
 * from caller-supplied ids (guardrail 9).
 */
type Ctx = { params: Promise<{ packId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const disabled = packsDisabledResponse();
  if (disabled) return disabled;
  const { packId } = await params;
  if (!UUID_RE.test(packId)) return json({ error: "packId is invalid" }, 400);
  try {
    const repository = packRepository();
    const scope = await repository.packScope(packId);
    if (!scope) return json({ error: "not_found" }, 404);
    const auth = await authorizeWorkspaceRequest(
      { id: scope.workspaceId },
      { minRole: "viewer", locationId: scope.locationId ?? undefined },
    );
    if (!auth.ok) return json({ error: auth.code }, auth.status);
    const loaded = await repository.getPack(packId);
    if (!loaded) return json({ error: "unavailable" }, 503);
    return json({ pack: await overviewFor(auth.membership, loaded) });
  } catch {
    return json({ error: "unavailable" }, 503);
  }
}
