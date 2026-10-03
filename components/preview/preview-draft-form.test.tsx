// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PreviewDraftForm } from "@/components/preview/preview-draft-form";
import { copy, type PrototypeLocale } from "@/lib/copy";
import { interpolate } from "@/lib/share";

const LOCALES: PrototypeLocale[] = ["en", "zh-HK", "zh-TW"];
const REASONS = ["already_used", "job_limit", "ip_limit", "daily_limit", "budget", "paused", "unavailable", "invalid_input"] as const;
const REVIEW = "The roast goose was cold and the wait was long. 燒鵝凍咗 SECRET-INPUT";

const fetchMock = vi.fn();
const writeText = vi.fn();

function respond(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

function mount(locale: PrototypeLocale = "en") {
  return render(<PreviewDraftForm locale={locale} slug="the-slug" claimHref={`/${locale}/owner/sign-in?claim=the-slug`} />);
}

function type(locale: PrototypeLocale, value: string) {
  fireEvent.change(screen.getByLabelText(copy[locale].funnel.preview.reviewLabel), { target: { value } });
}

async function submit(locale: PrototypeLocale = "en") {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: copy[locale].funnel.preview.submit }));
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PreviewDraftForm", () => {
  it("posts the review, rating and locale to the preview route", async () => {
    fetchMock.mockReturnValue(respond(200, { state: "generated", body: "Thank you.", warnings: [] }));
    mount("zh-HK");
    type("zh-HK", REVIEW);
    fireEvent.click(screen.getByLabelText(interpolate(copy["zh-HK"].funnel.preview.ratingOption, { rating: 2 })));
    await submit("zh-HK");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/start/the-slug/preview");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ review: REVIEW, rating: 2, locale: "zh-HK" });
  });

  it("omits the rating when none is chosen", async () => {
    fetchMock.mockReturnValue(respond(200, { state: "generated", body: "Thank you.", warnings: [] }));
    mount();
    type("en", REVIEW);
    await submit();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ review: REVIEW, locale: "en" });
  });

  it.each(LOCALES)("shows the draft with badge, warnings, Copy, not-kept line and CTA on generated (%s)", async (locale) => {
    const p = copy[locale].funnel.preview;
    fetchMock.mockReturnValue(
      respond(200, { state: "generated", body: "Thank you for the feedback.", warnings: ["Check the tone", "No offer was promised"] }),
    );
    mount(locale);
    type(locale, REVIEW);
    await submit(locale);
    const result = screen.getByTestId("preview-result");
    expect(result).toHaveTextContent(p.badge);
    expect(result).toHaveTextContent("Thank you for the feedback.");
    expect(result).toHaveTextContent("Check the tone");
    expect(result).toHaveTextContent("No offer was promised");
    expect(result).toHaveTextContent(p.notKept);
    expect(screen.getByRole("button", { name: p.copy })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: p.cta })).toHaveAttribute("href", `/${locale}/owner/sign-in?claim=the-slug`);
  });

  it("uses the exact result strings from the spec", () => {
    expect(copy.en.funnel.preview.notKept).toBe("This draft is not kept. Copy it now if you want it.");
    expect(copy["zh-HK"].funnel.preview.notKept).toBe("此草稿不會保留，如需要請立即複製。");
    expect(copy["zh-TW"].funnel.preview.notKept).toBe("此草稿不會保留，如需要請立即複製。");
    expect(copy.en.funnel.preview.cta).toBe("Verify ownership to save and approve drafts");
    expect(copy["zh-HK"].funnel.preview.cta).toBe("驗證擁有權以儲存及核准草稿");
    expect(copy["zh-TW"].funnel.preview.cta).toBe("驗證擁有權以儲存並核准草稿");
    expect(copy.en.funnel.preview.submit).toBe("Draft a reply");
    expect(copy["zh-HK"].funnel.preview.submit).toBe("草擬回覆");
    expect(copy["zh-TW"].funnel.preview.submit).toBe("草擬回覆");
  });

  it("copies the body to the clipboard", async () => {
    fetchMock.mockReturnValue(respond(200, { state: "generated", body: "Thank you for the feedback.", warnings: [] }));
    mount();
    type("en", REVIEW);
    await submit();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copy.en.funnel.preview.copy }));
    });
    expect(writeText).toHaveBeenCalledWith("Thank you for the feedback.");
    expect(screen.getByRole("status")).toHaveTextContent(copy.en.funnel.preview.copied);
  });

  it("says so when the clipboard refuses", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    fetchMock.mockReturnValue(respond(200, { state: "generated", body: "Thank you.", warnings: [] }));
    mount();
    type("en", REVIEW);
    await submit();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copy.en.funnel.preview.copy }));
    });
    expect(screen.getByRole("status")).toHaveTextContent(copy.en.funnel.preview.copyFailed);
  });

  describe.each(REASONS)("refusal %s", (reason) => {
    it.each(LOCALES)("shows fixed copy in three locales without echoing input (%s)", async (locale) => {
      const p = copy[locale].funnel.preview;
      fetchMock.mockReturnValue(respond(reason === "invalid_input" ? 400 : 200, { state: "refused", reason }));
      mount(locale);
      type(locale, REVIEW);
      await submit(locale);
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(p.refusals[reason]);
      expect(alert.textContent).not.toContain("SECRET-INPUT");
      expect(screen.queryByTestId("preview-result")).toBeNull();
      // already_used points to the ownership CTA; the other refusals do not.
      const cta = screen.queryByRole("link", { name: p.cta });
      if (reason === "already_used") expect(cta).toHaveAttribute("href", `/${locale}/owner/sign-in?claim=the-slug`);
      else expect(cta).toBeNull();
    });
  });

  it("has distinct, non-empty refusal copy for every reason in every locale", () => {
    for (const locale of LOCALES) {
      const refusals = copy[locale].funnel.preview.refusals;
      expect(Object.keys(refusals).sort()).toEqual([...REASONS].sort());
      const texts = REASONS.map((reason) => refusals[reason]);
      expect(texts.every((text) => text.trim().length > 0)).toBe(true);
      expect(new Set(texts).size).toBe(texts.length);
    }
  });

  it.each([
    ["a 404", () => respond(404, { error: "not_found" })],
    ["a 500", () => respond(500, { error: "boom" })],
    ["an unknown reason", () => respond(200, { state: "refused", reason: "SECRET-INPUT" })],
    ["a generated body that is not text", () => respond(200, { state: "generated", body: 42, warnings: [] })],
    ["a malformed body", () => Promise.resolve(new Response("not json", { status: 200 }))],
    ["a network error", () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("shows the unavailable copy on %s", async (_label, reply) => {
    fetchMock.mockImplementation(reply);
    mount();
    type("en", REVIEW);
    await submit();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(copy.en.funnel.preview.refusals.unavailable);
    expect(alert.textContent).not.toContain("SECRET-INPUT");
  });

  it("disables submit while pending and counts code points", async () => {
    let resolve: (value: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    mount();
    const p = copy.en.funnel.preview;
    // Three emoji are six UTF-16 units but three code points; surrounding spaces are trimmed like the route does.
    type("en", "  😀😀😀 great  ");
    expect(screen.getByTestId("preview-count")).toHaveTextContent(interpolate(p.count, { count: 9 }));
    type("en", REVIEW);
    expect(screen.getByTestId("preview-count")).toHaveTextContent(interpolate(p.count, { count: [...REVIEW].length }));

    await submit();
    const pending = screen.getByRole("button", { name: p.submitting });
    expect(pending).toBeDisabled();
    fireEvent.click(pending);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve(new Response(JSON.stringify({ state: "refused", reason: "unavailable" }), { status: 200 }));
    });
    expect(screen.getByRole("button", { name: p.submit })).not.toBeDisabled();
  });

  it("marks the count when the review is over 1,500 code points", () => {
    mount();
    type("en", "😀".repeat(1501));
    const count = screen.getByTestId("preview-count");
    expect(count).toHaveTextContent(interpolate(copy.en.funnel.preview.count, { count: 1501 }));
    expect(count).toHaveAttribute("data-over", "true");
  });

  it("never renders version, approve, export, regenerate or save controls", async () => {
    fetchMock.mockReturnValue(respond(200, { state: "generated", body: "Thank you.", warnings: [] }));
    const { container } = mount();
    type("en", REVIEW);
    await submit();
    // After a draft the form is gone: the only button is Copy and the only link is the ownership CTA.
    expect(screen.getAllByRole("button").map((button) => button.textContent?.trim())).toEqual([copy.en.funnel.preview.copy]);
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/en/owner/sign-in?claim=the-slug"]);
    expect(screen.queryByLabelText(copy.en.funnel.preview.reviewLabel)).toBeNull();
    // The ownership CTA is the only place "approve" may appear: it links away, it does not approve.
    expect(container.textContent?.replace(copy.en.funnel.preview.cta, "")).not.toMatch(/\bv\d+\b|version|approv|export|regenerat/i);
  });
});
