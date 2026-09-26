import { afterEach, describe, expect, it, vi } from "vitest";

import { allowanceText, contactHrefFor } from "./presentation";

describe("allowanceText", () => {
  it("names the free workspace allowance for lite", () => {
    expect(allowanceText("en", "lite")).toBe("Free workspace: 3 approved deliveries a month");
  });

  it("says unlimited for paid, in the requested locale", () => {
    expect(allowanceText("zh-HK", "paid")).toBe("每月不限核准後交付次數");
  });
});

describe("contactHrefFor", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is null when the market has no configured contact channel", () => {
    expect(contactHrefFor("hk")).toBeNull();
  });

  it("is the market's first configured contact channel", () => {
    vi.stubEnv("NEXT_PUBLIC_HK_WHATSAPP_NUMBER", "+85291234567");
    expect(contactHrefFor("hk")).toBe("https://wa.me/85291234567");
  });
});
