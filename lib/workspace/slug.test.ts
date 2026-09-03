import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { firstFreeSlug, slugify, uniqueLocationSlug, uniqueWorkspaceSlug } from "./slug";

describe("slugify", () => {
  it("kebab-cases ascii names", () => {
    expect(slugify("Kam Man House")).toBe("kam-man-house");
    expect(slugify("  Tin Hau  Cafe & Bar ")).toBe("tin-hau-cafe-bar");
  });

  it("strips accents through NFKD and collapses non-ascii", () => {
    expect(slugify("Café Été")).toBe("cafe-ete");
    // A purely CJK name collapses to nothing and falls back.
    expect(slugify("錦汶館")).toBe("workspace");
    expect(slugify("錦汶館 Kam Man")).toBe("kam-man");
  });

  it("falls back to 'workspace' when empty", () => {
    expect(slugify("")).toBe("workspace");
    expect(slugify("   ---  ")).toBe("workspace");
  });

  it("caps at 48 characters and never ends in a hyphen", () => {
    const long = "a".repeat(30) + " " + "b".repeat(30);
    const slug = slugify(long);
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug).toBe("a".repeat(30) + "-" + "b".repeat(17));
    // Cut lands exactly on the separator: the trailing hyphen is trimmed.
    expect(slugify("a".repeat(47) + " b")).toBe("a".repeat(47));
  });
});

describe("firstFreeSlug", () => {
  it("returns the base when nothing collides", () => {
    expect(firstFreeSlug("kam-man", [])).toBe("kam-man");
    // A different prefix is not a collision.
    expect(firstFreeSlug("kam-man", ["kam-man-house", "kam-manx"])).toBe("kam-man");
  });

  it("skips to the first free numeric suffix, starting at -2", () => {
    expect(firstFreeSlug("kam-man", ["kam-man"])).toBe("kam-man-2");
    expect(firstFreeSlug("kam-man", ["kam-man", "kam-man-2", "kam-man-4"])).toBe("kam-man-3");
  });

  it("treats a base with regex metacharacters literally", () => {
    expect(firstFreeSlug("a.b", ["a.b", "axb"])).toBe("a.b-2");
  });
});

/** Stubs `.from(table).select("slug")[.eq()].like()` resolving to the given rows. */
function stubDb(rows: Array<{ slug: string | null }>, error: { message: string } | null = null) {
  const like = vi.fn(async () => ({ data: error ? null : rows, error }));
  const eq = vi.fn(() => ({ like }));
  const select = vi.fn(() => ({ like, eq }));
  const from = vi.fn(() => ({ select }));
  return { db: { from } as unknown as SupabaseClient, from, select, eq, like };
}

describe("uniqueWorkspaceSlug", () => {
  it("queries workspaces.slug by prefix and returns the first free suffix", async () => {
    const stub = stubDb([{ slug: "kam-man" }, { slug: "kam-man-2" }, { slug: "kam-man-house" }]);
    await expect(uniqueWorkspaceSlug(stub.db, "kam-man")).resolves.toBe("kam-man-3");
    expect(stub.from).toHaveBeenCalledWith("workspaces");
    expect(stub.select).toHaveBeenCalledWith("slug");
    expect(stub.like).toHaveBeenCalledWith("slug", "kam-man%");
  });

  it("returns the base when the table has no match", async () => {
    const stub = stubDb([]);
    await expect(uniqueWorkspaceSlug(stub.db, "kam-man")).resolves.toBe("kam-man");
  });

  it("escapes LIKE wildcards in the base", async () => {
    const stub = stubDb([]);
    await uniqueWorkspaceSlug(stub.db, "a_b");
    expect(stub.like).toHaveBeenCalledWith("slug", "a\\_b%");
  });

  it("throws on a lookup error instead of guessing", async () => {
    const stub = stubDb([], { message: "db down" });
    await expect(uniqueWorkspaceSlug(stub.db, "kam-man")).rejects.toThrow("workspace slug lookup failed");
  });
});

describe("uniqueLocationSlug", () => {
  it("scopes the lookup to the workspace", async () => {
    const stub = stubDb([{ slug: "tin-hau" }]);
    await expect(uniqueLocationSlug(stub.db, "ws-1", "tin-hau")).resolves.toBe("tin-hau-2");
    expect(stub.from).toHaveBeenCalledWith("locations");
    expect(stub.eq).toHaveBeenCalledWith("workspace_id", "ws-1");
    expect(stub.like).toHaveBeenCalledWith("slug", "tin-hau%");
  });
});
