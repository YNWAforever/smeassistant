// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ requireOperator: vi.fn(), list: vi.fn(), health: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ requireOperator: () => mocks.requireOperator() }));
vi.mock("@/lib/repositories/failures", () => ({ failuresRepository: () => ({ list: mocks.list, health: mocks.health }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));

import OpsFailuresPage from "./page";
import type { FailureItem, OperatorHealth } from "@/lib/ops/failure-types";

const HEALTH: OperatorHealth = {
  recent: { scan_failed: { day: 2, week: 5 }, draft_failed: { day: 0, week: 1 } },
  open: { scan_dead_lettered: 1, google_connection: 0, workspace_processing: 0 },
  categories: [{ category: "COLLECTION_FAILED", day: 2, week: 4 }],
};
const DEAD: FailureItem = {
  kind: "scan_dead_lettered", id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", reference: "SCAN-3FA85F", correlationId: null,
  occurredAt: "2026-09-25T00:00:00.000Z", workspace: { id: "ws", slug: "kam-man-house", name: "Kam Man House" },
  locationId: null, actionId: null, businessName: "Kam Man House", reason: "ATTEMPTS_EXHAUSTED", attempts: 3, operatorAction: "release",
};

async function render(searchParams: Record<string, string> = {}) {
  const element = await OpsFailuresPage({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve(searchParams) });
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(element);
  return root;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOperator.mockResolvedValue({ userId: "op", email: "ada@fimmick.com" });
  mocks.list.mockResolvedValue([DEAD]);
  mocks.health.mockResolvedValue(HEALTH);
});

describe("/ops/failures", () => {
  it("is operator-only", async () => {
    mocks.requireOperator.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("shows health, the row, its reason meaning and the release control", async () => {
    const root = await render();
    expect(root.textContent).toContain("COLLECTION_FAILED");
    expect(root.textContent).toContain("SCAN-3FA85F");
    expect(root.textContent).toContain("kam-man-house");
    expect(root.textContent).toContain("The scan stopped responding after three attempts.");
    expect(root.textContent).toContain("Release for one more attempt");
    expect(root.querySelector('a[href*="/owner/"]')).toBeNull();
  });

  it("passes the kind filter and a parsed reference search to the reader", async () => {
    await render({ kind: "scan_failed", q: "SCAN-3FA85F" });
    expect(mocks.list).toHaveBeenCalledWith({ kinds: ["scan_failed"], hexPrefix: "3fa85f", uuid: null, workspaceId: null, limit: 200 });
  });

  it("explains an invalid search instead of querying", async () => {
    const root = await render({ q: "hello" });
    expect(mocks.list).not.toHaveBeenCalled();
    expect(root.textContent).toContain("Search by a SCAN-, RUN- or CONN- reference, or a full id.");
  });

  it("shows an explicit error, never an empty queue, when the reader fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.list.mockRejectedValue(new Error("down"));
    const root = await render();
    expect(root.textContent).toContain("The failure queue could not be loaded.");
    expect(root.textContent).not.toContain("No open failures");
  });
});
