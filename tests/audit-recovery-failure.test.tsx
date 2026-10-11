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

it.each(["rate_limited", "network_error"])("AUDIT F-20261011-03: %s must not tell the visitor a link is on its way", async (kind) => {
  vi.stubGlobal("fetch", kind === "rate_limited" ? vi.fn().mockResolvedValue({status:429,ok:false}) : vi.fn().mockRejectedValue(new Error("offline")));
  const host = mount("en");
  await submit(host);
  console.info("AUDIT", JSON.stringify({kind, text:host.textContent, retryFormVisible:!!host.querySelector("button")}));
  expect(host.textContent).not.toContain("a link is on its way");
});
