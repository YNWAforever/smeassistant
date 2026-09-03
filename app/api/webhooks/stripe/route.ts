import { NextResponse } from "next/server";
import { getStripeClient, stripeConfigured } from "@/lib/stripe";
import { supabaseServer } from "@/lib/supabase/admin";
import {
  workspaceTierForStripeSubscriptionStatus,
  type WorkspaceTier,
} from "@/lib/workspace/entitlement";

/**
 * Not staff-authenticated -- verified via Stripe's signature header instead,
 * the same shared-secret trust model the scheduler's bearer-secret cron
 * dispatcher already uses: a secret proves the caller, not a staff session.
 *
 * Checkout and subscription lifecycle events both re-read the current Stripe
 * Subscription before applying access. Stripe doesn't guarantee webhook
 * delivery order, and a completed Checkout Session can still point at a
 * subscription whose initial payment is incomplete; the current Subscription
 * object is the entitlement source of truth in both cases.
 */

interface StripeWebhookEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

interface StripeSubscriptionSnapshot {
  id: string;
  customer: string | { id?: unknown };
  status: string;
  metadata?: Record<string, unknown>;
}

interface WorkspaceEntitlementRow {
  id: string;
  tier: string | null;
}

const SUBSCRIPTION_LIFECYCLE_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

function workspaceIdFromMetadata(metadata: Record<string, unknown> | undefined): string | null {
  return typeof metadata?.workspace_id === "string" ? metadata.workspace_id : null;
}

function workspaceIdFromEvent(event: StripeWebhookEvent): string | null {
  return workspaceIdFromMetadata(event.data.object.metadata as Record<string, unknown> | undefined);
}

function customerIdFromSubscription(subscription: StripeSubscriptionSnapshot): string | null {
  if (typeof subscription.customer === "string") return subscription.customer;
  return typeof subscription.customer?.id === "string" ? subscription.customer.id : null;
}

function subscriptionObjectId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return null;
}

function subscriptionIdFromLifecycleEvent(event: StripeWebhookEvent): string | null {
  return subscriptionObjectId(event.data.object.id);
}

function subscriptionIdFromCheckoutEvent(event: StripeWebhookEvent): string | null {
  return subscriptionObjectId(event.data.object.subscription);
}

async function findWorkspaceForSubscription(
  supabase: ReturnType<typeof supabaseServer>,
  subscription: StripeSubscriptionSnapshot,
): Promise<WorkspaceEntitlementRow | null> {
  const workspaceId = workspaceIdFromMetadata(subscription.metadata);
  if (workspaceId) {
    const { data, error } = await supabase
      .from("workspaces")
      .select("id, tier")
      .eq("id", workspaceId)
      .maybeSingle<WorkspaceEntitlementRow>();
    if (error) throw new Error(`Failed to look up workspace by metadata: ${error.message}`);
    return data ?? null;
  }

  const customerId = customerIdFromSubscription(subscription);
  if (!customerId) return null;
  const { data, error } = await supabase
    .from("workspaces")
    .select("id, tier")
    .eq("stripe_customer_id", customerId)
    .maybeSingle<WorkspaceEntitlementRow>();
  if (error) throw new Error(`Failed to look up workspace by Stripe customer: ${error.message}`);
  return data ?? null;
}

async function retrieveCurrentSubscription(
  stripe: ReturnType<typeof getStripeClient>,
  subscriptionId: string,
): Promise<StripeSubscriptionSnapshot> {
  return (await stripe.subscriptions.retrieve(subscriptionId)) as unknown as StripeSubscriptionSnapshot;
}

function requiredTierForSubscription(subscription: StripeSubscriptionSnapshot): WorkspaceTier {
  const tier = workspaceTierForStripeSubscriptionStatus(subscription.status);
  if (!tier) throw new Error("Stripe subscription has an unsupported status");
  return tier;
}

export async function POST(req: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 500 });
  }
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET is not configured" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await req.text();
  const stripe = getStripeClient();
  let event: StripeWebhookEvent;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret) as unknown as StripeWebhookEvent;
  } catch (err) {
    console.error("Stripe webhook signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = supabaseServer();

  try {
    if (event.type === "checkout.session.completed") {
      const expectedWorkspaceId = workspaceIdFromEvent(event);
      if (expectedWorkspaceId) {
        const subscriptionId = subscriptionIdFromCheckoutEvent(event);
        if (!subscriptionId) throw new Error("Stripe Checkout Session is missing its subscription id");

        const subscription = await retrieveCurrentSubscription(stripe, subscriptionId);
        const targetTier = requiredTierForSubscription(subscription);
        const workspace = await findWorkspaceForSubscription(supabase, subscription);
        if (!workspace) throw new Error("Stripe Checkout Session references an unknown workspace");
        if (workspace.id !== expectedWorkspaceId) {
          throw new Error("Stripe Checkout and Subscription workspace metadata do not match");
        }
        if (workspace.tier !== targetTier) {
          await applyTier(supabase, workspace.id, targetTier, event.id);
        }
      }
    } else if (SUBSCRIPTION_LIFECYCLE_EVENTS.has(event.type)) {
      const subscriptionId = subscriptionIdFromLifecycleEvent(event);
      if (!subscriptionId) throw new Error("Stripe subscription event is missing its object id");

      // Retrieve current state because events can arrive out of order. The
      // object returned here is authoritative at processing time even when the
      // webhook currently being delivered describes an older transition.
      const subscription = await retrieveCurrentSubscription(stripe, subscriptionId);
      const targetTier = requiredTierForSubscription(subscription);
      const workspace = await findWorkspaceForSubscription(supabase, subscription);
      if (workspace && workspace.tier !== targetTier) {
        await applyTier(supabase, workspace.id, targetTier, event.id);
      }
    }
  } catch (err) {
    // A non-2xx response tells Stripe to retry this delivery. Swallowing the
    // failure here would leave a half-applied entitlement permanently wrong:
    // Stripe never retries a 200, and a later duplicate delivery must be able
    // to re-run the idempotent tier update below.
    console.error("Failed to apply Stripe webhook event", err);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function applyTier(
  supabase: ReturnType<typeof supabaseServer>,
  workspaceId: string,
  tier: WorkspaceTier,
  stripeEventId: string,
): Promise<void> {
  const { error: insertError } = await supabase
    .from("workspace_tier_events")
    .insert({ workspace_id: workspaceId, tier, source: "stripe_webhook", stripe_event_id: stripeEventId })
    .select("id");
  // 23505 = unique_violation on the partial stripe_event_id index -- this
  // event was already recorded by an earlier delivery. That earlier delivery
  // may or may not have gone on to update workspaces.tier successfully (the
  // two writes are not one transaction), so a duplicate insert must NOT skip
  // the tier update below. Reapplying the same tier is harmless and lets a
  // first attempt that failed between the two writes self-heal on retry.
  if (insertError && (insertError as { code?: string }).code !== "23505") {
    throw new Error(`Failed to record workspace_tier_events row: ${insertError.message}`);
  }

  const { error: updateError } = await supabase.from("workspaces").update({ tier }).eq("id", workspaceId);
  if (updateError) {
    throw new Error(`Failed to update workspace tier: ${updateError.message}`);
  }
}
