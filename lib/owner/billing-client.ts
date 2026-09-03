type BillingLinkResult = { ok: true; url: string } | { ok: false; error: string };

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    // Response body wasn't JSON -- fall through to the generic message.
  }
  return `Request failed (${res.status})`;
}

/**
 * Thin fetch wrappers so the billing page's action buttons can be tested
 * without a DOM. Matches upstream's lib/staff/billing-client.ts discriminated
 * result shape deliberately -- an earlier version of that module collapsed
 * failures into ambiguous values, which turned a real 500 into apparent
 * silence in the browser.
 *
 * Ported from upstream's lib/owner/billing-client.ts; only the route paths
 * changed (this app mounts the owner routes at /api/workspaces/[id]/…).
 */
export async function createOwnerCheckoutLink(workspaceId: string, locale: string): Promise<BillingLinkResult> {
  let res: Response;
  try {
    res = await fetch(`/api/workspaces/${workspaceId}/checkout-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale }),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network request failed" };
  }
  if (!res.ok) return { ok: false, error: await errorMessage(res) };
  const body = (await res.json()) as { url: string };
  return { ok: true, url: body.url };
}

export async function createOwnerBillingPortalLink(workspaceId: string, locale: string): Promise<BillingLinkResult> {
  let res: Response;
  try {
    res = await fetch(`/api/workspaces/${workspaceId}/billing-portal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale }),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network request failed" };
  }
  if (!res.ok) return { ok: false, error: await errorMessage(res) };
  const body = (await res.json()) as { url: string };
  return { ok: true, url: body.url };
}

/**
 * The paid/unpaid dispatch the billing page's click handler needs, pulled out
 * here so it's testable without a DOM (this repo has no
 * @testing-library/react, and renderToStaticMarkup never fires onClick) --
 * a rendering-only test of the button labels would never catch this
 * branch being inverted, which would send a paying owner to Checkout again
 * or an unpaid visitor to a Billing Portal session that just 409s.
 */
export function createOwnerBillingLink(paid: boolean, workspaceId: string, locale: string): Promise<BillingLinkResult> {
  return paid ? createOwnerBillingPortalLink(workspaceId, locale) : createOwnerCheckoutLink(workspaceId, locale);
}
