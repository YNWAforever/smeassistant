/**
 * Returns the managed-auth exchange response only when it redirects to the
 * exact verifier-free callback URL. Returning the original response preserves
 * every SDK Set-Cookie header for the next clean request.
 */
export function cleanCallbackHandoff(request: Request, exchanged: Response): Response | null {
  const clean = new URL(request.url);
  clean.searchParams.delete("neon_auth_session_verifier");
  return exchanged.headers.get("location") === clean.toString() ? exchanged : null;
}
