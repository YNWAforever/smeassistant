// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
let query = "t=tok123";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(query),
}));

import { RecoverRedeem } from "@/components/report/recover-redeem";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EXPIRED = {
  en: "This link has expired or was already used.",
  "zh-HK": "此連結已過期或已使用。",
  "zh-TW": "這個連結已過期或已使用。",
} as const;

function mount(locale: "en" | "zh-HK" | "zh-TW" = "en") {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<RecoverRedeem locale={locale} />));
  return host;
}

beforeEach(() => {
  replace.mockReset();
  query = "t=tok123";
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("RecoverRedeem", () => {
  it("makes no request on mount and posts the token only on click", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ reportUrl: "/en/r/fixture" }) });
    vi.stubGlobal("fetch", fetchMock);
    const host = mount();
    expect(fetchMock).not.toHaveBeenCalled();
    const button = host.querySelector("button") as HTMLButtonElement;
    expect(button.textContent).toContain("Open my report");
    await act(async () => button.click());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/report-access/redeem");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: "tok123", locale: "en" });
    expect(replace).toHaveBeenCalledWith("/en/r/fixture");
  });

  it.each(["en", "zh-HK", "zh-TW"] as const)("shows the expired message on 410 (%s)", async (locale) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 410, ok: false, json: async () => ({ error: "link_expired" }) }));
    const host = mount(locale);
    await act(async () => (host.querySelector("button") as HTMLButtonElement).click());
    expect(host.textContent).toContain(EXPIRED[locale]);
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows the expired message for any other failure, including a rejected fetch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    const host = mount();
    await act(async () => (host.querySelector("button") as HTMLButtonElement).click());
    expect(host.textContent).toContain(EXPIRED.en);
  });

  it("without a token shows the expired message and no button", () => {
    query = "";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const host = mount();
    expect(host.querySelector("button")).toBeNull();
    expect(host.textContent).toContain(EXPIRED.en);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
