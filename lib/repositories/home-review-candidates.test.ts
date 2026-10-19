import { expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { workspaceReadRepository } from "./workspace-read";
import { OWNER_REVIEW_CHECK_EVENT } from "@/lib/workspace/owner-review-check";

it("reads existing exact-version metadata with workspace/location boundaries before the final limit and no mutations", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const repository = workspaceReadRepository({ query } as unknown as Pick<Pool, "query">);
  expect(await repository.homeReviewCandidates("synthetic-workspace", "synthetic-location", ["synthetic-location"])).toEqual([]);
  const [sql, values] = query.mock.calls[0] as [string, unknown[]];
  expect(values).toEqual(["synthetic-workspace", "synthetic-location", ["synthetic-location"], OWNER_REVIEW_CHECK_EVENT]);
  for (const predicate of ["a.workspace_id=$1", "v.workspace_id=a.workspace_id", "v.action_id=a.id",
    "v.id=p.output_version_id", "e.workspace_id=a.workspace_id", "e.entity_id=a.id",
    "e.payload#>>'{owner_check,versionId}'=v.id::text", "a.location_id=ANY($3::uuid[])"]) {
    expect(sql).toContain(predicate);
    expect(sql.indexOf(predicate)).toBeLessThan(sql.lastIndexOf("LIMIT"));
  }
  expect(sql).toContain("e.id::text");
  expect(sql).toContain("p.retracted_at IS NULL");
  expect(sql).toContain("verified.output_version_id=v.id");
  expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|CALL)\b/i);
  const limit = Number(sql.match(/LIMIT\s+(\d+)\s*$/)?.[1]);
  expect(limit).toBeGreaterThan(0);
  expect(limit).toBeLessThanOrEqual(10);
});
it("surfaces a failed read instead of presenting it as no work or a saved check", async () => {
  const query = vi.fn().mockRejectedValue(Object.assign(new Error("private SQL text"), { code: "42501" }));
  const repository = workspaceReadRepository({ query } as unknown as Pick<Pool, "query">);
  await expect(repository.homeReviewCandidates("synthetic-workspace", null, null))
    .rejects.toMatchObject({ message: "workspace_read_unavailable", code: "42501" });
});
