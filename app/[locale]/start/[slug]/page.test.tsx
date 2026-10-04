// @vitest-environment jsdom
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizePreview: vi.fn(),
  cookieGet: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  form: vi.fn<(props: { locale: string; slug: string; claimHref: string }) => void>(),
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookieGet }) }));
vi.mock("@/lib/preview/eligibility", () => ({ authorizePreview: mocks.authorizePreview }));
vi.mock("@/components/product-ui", () => ({ PublicPageFrame: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/preview/preview-draft-form", () => ({
  PreviewDraftForm: (props: { locale: string; slug: string; claimHref: string }) => {
    mocks.form(props);
    return <form data-testid="preview-form" />;
  },
}));

import { copy, type PrototypeLocale } from "@/lib/copy";
import { VIEWER_GRANT_COOKIE } from "@/lib/report-access/cookie";
import Start, { generateMetadata } from "./page";

const ELIGIBLE = { job: { id: "job-1", status: "done", region: "hk", business_name: "Kam Man" }, grantId: "grant-1" };

async function render(locale: string, slug = "the-slug") {
  const element = await Start({ params: Promise.resolve({ locale, slug }) });
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(element);
  return root;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookieGet.mockReturnValue(undefined);
  mocks.authorizePreview.mockResolvedValue(ELIGIBLE);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/start/[slug]", () => {
  it("calls notFound when the flag is off or eligibility fails", async () => {
    for (const value of [undefined, "", "false", "TRUE"]) {
      vi.stubEnv("PREVIEW_DRAFT_ENABLED", value);
      await expect(render("en")).rejects.toThrow("NEXT_NOT_FOUND");
    }
    // Flag off decides before any cookie read or eligibility lookup.
    expect(mocks.authorizePreview).not.toHaveBeenCalled();
    expect(mocks.cookieGet).not.toHaveBeenCalled();

    vi.stubEnv("PREVIEW_DRAFT_ENABLED", "true");
    mocks.authorizePreview.mockResolvedValueOnce(null);
    await expect(render("en")).rejects.toThrow("NEXT_NOT_FOUND");

    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.authorizePreview.mockRejectedValueOnce(new Error("db down"));
    await expect(render("en")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(console.error).toHaveBeenCalledWith(expect.any(String), { category: "preview_eligibility_failed" });
    expect(mocks.form).not.toHaveBeenCalled();
  });

  it("authorizes with the slug and the viewer-grant cookie only", async () => {
    vi.stubEnv("PREVIEW_DRAFT_ENABLED", "true");
    const rawToken = Buffer.alloc(32, 7).toString("base64url");
    mocks.cookieGet.mockReturnValue({ value: `grant-1.${rawToken}` });
    await render("en", "abc");
    expect(mocks.cookieGet).toHaveBeenCalledWith(VIEWER_GRANT_COOKIE);
    expect(mocks.authorizePreview).toHaveBeenCalledWith({ slug: "abc", viewerToken: { grantId: "grant-1", rawToken } });

    mocks.cookieGet.mockReturnValue({ value: "not-a-valid-grant" });
    await expect(render("en", "abc")).resolves.toBeDefined();
    expect(mocks.authorizePreview).toHaveBeenLastCalledWith({ slug: "abc", viewerToken: null });
  });

  it.each(["en", "zh-HK", "zh-TW"] as const)("renders the badge 未認領草稿 · 未儲存 and the boundary note in en, zh-HK and zh-TW (%s)", async (locale: PrototypeLocale) => {
    vi.stubEnv("PREVIEW_DRAFT_ENABLED", "true");
    const root = await render(locale, "the-slug");
    const p = copy[locale].funnel.preview;
    expect(root.textContent).toContain(p.badge);
    expect(root.textContent).toContain(p.boundary);
    expect(root.querySelector("h1")?.textContent).toBe(p.cardTitle);
    expect(root.querySelector('[data-testid="preview-form"]')).not.toBeNull();
    expect(mocks.form).toHaveBeenCalledWith({ locale, slug: "the-slug", claimHref: `/${locale}/owner/sign-in?claim=the-slug` });
  });

  it("uses the exact badge and boundary strings from the spec", () => {
    expect(copy.en.funnel.preview.badge).toBe("Unclaimed draft · not saved");
    expect(copy["zh-HK"].funnel.preview.badge).toBe("未認領草稿 · 未儲存");
    expect(copy["zh-TW"].funnel.preview.badge).toBe("未認領草稿 · 未儲存");
    expect(copy.en.funnel.preview.boundary).toBe(
      "Only the text you type here is used. Nothing from your report is used, and nothing is saved, approved or published. One preview per unlocked report.",
    );
    expect(copy["zh-HK"].funnel.preview.boundary).toBe("只會使用你在此輸入的文字，不會使用報告內容，亦不會儲存、核准或發佈任何內容。每份已解鎖報告可試一次。");
    // Ruling R9: Taiwan usage 發布, not the spec's 發佈.
    expect(copy["zh-TW"].funnel.preview.boundary).toBe("只會使用你在此輸入的文字，不會使用報告內容，也不會儲存、核准或發布任何內容。每份已解鎖報告可試用一次。");
  });

  it("is noindex, with the preview title only when the flag is on (R13)", async () => {
    vi.stubEnv("PREVIEW_DRAFT_ENABLED", "true");
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "zh-TW" }) });
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.title).toBe(copy["zh-TW"].funnel.preview.cardTitle);
    for (const value of [undefined, "", "false", "TRUE"]) {
      vi.stubEnv("PREVIEW_DRAFT_ENABLED", value);
      const off = await generateMetadata({ params: Promise.resolve({ locale: "en" }) });
      expect(off).toEqual({ robots: { index: false, follow: false } });
      expect(JSON.stringify(off)).not.toContain(copy.en.funnel.preview.cardTitle);
    }
  });
});
