// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecoveryForm } from "@/components/report/recovery-form";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SENT = {
  en: "If that address unlocked this report, a link is on its way. It works once, for 60 minutes.",
  "zh-HK": "如該地址曾解鎖此報告，連結已在途中。連結只可使用一次，60 分鐘內有效。",
  "zh-TW": "如果該地址曾解鎖這份報告，連結已寄出。連結只能使用一次，60 分鐘內有效。",
} as const;

function mount(locale: "en" | "zh-HK" | "zh-TW") {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<RecoveryForm locale={locale} slug="fixture" />));
  return host;
}

async function submit(host: HTMLElement) {
  const input = host.querySelector("input") as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, "a@example.com");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    (host.querySelector("form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("RecoveryForm", () => {
  it("renders the heading and an email field", () => {
    const host = mount("en");
    expect(host.textContent).toContain("Already unlocked this report? Email me a new link");
    const input = host.querySelector("input") as HTMLInputElement;
    expect(input.type).toBe("email");
    expect(input.required).toBe(true);
    expect(input.maxLength).toBe(254);
  });

  it.each(["en", "zh-HK", "zh-TW"] as const)("shows the fixed message after a 200 (%s)", async (locale) => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const host = mount(locale);
    await submit(host);
    expect(fetchMock).toHaveBeenCalledWith("/api/report-access/recover", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ slug: "fixture", email: "a@example.com", locale });
    expect(host.textContent).toContain(SENT[locale]);
  });

  it("shows the same message when the response is not 200 or the fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 429, ok: false }));
    let host = mount("en");
    await submit(host);
    expect(host.textContent).toContain(SENT.en);

    document.body.innerHTML = "";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    host = mount("en");
    await submit(host);
    expect(host.textContent).toContain(SENT.en);
  });
});
