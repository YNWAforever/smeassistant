// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Children, type ReactElement, type ReactNode } from "react";
const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/components/product-ui", () => ({ PublicPageFrame: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: ReactNode }) => {
    const [trigger, content] = Children.toArray(children) as ReactElement<{ id?: string; children?: ReactNode }>[];
    return <select id={trigger.props.id} value={value} onChange={event => onValueChange(event.target.value)}><option value="" />{content}</select>;
  },
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => children,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));
import { ScanPage } from "./scan-page";
import { copy } from "@/lib/copy";
import { t } from "@/lib/i18n";

const JOB = "11111111-2222-4333-8444-555555555555";
beforeEach(() => { window.sessionStorage.clear(); nav.push.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function walkToStart(locale: "en" | "zh-HK" | "zh-TW") {
  const c = copy[locale].funnel.scan;
  render(<ScanPage locale={locale} initialMarket="hk" initialBusiness="Fixture Cafe" consentPolicyVersion="fixture-policy" />);
  fireEvent.click(screen.getByRole("button", { name: c.manualEntry }));
  fireEvent.click(screen.getByRole("button", { name: c.continue }));
  const industry = screen.getByLabelText(t(locale, "scanner.industryLabel")) as HTMLSelectElement;
  const district = screen.getByLabelText(t(locale, "scanner.districtLabel")) as HTMLSelectElement;
  fireEvent.change(industry, { target: { value: industry.options[1].value } });
  fireEvent.change(district, { target: { value: district.options[1].value } });
  fireEvent.click(screen.getByRole("button", { name: c.continue }));
  fireEvent.click(screen.getByRole("button", { name: c.continue }));
  fireEvent.click(screen.getByRole("checkbox"));
  return c;
}
const startBodies = (fetch: ReturnType<typeof vi.fn>) =>
  fetch.mock.calls.filter(([url]) => String(url).includes("/api/scan/start")).map(([, init]) => JSON.parse((init as RequestInit).body as string));

// F-13: the server committed the scan but the response was lost. The owner's
// retry must carry the same submission key so the server returns that job
// instead of queueing a second paid scan.
it.each(["en", "zh-HK", "zh-TW"] as const)("retries a lost start with the same submission key: %s", async (locale) => {
  const fetch = vi.fn()
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ jobId: JOB, replayed: true }) });
  vi.stubGlobal("fetch", fetch);
  const c = walkToStart(locale);
  fireEvent.click(screen.getByRole("button", { name: c.start }));
  await screen.findByText(c.errors.network);
  fireEvent.click(screen.getByRole("button", { name: c.start }));
  await waitFor(() => expect(nav.push).toHaveBeenCalledWith(`/${locale}/scanning/${JOB}`));
  const [first, retry] = startBodies(fetch);
  expect(first.submission_key).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(retry.submission_key).toBe(first.submission_key);
});

it("forgets a key the server says belongs to another scan, so the next press is a fresh submission", async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: "submission_key_conflict" }) })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ jobId: JOB }) });
  vi.stubGlobal("fetch", fetch);
  const c = walkToStart("en");
  fireEvent.click(screen.getByRole("button", { name: c.start }));
  await screen.findByText(c.errors.submit);
  expect(screen.getByRole("checkbox")).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: c.start }));
  await waitFor(() => expect(nav.push).toHaveBeenCalled());
  const [first, retry] = startBodies(fetch);
  expect(retry.submission_key).not.toBe(first.submission_key);
});
