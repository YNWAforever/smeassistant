import { afterEach, expect, it, vi } from "vitest";
afterEach(() => { vi.unstubAllGlobals(); });
it("SDK magic-link and Google calls use intercepted managed endpoints", async () => {
  const transport = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(typeof input === "string" ? new URL(input, "https://app.test") : input, init);
    expect(new URL(request.url).origin).toBe("https://app.test");
    expect(request.method).toBe("POST");
    return Response.json({ status: true });
  });
  vi.stubGlobal("fetch", transport);
  const { authClient } = await import("./client");
  await authClient.signIn.magicLink({ email: "fixture@example.test", callbackURL: "/auth/callback?locale=zh-HK" });
  expect(String(transport.mock.calls[0][0])).toContain("/api/auth/sign-in/magic-link");
  expect(JSON.parse(transport.mock.calls[0][1]!.body as string)).toMatchObject({callbackURL:"/auth/callback?locale=zh-HK"});
  await authClient.signIn.social({ provider: "google", callbackURL: "/auth/callback?locale=en" });
  expect(String(transport.mock.calls[1][0])).toContain("/api/auth/sign-in/social");
});
