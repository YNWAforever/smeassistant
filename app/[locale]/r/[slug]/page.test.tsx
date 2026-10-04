import { isValidElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadReport: vi.fn(),
  resolver: vi.fn(),
  sentinel: vi.fn(async () => null),
  buildReportProps: vi.fn(),
}));
vi.mock("@/lib/report/load-report", () => ({ loadReport: mocks.loadReport }));
vi.mock("@/lib/auth", () => ({ reportMembershipResolver: mocks.resolver }));
vi.mock("@/lib/funnel/report-props", () => ({ buildReportProps: mocks.buildReportProps }));
vi.mock("@/components/public-pages", () => ({ ReportPage: () => null }));

import Report from "./page";

afterEach(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.resolver.mockReturnValue(mocks.sentinel);
  mocks.loadReport.mockResolvedValue({ access: "public", preview: { status: "done" } });
  mocks.buildReportProps.mockReturnValue({});
});

it("loads the report with the session layer's workspace membership resolver", async () => {
  await Report({ params: Promise.resolve({ locale: "en", slug: "the-slug" }) });
  expect(mocks.resolver).toHaveBeenCalledTimes(1);
  expect(mocks.loadReport).toHaveBeenCalledWith("the-slug", "en", { getMembership: mocks.sentinel });
});

it("builds a fresh resolver for every render, so no membership outlives its request", async () => {
  await Report({ params: Promise.resolve({ locale: "zh-HK", slug: "a" }) });
  await Report({ params: Promise.resolve({ locale: "zh-HK", slug: "b" }) });
  expect(mocks.resolver).toHaveBeenCalledTimes(2);
});

async function renderedProps(access: string, flag: string | undefined, status = "done") {
  vi.stubEnv("PREVIEW_DRAFT_ENABLED", flag);
  mocks.loadReport.mockResolvedValue({ access, preview: { status } });
  mocks.buildReportProps.mockReturnValue({ access });
  const element = await Report({ params: Promise.resolve({ locale: "zh-TW", slug: "the-slug" }) });
  if (!isValidElement(element)) throw new Error("expected an element");
  return element.props as Record<string, unknown>;
}

it("links an unlocked viewer to the unsaved preview only when the flag is on", async () => {
  expect(await renderedProps("viewer", "true")).toEqual({ access: "viewer", previewDraftHref: "/zh-TW/start/the-slug" });
  for (const flag of [undefined, "", "false", "TRUE"]) {
    expect(await renderedProps("viewer", flag)).toEqual({ access: "viewer" });
  }
  for (const access of ["public", "member", "staff"]) {
    expect(await renderedProps(access, "true")).toEqual({ access });
  }
});

it("shows the card only for a done or partial job (R13)", async () => {
  expect(await renderedProps("viewer", "true", "partial")).toEqual({ access: "viewer", previewDraftHref: "/zh-TW/start/the-slug" });
  for (const status of ["queued", "collecting", "scoring", "persisting", "failed"]) {
    expect(await renderedProps("viewer", "true", status)).toEqual({ access: "viewer" });
  }
});
