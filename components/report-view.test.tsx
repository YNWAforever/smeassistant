// @vitest-environment jsdom
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/r/fixture",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
// The frame renders the public header and its locale select; the report body is the subtree under test.
vi.mock("@/components/product-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PublicPageFrame: ({ children, signInHref }: { children: ReactNode; signInHref?: string }) => <div data-sign-in-href={signInHref ?? ""}>{children}</div>,
}));

import { ReportPage } from "@/components/report-view";
import { copy, type PrototypeLocale } from "@/lib/copy";
import type { ReportProps } from "@/lib/funnel/report-props";

const report: ReportProps = {
  locale: "en", access: "viewer", sample: false, slug: "fixture", market: "hk", businessName: "Fixture Cafe",
  district: null, industry: null, status: "done", subtitle: null, scannedAt: "2026-09-07T01:00:00Z", score: 40, coverage: 50,
  comparison: { kind: "first_scan" }, modules: [], priorities: [], locked: null, summary: null, findingGroups: [], proof: null, evidence: [], ctas: [],
};

function markup(props: ReportProps) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(<ReportPage {...props} />);
  return root;
}

describe("ReportPage preview card", () => {
  it.each(["en", "zh-HK", "zh-TW"] as const)("renders the preview card only when previewDraftHref is set (%s)", (locale: PrototypeLocale) => {
    const title = copy[locale].funnel.preview.cardTitle;
    const withCard = markup({ ...report, locale, previewDraftHref: `/${locale}/start/fixture` });
    const link = withCard.querySelector(`a[href="/${locale}/start/fixture"]`);
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain(title);

    const without = markup({ ...report, locale });
    expect(without.querySelector('a[href*="/start/"]')).toBeNull();
    expect(without.textContent).not.toContain(title);
  });

  it("uses the exact card copy from the spec", () => {
    expect(copy.en.funnel.preview.cardTitle).toBe("Try one AI reply draft (not saved)");
    expect(copy["zh-HK"].funnel.preview.cardTitle).toBe("試寫一則 AI 評論回覆（不會儲存）");
    expect(copy["zh-TW"].funnel.preview.cardTitle).toBe("試寫一則 AI 評論回覆（不會儲存）");
  });
});

describe("ReportPage header sign-in (F-20)", () => {
  const signInHref = (props: ReportProps) => markup(props).querySelector("[data-sign-in-href]")?.getAttribute("data-sign-in-href");

  it.each(["en", "zh-HK", "zh-TW"] as const)("an unlocked viewer signs in with this report's claim (%s)", (locale: PrototypeLocale) => {
    expect(signInHref({ ...report, locale, slug: "rwGNE2DDRVpEPKQ1suqeGXaU" })).toBe(`/${locale}/owner/sign-in?claim=rwGNE2DDRVpEPKQ1suqeGXaU`);
  });

  it("does not attach a claim for the public preview, a member, or the sample report", () => {
    expect(signInHref({ ...report, access: "public" } as unknown as ReportProps)).toBe("");
    expect(signInHref({ ...report, access: "member" })).toBe("");
    expect(signInHref({ ...report, sample: true })).toBe("");
  });
});
