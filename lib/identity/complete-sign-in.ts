import type { SessionUser } from "@/lib/auth";

import { isLocale, DEFAULT_LOCALE } from "@/lib/locale";

import type { IdentityProvider } from "./contracts";
import type { AuthStage } from "./sign-in-diagnostics";
import type { AuthFlow } from "./sign-in-flow";
import { safeReturnPath } from "./return-path";

export type CompletionResult =
  | { kind: "redirect"; destination: string }
  | { kind: "no_access" }
  | { kind: "recover"; reason: "invalid_session" | "unavailable"; correlationId: string };

export interface CompletionPorts {
  getIdentity: IdentityProvider["getIdentity"];
  mapIdentity: (identity: NonNullable<Awaited<ReturnType<IdentityProvider["getIdentity"]>>>) => Promise<SessionUser>;
  bindInvitations: (user: SessionUser) => Promise<void>;
  hasAcceptedMembership: (userId: string) => Promise<boolean>;
  finishClaim: (user: SessionUser, flow: AuthFlow) => Promise<string | null>;
  clearInvalidSession: () => Promise<void>;
  reportFailure: (stage: AuthStage, correlationId: string) => void;
}

function localeFor(flow: AuthFlow): string {
  return isLocale(flow.locale) ? flow.locale : DEFAULT_LOCALE;
}

function selectorDestination(flow: AuthFlow): string {
  return `/${localeFor(flow)}/owner/select-workspace`;
}

function safeDestination(destination: string): string | null {
  return safeReturnPath(destination, "") || null;
}

function recover(ports: CompletionPorts, stage: AuthStage): CompletionResult {
  const correlationId = crypto.randomUUID();
  try {
    ports.reportFailure(stage, correlationId);
  } catch {
    // Diagnostics are never allowed to turn an operational error into a leak.
  }
  return { kind: "recover", reason: "unavailable", correlationId };
}

async function invalidSession(ports: CompletionPorts): Promise<CompletionResult> {
  try {
    await ports.clearInvalidSession();
  } catch {
    return recover(ports, "fresh_session");
  }
  return { kind: "recover", reason: "invalid_session", correlationId: crypto.randomUUID() };
}

/**
 * Completes application authorization after managed Auth has established a
 * cookie-backed provider session. This function deliberately has no Request
 * dependencies, so route validation can reject hostile requests before any
 * identity or database work starts.
 */
export async function completeSignIn(flow: AuthFlow, ports: CompletionPorts): Promise<CompletionResult> {
  let identity: Awaited<ReturnType<IdentityProvider["getIdentity"]>>;
  try {
    identity = await ports.getIdentity();
  } catch {
    return recover(ports, "fresh_session");
  }
  if (!identity) return invalidSession(ports);

  let user: SessionUser;
  try {
    user = await ports.mapIdentity(identity);
  } catch {
    return recover(ports, "identity_mapping");
  }
  if (!user?.id || user.verified !== true) return invalidSession(ports);

  try {
    await ports.bindInvitations(user);
  } catch {
    return recover(ports, "invitation_binding");
  }

  if (flow.claim) {
    let destination: string | null;
    try {
      destination = await ports.finishClaim(user, flow);
    } catch {
      return recover(ports, "claim_resolution");
    }
    const safe = destination ? safeDestination(destination) : null;
    if (!safe) return recover(ports, "claim_resolution");
    return { kind: "redirect", destination: safe };
  }

  try {
    if (!(await ports.hasAcceptedMembership(user.id))) return { kind: "no_access" };
  } catch {
    return recover(ports, "workspace_lookup");
  }

  return { kind: "redirect", destination: safeDestination(flow.returnTo ?? "") ?? selectorDestination(flow) };
}
