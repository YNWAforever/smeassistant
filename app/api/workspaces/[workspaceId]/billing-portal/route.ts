import { NextResponse } from "next/server";
import { getStripeClient, stripeConfigured } from "@/lib/stripe";
import { loadWorkspaceBillingContext } from "@/lib/owner/billing-authorization";

const WORKSPACE_ID_RE = /^[0-9a-f-]{36}$/i;
const LOCALES = new Set(["en", "zh-HK", "zh-TW"]);

/**
 * Stripe's hosted Billing Portal -- this is what makes cancellation and
 * plan/payment-method management genuinely self-serve without this repo
 * building any custom subscription-management UI of its own. Same
 * authorization as the checkout-link route; no price resolution needed
 * here, since the portal reads the customer's existing subscription.
 *
 * Ported from upstream's /api/owner/workspaces/[workspaceId]/billing-portal.
 * Authorization is owner-only via loadWorkspaceBillingContext (§3.9); the
 * return URL lands on the workspace's own billing page.
 */
export async function POST(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  if (!WORKSPACE_ID_RE.test(workspaceId)) {
    return NextResponse.json({ error: "workspaceId is invalid" }, { status: 400 });
  }

  let body: { locale?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const locale = typeof body.locale === "string" && LOCALES.has(body.locale) ? body.locale : null;
  if (!locale) {
    return NextResponse.json({ error: "locale is invalid" }, { status: 400 });
  }

  const { access, workspace } = await loadWorkspaceBillingContext(workspaceId);
  if (!access.ok) return NextResponse.json({ error: access.code }, { status: access.status });
  if (!workspace) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 500 });
  }
  const appOrigin = process.env.APP_ORIGIN?.trim();
  if (!appOrigin) {
    return NextResponse.json({ error: "APP_ORIGIN is not configured" }, { status: 500 });
  }

  if (!workspace.stripe_customer_id) {
    return NextResponse.json({ error: "no_subscription" }, { status: 409 });
  }

  try {
    const stripe = getStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: workspace.stripe_customer_id,
      return_url: `${appOrigin}/${locale}/owner/${workspace.slug ?? access.membership.workspaceSlug}/settings/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Owner billing-portal session creation failed", error);
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}
