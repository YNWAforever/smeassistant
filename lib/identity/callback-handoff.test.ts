import { expect, it } from "vitest";
import { cleanCallbackHandoff } from "@/app/auth/callback/route";
it("keeps SDK cookies only when verifier exchange lands on the exact clean callback and moves to completion", () => {
  const request = new Request("https://app.test/auth/callback?locale=en&neon_auth_session_verifier=fixture");
  const exchanged = new Response(null, { status: 307, headers: { location: "https://app.test/auth/callback?locale=en", "set-cookie": "__Secure-neon-auth.session_token=fixture; Path=/; Secure; HttpOnly" } });
  const response = cleanCallbackHandoff(request, exchanged);
  expect(response?.headers.get("set-cookie")).toContain("__Secure-neon-auth.session_token=fixture");
  expect(response?.headers.get("location")).toBe("https://app.test/en/owner/sign-in/complete");
  expect(cleanCallbackHandoff(request, new Response(null, { status: 307, headers: { location: "https://app.test/auth/callback?locale=en&neon_auth_session_verifier=fixture" } }))).toBeNull();
});