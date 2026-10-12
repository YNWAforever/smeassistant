import type { RouteAuth } from "@/lib/auth";

/** Only known identity failures or repository I/O failures are recoverable. */
export async function authorizationOrUnavailable(read: () => Promise<RouteAuth>): Promise<RouteAuth | null> {
  try { return await read(); }
  catch (error) {
    const reason = error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "";
    if (reason === "membership_dependency_unavailable"
      || /^identity_(?:provider_unavailable|session_failed|config_invalid|resolution_failed|dependency_timeout)$/.test(reason)) return null;
    throw error;
  }
}
