// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// The real module pulls the whole public header (LocaleSelect, navigation hooks).
vi.mock("@/components/product-ui", () => ({
  PublicPageFrame: ({ children }: { children: ReactNode }) => children,
}));

import { copy } from "@/lib/copy";
import { getMessages } from "@/lib/i18n";
import { ScanPage } from "@/components/scan-page";

const c = copy.en.funnel.scan;

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ outcome: "NO_RESULTS", candidates: [] }) }) as unknown as Response);
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("ScanPage step 1 search while scans are paused (P3.5d)", () => {
  it("shows the pause.scansNotStarted text instead of a generic provider-error message", async () => {
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/business/search")) {
        return { ok: false, status: 503, json: async () => ({ error: "paused" }) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({ outcome: "NO_RESULTS", candidates: [] }) } as unknown as Response;
    });

    render(<ScanPage locale="en" initialMarket="hk" consentPolicyVersion="2026-07-28" />);
    fireEvent.change(screen.getByLabelText(c.businessLabel), { target: { value: "Kam Man House" } });
    await act(async () => {
      fireEvent.click(screen.getByText(c.searchButton));
    });

    expect(await screen.findByText(getMessages("en").pause.scansNotStarted)).toBeInTheDocument();
    expect(screen.queryByText(getMessages("en").scanner.candidateErrorProvider)).toBeNull();
  });
});
