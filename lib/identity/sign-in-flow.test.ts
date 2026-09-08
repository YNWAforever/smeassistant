import { describe, expect, it } from "vitest";

import { authFlowHref, callbackHref, parseAuthFlow } from "./sign-in-flow";

describe("sign-in flow context", () => {
  it("keeps the same destination when moving from Google recovery to email", () => {
    const flow = parseAuthFlow(new URLSearchParams({
      locale: "zh-HK",
      claim: "Ab_cd-12",
      returnTo: "/zh-HK/owner/shop/actions/a?tab=evidence",
      method: "google",
    }));

    const next = new URL(authFlowHref({ ...flow, method: "email" }, "start"), "https://app.test");
    expect(next.searchParams.get("claim")).toBe("Ab_cd-12");
    expect(next.searchParams.get("returnTo")).toBe("/zh-HK/owner/shop/actions/a?tab=evidence");
    expect(next.searchParams.get("method")).toBe("email");
  });

  it("keeps report slugs with underscores and hyphens", () => {
    const flow = parseAuthFlow(new URLSearchParams({ claim: "Ab_cd-12" }));
    expect(flow.claim).toBe("Ab_cd-12");
  });

  it("drops traversal, repeated context, and unknown method hints", () => {
    const flow = parseAuthFlow(new URLSearchParams(
      "locale=en&locale=zh-HK&claim=..%2Fstaff&returnTo=%2F%252fevil.example&method=github",
    ));
    expect(flow).toEqual({ locale: "zh-HK", claim: null, returnTo: null, method: null });
  });

  it.each(["/auth/callback", "/en/owner/sign-in%3Fmethod%3Dgoogle", "/zh-TW/owner/sign-in/complete"])(
    "does not retain auth-loop destinations after decoding: %s",
    (returnTo) => {
      const flow = parseAuthFlow(new URLSearchParams({ locale: "en", returnTo }));
      expect(flow.returnTo).toBeNull();
    },
  );

  it("builds callback URLs from only validated flow fields", () => {
    const flow = parseAuthFlow(new URLSearchParams(
      "locale=zh-TW&claim=Ab_cd-12&returnTo=%2Fzh-TW%2Fowner%2Fshop%3Ftab%3Devidence&method=google&token=secret",
    ));
    const url = new URL(callbackHref(flow), "https://app.test");
    expect(url.pathname).toBe("/auth/callback");
    expect([...url.searchParams.keys()]).toEqual(["locale", "claim", "returnTo", "method"]);
    expect(url.searchParams.get("returnTo")).toBe("/zh-TW/owner/shop?tab=evidence");
  });
});
