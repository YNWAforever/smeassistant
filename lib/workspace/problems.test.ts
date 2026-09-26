import { afterEach, describe, expect, it, vi } from "vitest";
import { loadWorkspaceProblems, type ProblemsInput } from "./problems";
import type { FailureItem } from "@/lib/ops/failure-types";

const item = (kind: FailureItem["kind"], locationId: string | null = "loc-a"): FailureItem => ({
  kind, id: `${kind}-1`, reference: "SCAN-ABCDEF", correlationId: null, occurredAt: "2026-09-25T00:00:00.000Z",
  workspace: { id: "ws-1", slug: "kam-man-house", name: "Kam Man House" }, locationId, actionId: null,
  businessName: "Kam Man House", reason: "COLLECTION_FAILED", attempts: null, operatorAction: "none",
});

const input: ProblemsInput = { workspaceId: "ws-1", market: "hk", membership: { role: "owner", locationScope: null }, tier: "lite" };

afterEach(() => vi.restoreAllMocks());

describe("loadWorkspaceProblems", () => {
  it("reads only owner kinds for this workspace and resolves actions", async () => {
    const list = vi.fn().mockResolvedValue([item("scan_failed")]);
    const problems = await loadWorkspaceProblems(input, { list, contactHref: () => "https://wa.me/85200000000" });
    expect(list).toHaveBeenCalledWith({ kinds: ["scan_failed", "scan_dead_lettered", "draft_failed", "google_connection"], hexPrefix: null, uuid: null, workspaceId: "ws-1", limit: 50 });
    expect(problems).toEqual([expect.objectContaining({ kind: "scan_failed", ownerAction: "contact_support", contactHref: "https://wa.me/85200000000" })]);
  });

  it("returns null and logs, never an empty list, when the read fails", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const problems = await loadWorkspaceProblems(input, { list: vi.fn().mockRejectedValue(new Error("down")), contactHref: () => null });
    expect(problems).toBeNull();
    expect(errors).toHaveBeenCalledWith("[ops] problems_unavailable", { category: "ops_problems_unavailable" });
  });
});
