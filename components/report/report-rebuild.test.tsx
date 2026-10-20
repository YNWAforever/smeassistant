// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/en/r/fixture", useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

import { copy } from "@/lib/copy";
import type { ReportFindingGroup, ReportModuleRow, ReportProps } from "@/lib/funnel/report-props";
import { DashboardSummary } from "./dashboard-summary";
import { FindingsBrowser } from "./findings-browser";
import { ObservationDate } from "./observation-date";
import { ReportActions } from "./report-actions";

const modules: ReportModuleRow[] = [
  { key: "ig", score: null, label: "Instagram", state: "unavailable", value: "Not scored", detail: "", observedAt: null, limitationCode: "IG_HANDLE_NOT_PROVIDED" },
  { key: "gbp", score: 70, label: "Google Business", state: "measured", value: "70 / 100", detail: "", observedAt: "2026-09-05T00:00:00Z", limitationCode: null },
];
const finding = (id: string, module: string, severity: string, label: string) => ({ id, key: id, label, module, severity, severityLabel: severity, tone: "high" as const, scoreImpact: -3, overallImpact: null, message: `Why ${label}`, action: `Do ${label}`, fixPackDraft: null, evidence: [] as Array<[string, string]> });
const groups: ReportFindingGroup[] = [
  { module: "ig", label: "Instagram", findings: [finding("a", "ig", "critical", "Bio unclear")] },
  { module: "gbp", label: "Google Business", findings: [finding("b", "gbp", "warning", "Hours missing"), finding("c", "gbp", "critical", "Few replies")] },
];
afterEach(() => { document.body.innerHTML = ""; vi.clearAllMocks(); });

describe("ObservationDate", () => {
  const text = (node: React.ReactElement) => { const root = document.createElement("div"); root.innerHTML = renderToStaticMarkup(node); return root; };
  it.each(["en", "zh-HK", "zh-TW"] as const)("prefers the source date, then the scan date, else says the date was not recorded (%s)", locale => {
    expect(text(<ObservationDate value="2026-09-05T00:00:00Z" scannedAt="2026-09-07T00:00:00Z" locale={locale} />).querySelector("time")?.getAttribute("datetime")).toBe("2026-09-05T00:00:00Z");
    const scanned = text(<ObservationDate value={null} scannedAt="2026-09-07T00:00:00Z" locale={locale} />);
    expect(scanned.querySelector("time")?.textContent).toBe("2026-09-07");
    expect(scanned.textContent).toBe(copy[locale].report.scannedOn.replace("{date}", "2026-09-07"));
    const none = text(<ObservationDate value="not a date" scannedAt={null} locale={locale} />);
    expect(none.querySelector("time")).toBeNull();
    expect(none.textContent).toBe(copy[locale].report.dateNotRecorded);
  });
});

describe("FindingsBrowser", () => {
  it("gives every finding its source, date, coverage state and limitation, with why and what next", () => {
    render(<FindingsBrowser groups={groups} modules={modules} scannedAt="2026-09-07T00:00:00Z" locale="en" />);
    const items = document.querySelectorAll("li");
    expect(items).toHaveLength(3);
    const ig = items[0].textContent ?? "";
    expect(ig).toContain("Why it matters");
    expect(ig).toContain("What to do next");
    expect(ig).toContain("Source: Instagram");
    expect(ig).toContain("Scanned 2026-09-07");
    expect(ig).toContain("Unavailable");
    expect(ig).toContain("Instagram handle not provided");
    expect(items[1].textContent).toContain("2026-09-05");
    expect(items[1].textContent).not.toContain("Scanned");
  });

  it("keeps each anchor outside a closed disclosure", () => {
    render(<FindingsBrowser groups={groups} modules={modules} locale="en" />);
    for (const key of ["ig", "gbp"]) {
      const anchor = document.getElementById(`report-detail-${key}`)!;
      expect(anchor.closest("details")).toBeNull();
      expect(anchor.nextElementSibling?.tagName).toBe("DETAILS");
      expect(anchor.nextElementSibling?.hasAttribute("open")).toBe(false);
    }
  });

  it("filters by priority and by source without removing rows from the markup", () => {
    render(<FindingsBrowser groups={groups} modules={modules} locale="en" />);
    expect(screen.getByRole("status").textContent).toBe("Showing 3 of 3 findings");
    fireEvent.click(screen.getByRole("button", { name: "critical" }));
    expect(screen.getByRole("status").textContent).toBe("Showing 2 of 3 findings");
    expect(document.querySelectorAll("li")).toHaveLength(3);
    expect(document.querySelectorAll("li[hidden]")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Google Business" }));
    expect(screen.getByRole("status").textContent).toBe("Showing 1 of 3 findings");
    expect(document.getElementById("report-detail-ig")!.parentElement!.hidden).toBe(true);
    expect(screen.getByRole("button", { name: "Google Business" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getAllByRole("button", { name: "All" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "warning" }));
    fireEvent.click(screen.getByRole("button", { name: "Instagram" }));
    expect(screen.getByRole("status").textContent).toBe(copy.en.report.filters.none);
  });

  it("orders priority filters critical, warning, info", () => {
    const mixed = [{ module: "gbp", label: "Google Business", findings: [finding("x", "gbp", "info", "X"), finding("y", "gbp", "warning", "Y"), finding("z", "gbp", "critical", "Z")] }];
    render(<FindingsBrowser groups={mixed} modules={modules} locale="en" />);
    expect(Array.from(screen.getByRole("group", { name: "Priority" }).querySelectorAll("button")).map(button => button.textContent)).toEqual(["All", "critical", "warning", "info"]);
  });

  it("shows no filters for a single finding", () => {
    render(<FindingsBrowser groups={[groups[0]]} modules={modules} locale="en" />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("ReportActions", () => {
  it("links Save only when a claim href is given and always offers copy and print", () => {
    render(<ReportActions locale="en" claimHref="/en/owner/sign-in?claim=slug" />);
    expect(screen.getByRole("link", { name: /Save to my workspace/ }).getAttribute("href")).toBe("/en/owner/sign-in?claim=slug");
    expect(screen.getByText(copy.en.report.actions.shareHint)).toBeTruthy();
    document.body.innerHTML = "";
    render(<ReportActions locale="zh-HK" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("button", { name: copy["zh-HK"].report.actions.copyLink })).toBeTruthy();
    expect(screen.getByRole("button", { name: copy["zh-HK"].report.actions.print })).toBeTruthy();
  });

  it("copies the share URL without the hash and confirms", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    window.history.replaceState(null, "", "/en/r/fixture#report-detail-ig");
    render(<ReportActions locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await vi.waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Link copied"));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/en/r/fixture`);
  });

  it("opens collapsed sections for printing and closes them again", () => {
    document.body.innerHTML = '<main class="report-page"><details id="a"></details><details id="b" open></details></main>';
    render(<ReportActions locale="en" />);
    window.dispatchEvent(new Event("beforeprint"));
    expect((document.getElementById("a") as HTMLDetailsElement).open).toBe(true);
    window.dispatchEvent(new Event("afterprint"));
    expect((document.getElementById("a") as HTMLDetailsElement).open).toBe(false);
    expect((document.getElementById("b") as HTMLDetailsElement).open).toBe(true);
  });
});

describe("summary actions", () => {
  const report: ReportProps = {
    locale: "en", access: "viewer", sample: false, slug: "fixture", market: "hk", businessName: "Fixture Cafe", district: null, industry: null,
    status: "done", subtitle: null, scannedAt: "2026-09-07T01:00:00Z", score: 40, coverage: 50, comparison: { kind: "first_scan" }, modules,
    priorities: [], locked: null, summary: null, findingGroups: [], proof: null, evidence: [], ctas: [],
  };
  const html = (props: ReportProps) => { const root = document.createElement("div"); root.innerHTML = renderToStaticMarkup(<DashboardSummary report={props} />); return root; };
  it("gives members copy and print but no claim, and the public preview and sample no actions", () => {
    const member = html({ ...report, access: "member" });
    expect(member.textContent).toContain("Copy link");
    expect(member.querySelector('a[href*="/owner/sign-in"]')).toBeNull();
    expect(html({ ...report, access: "public" }).textContent).not.toContain("Copy link");
    expect(html({ ...report, sample: true, access: "sample" }).textContent).not.toContain("Copy link");
  });
  it("shows coverage as one segment per source, missing sources not drawn as zero", () => {
    const root = html(report);
    const segments = root.querySelectorAll(".k-coverage-segment");
    expect(Array.from(segments).map(segment => segment.getAttribute("data-state"))).toEqual(["unavailable", "measured"]);
  });
});
