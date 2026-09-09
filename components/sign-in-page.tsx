"use client";

import { PublicPageFrame } from "@/components/product-ui";
import type { PrototypeLocale } from "@/lib/copy";
import type { SignInErrorCode } from "@/lib/funnel/sign-in";
import type { AuthFlow } from "@/lib/identity/sign-in-flow";

import { SignInFlow } from "./auth/sign-in-flow";

function reason(error?: SignInErrorCode | "cancelled"): "cancelled" | "expired" | "unavailable" | null {
  if (!error) return null;
  if (error === "cancelled") return "cancelled";
  return error === "missing_code" || error === "invalid_code" ? "expired" : "unavailable";
}

/** Public chrome adapter for the guided client flow. */
export function SignInPage({ flow, plan, error }: { flow: AuthFlow; plan?: string; error?: SignInErrorCode | "cancelled" }) {
  return <PublicPageFrame locale={flow.locale as PrototypeLocale}><main><SignInFlow flow={flow} initialReason={reason(error)} plan={plan} /></main></PublicPageFrame>;
}