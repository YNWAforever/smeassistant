// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
// The real module pulls the whole public header (LocaleSelect, navigation hooks).
vi.mock("@/components/product-ui", () => ({
  PublicPageFrame: ({ children }: { children: ReactNode }) => children,
  FactType: ({ type }: { type: string }) => <span data-testid="fact-type">{type}</span>,
  ProviderBadge: ({ state }: { state: string }) => <span data-testid="provider-badge">{state}</span>,
  SectionCard: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));

import { copy } from "@/lib/copy";
import { MAX_POLL_DURATION_MS, pollRecordKey } from "@/lib/funnel/scan-progress";
import { ScanningPage } from "@/components/scanning-page";

const c = copy.en.funnel.scanning;
const JOB = "job-fixture";

type Reply = { ok: boolean; status: number; body?: unknown };
const RUNNING: Reply = { ok: true, status: 200, body: { status: "collecting", shareSlug: null, processingStage: "collecting_ig_gbp", coverage: null, failureCorrelationId: null } };

let statusReplies: Reply[];
let fetchSpy: ReturnType<typeof vi.fn>;

function statusCalls() {
  return fetchSpy.mock.calls.filter((call) => String(call[0]).includes("/api/scan/status")).length;
}

function processCalls() {
  return fetchSpy.mock.calls.filter((call) => String(call[0]).includes("/api/scan/process"));
}

/** Fake timers make Date fake too, which is what advances the polling budget. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  push.mockClear();
  window.localStorage.clear();
  statusReplies = [RUNNING];
  fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("/api/scan/process")) return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    const reply = statusReplies.length > 1 ? statusReplies.shift()! : statusReplies[0] ?? RUNNING;
    return { ok: reply.ok, status: reply.status, json: async () => reply.body ?? null } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ScanningPage bounded polling", () => {
  it("stops polling once the budget is spent and says so without claiming failure", async () => {
    render(<ScanningPage locale="en" jobId={JOB} />);
    await advance(MAX_POLL_DURATION_MS + 60_000);

    expect(screen.getByText(c.stalledTitle)).toBeTruthy();
    // We stopped asking; we did not learn that anything failed.
    expect(screen.queryByText(c.failedTitle)).toBeNull();

    const spent = statusCalls();
    await advance(600_000);
    expect(statusCalls()).toBe(spent);
  });

  it("shows the collectors as unknown rather than failed while stalled", async () => {
    render(<ScanningPage locale="en" jobId={JOB} />);
    await advance(MAX_POLL_DURATION_MS + 60_000);

    expect(screen.getAllByText(c.phase.stalled).length).toBeGreaterThan(0);
    expect(screen.queryByText(c.phase.running)).toBeNull();
    // "pending", never "failed": the real state is unknown.
    expect(screen.getAllByTestId("provider-badge").some((node) => node.textContent === "failed")).toBe(false);
  });

  it("resumes polling on Check again without touching the process endpoint", async () => {
    render(<ScanningPage locale="en" jobId={JOB} />);
    await advance(MAX_POLL_DURATION_MS + 60_000);

    const beforeStatus = statusCalls();
    const beforeProcess = processCalls().length;
    statusReplies = [{ ok: true, status: 200, body: { status: "done", shareSlug: "abc", processingStage: "done", coverage: 1, failureCorrelationId: null } }];
    await act(async () => {
      fireEvent.click(screen.getByText(c.stalledCheck));
    });
    await advance(5_000);

    expect(statusCalls()).toBeGreaterThan(beforeStatus);
    expect(processCalls().length).toBe(beforeProcess);
    expect(screen.queryByText(c.stalledTitle)).toBeNull();
    expect(screen.getByText(c.readyTitle)).toBeTruthy();
    expect(screen.getByRole("link", { name: new RegExp(c.readyButton) }).getAttribute("href")).toBe("/en/r/abc");
  });

  it("asks the server to resume with a single idempotent POST", async () => {
    render(<ScanningPage locale="en" jobId={JOB} />);
    await advance(MAX_POLL_DURATION_MS + 60_000);

    const before = processCalls().length;
    await act(async () => {
      fireEvent.click(screen.getByText(c.stalledResume));
    });

    const posts = processCalls();
    expect(posts.length).toBe(before + 1);
    expect(JSON.parse(String(posts[posts.length - 1][1]?.body))).toEqual({ jobId: JOB });
    // Nothing in the client can create a second job.
    expect(fetchSpy.mock.calls.every((call) => String(call[0]).includes("/api/scan/"))).toBe(true);
  });

  it("resumes the remaining budget after a refresh instead of buying a fresh one", async () => {
    const first = render(<ScanningPage locale="en" jobId={JOB} />);
    await advance(MAX_POLL_DURATION_MS / 2);
    expect(screen.queryByText(c.stalledTitle)).toBeNull();
    first.unmount();

    render(<ScanningPage locale="en" jobId={JOB} />);
    await advance(MAX_POLL_DURATION_MS / 2 + 60_000);

    expect(screen.getByText(c.stalledTitle)).toBeTruthy();
    // The elapsed clock counts from the original visit, not from the remount.
    expect(screen.getByText(/Elapsed 1[0-9]m/)).toBeTruthy();
  });

  it("treats an unknown scan reference as permanent and offers a new scan", async () => {
    statusReplies = [{ ok: false, status: 404 }];
    render(<ScanningPage locale="en" jobId={JOB} />);
    await advance(5_000);

    expect(screen.getByText(c.stalledTitle)).toBeTruthy();
    expect(screen.getByText(new RegExp(c.stalledReason.missing.slice(0, 20)))).toBeTruthy();
    expect(screen.getByRole("link", { name: new RegExp(c.retry) }).getAttribute("href")).toBe("/en/scan");
    expect(screen.queryByText(c.stalledResume)).toBeNull();

    const spent = statusCalls();
    await advance(120_000);
    expect(statusCalls()).toBe(spent);
  });

  it("stops immediately when the status endpoint rate-limits this scan", async () => {
    statusReplies = [{ ok: false, status: 429 }];
    render(<ScanningPage locale="en" jobId={JOB} />);
    await advance(5_000);

    expect(screen.getByText(new RegExp(c.stalledReason.rateLimited.slice(0, 20)))).toBeTruthy();
    const spent = statusCalls();
    await advance(120_000);
    expect(statusCalls()).toBe(spent);
  });

  it("rescues a finished scan when a backgrounded tab is reopened", async () => {
    render(<ScanningPage locale="en" jobId={JOB} />);
    await advance(MAX_POLL_DURATION_MS + 60_000);
    expect(screen.getByText(c.stalledTitle)).toBeTruthy();

    const before = statusCalls();
    statusReplies = [{ ok: true, status: 200, body: { status: "partial", shareSlug: "abc", processingStage: "done", coverage: 0.6, failureCorrelationId: null } }];
    await advance(60_000);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await advance(100);

    expect(statusCalls()).toBe(before + 1);
    expect(screen.queryByText(c.stalledTitle)).toBeNull();
    expect(screen.getByText(c.readyTitle)).toBeTruthy();
  });
});

it("keeps the poll record key namespaced per job", () => {
  expect(pollRecordKey(JOB)).toBe(`sme.scan.poll.${JOB}`);
});
