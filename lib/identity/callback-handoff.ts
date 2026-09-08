/**
 * Returns the managed-auth exchange response only when it redirects to the
 * exact verifier-free callback URL. The SDK cookies remain intact while the
 * browser is redirected to the completion screen for application authorization.
 */
import { authFlowHref, parseAuthFlow } from "./sign-in-flow";

export function cleanCallbackHandoff(request: Request, exchanged: Response): Response | null {
  const clean = new URL(request.url);
  clean.searchParams.delete("neon_auth_session_verifier");
  if (exchanged.headers.get("location") !== clean.toString()) return null;
  const flow = parseAuthFlow(clean.searchParams);
  const headers = new Headers(exchanged.headers);
  headers.set("location", new URL(authFlowHref(flow, "complete"), clean).toString());
  return new Response(exchanged.body, { status: exchanged.status, statusText: exchanged.statusText, headers });
}