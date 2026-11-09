import { describe, expect, it } from "vitest";

import {
  assertPreviewIsolation,
  buildPreviewBranchPlan,
  normalisePreviewSlug,
  previewBranchName,
  readPreviewJournalMin,
} from "./preview-databases";

const PRODUCTION = "postgresql://neondb_owner:secret@ep-tiny-forest-azzm8bni.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const PREVIEW = "postgresql://neondb_owner:secret@ep-preview-branch-123456.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

describe("preview branch planning", () => {
  it("normalises slugs and builds a bounded branch name", () => {
    expect(normalisePreviewSlug("  Shared Studio! ")).toBe("shared-studio");
    expect(() => normalisePreviewSlug("!!!")).toThrow();
    expect(previewBranchName(138, "Shared Studio")).toBe("preview-pr-138-shared-studio");
    expect(() => previewBranchName(0, "x")).toThrow();
    expect(() => previewBranchName(1, "")).toThrow();
  });

  it("plans a schema-only branch with create/migrate/cleanup commands and an expiry", () => {
    const plan = buildPreviewBranchPlan({ prNumber: 138, slug: "studio sharing", days: 7, now: new Date("2026-11-09T00:00:00.000Z") });
    expect(plan).toMatchObject({
      branchName: "preview-pr-138-studio-sharing",
      parentBranch: "production",
      schemaOnly: true,
      expiresAt: "2026-11-16T00:00:00.000Z",
      envKeys: ["DATABASE_URL", "DATABASE_URL_UNPOOLED"],
    });
    expect(plan.createCommand).toContain("--schema-only");
    expect(plan.createCommand).toContain("--expires-at 2026-11-16T00:00:00.000Z");
    expect(plan.cleanupCommand).toContain("neon branches delete");
    expect(plan.migrateCommand).not.toContain("secret");
  });

  it("rejects unsafe windows and parents", () => {
    expect(() => buildPreviewBranchPlan({ prNumber: 1, slug: "x", days: 0 })).toThrow();
    expect(() => buildPreviewBranchPlan({ prNumber: 1, slug: "x", days: 31 })).toThrow();
    expect(() => buildPreviewBranchPlan({ prNumber: 1, slug: "x", parentBranch: "bad branch" })).toThrow();
  });
});

describe("preview isolation", () => {
  it("passes only on a different branch endpoint with the same database name", () => {
    expect(assertPreviewIsolation(PREVIEW, PRODUCTION)).toMatchObject({
      previewHost: "ep-preview-branch-123456.c-3.ap-southeast-1.aws.neon.tech",
      previewDatabase: "neondb",
      productionHost: "ep-tiny-forest-azzm8bni.c-3.ap-southeast-1.aws.neon.tech",
    });
  });

  it("fails closed for the production endpoint, non-Postgres URLs and mismatched databases", () => {
    expect(() => assertPreviewIsolation(PRODUCTION, PRODUCTION)).toThrow("production endpoint");
    expect(() => assertPreviewIsolation("https://example.test/x", PRODUCTION)).toThrow("PostgreSQL");
    expect(() => assertPreviewIsolation("not a url", PRODUCTION)).toThrow("valid database URL");
    const otherDatabase = PREVIEW.replace("/neondb?", "/other?");
    expect(() => assertPreviewIsolation(otherDatabase, PRODUCTION)).toThrow("database names must match");
  });
});

describe("preview journal read", () => {
  it("returns the max ordinal or null", async () => {
    expect(await readPreviewJournalMin({ query: async () => ({ rows: [{ n: 22 }] }) } as never)).toBe(22);
    expect(await readPreviewJournalMin({ query: async () => ({ rows: [{ n: null }] }) } as never)).toBeNull();
  });
});
