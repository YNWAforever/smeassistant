import { beforeEach, expect, it, vi } from "vitest";

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

beforeEach(() => {
  vi.resetAllMocks();
  mocks.resolver.mockReturnValue(mocks.sentinel);
  mocks.loadReport.mockResolvedValue({ kind: "public" });
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
