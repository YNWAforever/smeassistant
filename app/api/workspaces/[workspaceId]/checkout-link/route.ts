import { NextResponse } from "next/server";
import { getStripeClient, getWorkspacePriceId, stripeConfigured } from "@/lib/stripe";
import { supabaseServer } from "@/lib/supabase/admin";
import { loadWorkspaceBillingContext } from "@/lib/owner/billing-authorization";
import { isWorkspacePaid } from "@/lib/workspace/entitlement";

const WORKSPACE_ID_RE = /^[0-9a-f-]{36}$/i;
const LOCALES = new Set(["en", "zh-HK", "zh-TW"]);

/**
 * The self-serve twin of app/api/staff/workspaces/[workspaceId]/checkout-link/route.ts.
 * Same Checkout Session shape (customer reuse, matching metadata keys) --
 * differs only in authorization (workspace ownership via
 * loadWorkspaceBillingContext, not requireStaff()) and price resolution (the
 * workspace's own market, via getWorkspacePriceId, not a single global env
 * var). success_url/cancel_url need a locale because this is a customer-
 * facing surface the staff route's English-only console never had to be.
 *
 * Ported from upstream's /api/owner/workspaces/[workspaceId]/checkout-link.
 * Authorization is owner-only via loadWorkspaceBillingContext (§3.9); the
 * success/cancel URLs land on the workspace's own billing page.
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
  const billingPath = `/${locale}/owner/${workspace.slug ?? access.membership.workspaceSlug}/settings/billing`;

  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 500 });
  }
  const appOrigin = process.env.APP_ORIGIN?.trim();
  if (!appOrigin) {
    return NextResponse.json({ error: "APP_ORIGIN is not configured" }, { status: 500 });
  }

  if (isWorkspacePaid(workspace.tier)) {
    return NextResponse.json({ error: "already_paid" }, { status: 409 });
  }

  const market = workspace.market === "hk" || workspace.market === "tw" ? workspace.market : null;
  if (!market) {
    console.error("[owner/checkout-link] workspace has no valid market", { category: "checkout_link_market_missing" });
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
  const priceId = getWorkspacePriceId(market);
  if (!priceId) {
    return NextResponse.json({ error: `Stripe price for ${market} is not configured` }, { status: 500 });
  }

  try {
    const supabase = supabaseServer();
    const stripe = getStripeClient();
    let customerId = workspace.stripe_customer_id;
    if (!customerId) {
      // Permanent key: this workspace should only ever have one Stripe customer,
      // so keying purely on workspaceId (no time component) closes the
      // double-submit race completely regardless of timing -- Stripe returns
      // the same customer object for every call with this key, indefinitely.
      const customer = await stripe.customers.create(
        { metadata: { workspace_id: workspaceId } },
        { idempotencyKey: `workspace-customer-${workspaceId}` },
      );
      customerId = customer.id;
      const { error: updateError } = await supabase
        .from("workspaces")
        .update({ stripe_customer_id: customerId })
        .eq("id", workspaceId);
      if (updateError) {
        console.error("Failed to persist stripe_customer_id", updateError);
        return NextResponse.json({ error: "Failed to save Stripe customer" }, { status: 500 });
      }
    }

    // Time-bucketed key (30s): unlike the customer key above, this one must NOT
    // be permanent -- an owner who cancels and comes back later to actually
    // subscribe needs a fresh session, not a stale/expired one from their first
    // attempt. Bucketing collapses an accidental double-click or two tabs
    // loaded near-simultaneously into one session without blocking any
    // realistic legitimate retry.
    const checkoutIdempotencyKey = `checkout-${workspaceId}-${Math.floor(Date.now() / 30000)}`;
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${appOrigin}${billingPath}?checkout=success`,
        cancel_url: `${appOrigin}${billingPath}?checkout=cancelled`,
        metadata: { workspace_id: workspaceId },
        subscription_data: { metadata: { workspace_id: workspaceId } },
      },
      { idempotencyKey: checkoutIdempotencyKey },
    );

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Owner checkout-link creation failed", error);
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}
