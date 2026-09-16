import { describe, expect, it, vi, beforeEach } from "vitest";
import { runWebsiteVerification } from "./website-sweep";

const html = (body: string) =>
  `<!doctype html><html lang="en"><head><title>A shop that is long enough</title><meta name="description" content="${"d".repeat(80)}"></head><body><h1>One</h1>${body}</body></html>`;
const FAQ = `<script type="application/ld+json">{"@type":"FAQPage","mainEntity":[]}</script>`;

function repo(overrides: Record<string, unknown> = {}) {
  return {
    dueLocations: vi
      .fn()
      .mockResolvedValue([{ location_id: "loc-1", workspace_id: "ws-1", website_url: "https://example.test" }]),
    actionsForLocations: vi.fn().mockResolvedValue([
      {
        id: "act-1",
        workspace_id: "ws-1",
        location_id: "loc-1",
        template_key: "visibility-content",
        prior_checks: { evaluated: 1, passed: 0, results: [{ key: "faq_schema", pass: false }] },
      },
    ]),
    markChecked: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("runWebsiteVerification", () => {
  let recorded: Array<Record<string, unknown>>;
  let fetchCalls: string[];

  beforeEach(() => {
    recorded = [];
    fetchCalls = [];
  });

  const deps = (body: string) => ({
    fetch: (async (url: string) => {
      fetchCalls.push(String(url));
      return new Response(html(body), { status: 200, headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch,
    record: async (row: Record<string, unknown>) => {
      recorded.push(row);
    },
  });

  it("writes one verified row when the failing check now passes", async () => {
    const r = repo();
    const result = await runWebsiteVerification(r as never, deps(FAQ) as never, {
      now: new Date("2026-09-16T00:00:00Z"),
      limit: 5,
    });
    expect(result).toEqual({ locationsChecked: 1, actionsVerified: 1 });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ source: "verified", actionId: "act-1", workspaceId: "ws-1" });
    expect(recorded[0].evidence).toMatchObject({
      url: "https://example.test",
      checks: ["faq_schema"],
      checked_at: "2026-09-16T00:00:00.000Z",
    });
  });

  it("writes nothing but still stamps when the check still fails", async () => {
    const r = repo();
    const result = await runWebsiteVerification(r as never, deps("") as never, { now: new Date(), limit: 5 });
    expect(result.actionsVerified).toBe(0);
    expect(recorded).toEqual([]);
    // Stamping on failure is what turns a five-minute retry into a daily one.
    // Pairs, not bare ids: an id alone does not imply a tenant.
    expect(r.markChecked).toHaveBeenCalledWith([{ id: "act-1", workspace_id: "ws-1" }], expect.any(String));
  });

  it("treats an unreachable site as not-yet, not as verified", async () => {
    const r = repo();
    const failing = {
      ...deps(""),
      fetch: (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
    };
    const result = await runWebsiteVerification(r as never, failing as never, { now: new Date(), limit: 5 });
    expect(result.actionsVerified).toBe(0);
    expect(recorded).toEqual([]);
    expect(r.markChecked).toHaveBeenCalled();
  });

  it("stamps even when recording a verified row throws", async () => {
    const r = repo();
    const exploding = {
      ...deps(FAQ),
      record: async () => {
        throw new Error("insert failed");
      },
    };
    await expect(
      runWebsiteVerification(r as never, exploding as never, { now: new Date(), limit: 5 }),
    ).rejects.toThrow("insert failed");
    expect(r.markChecked).toHaveBeenCalledWith([{ id: "act-1", workspace_id: "ws-1" }], expect.any(String));
  });

  it("fetches a location once even when it has several eligible actions", async () => {
    const r = repo({
      actionsForLocations: vi.fn().mockResolvedValue([
        {
          id: "act-1",
          workspace_id: "ws-1",
          location_id: "loc-1",
          template_key: "visibility-content",
          prior_checks: { evaluated: 1, passed: 0, results: [{ key: "faq_schema", pass: false }] },
        },
        {
          id: "act-2",
          workspace_id: "ws-1",
          location_id: "loc-1",
          template_key: "website-basics",
          prior_checks: { evaluated: 1, passed: 0, results: [{ key: "single_h1", pass: false }] },
        },
      ]),
    });
    await runWebsiteVerification(r as never, deps(FAQ) as never, { now: new Date(), limit: 5 });
    // Two actions, one site: the owner's server must not be hit twice.
    expect(fetchCalls).toHaveLength(1);
  });

  it("pairs each action with its own location's fetch result", async () => {
    const r = repo({
      dueLocations: vi.fn().mockResolvedValue([
        { location_id: "loc-1", workspace_id: "ws-1", website_url: "https://with-faq.test" },
        { location_id: "loc-2", workspace_id: "ws-1", website_url: "https://no-faq.test" },
      ]),
      actionsForLocations: vi.fn().mockResolvedValue([
        // Deliberately not in dueLocations order: a positional pairing bug would
        // verify act-2 against loc-1's site.
        {
          id: "act-2",
          workspace_id: "ws-1",
          location_id: "loc-2",
          template_key: "visibility-content",
          prior_checks: { evaluated: 1, passed: 0, results: [{ key: "faq_schema", pass: false }] },
        },
        {
          id: "act-1",
          workspace_id: "ws-1",
          location_id: "loc-1",
          template_key: "visibility-content",
          prior_checks: { evaluated: 1, passed: 0, results: [{ key: "faq_schema", pass: false }] },
        },
      ]),
    });
    const perSite = {
      fetch: (async (url: string) => {
        fetchCalls.push(String(url));
        return new Response(html(String(url).includes("with-faq") ? FAQ : ""), {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }) as unknown as typeof fetch,
      record: async (row: Record<string, unknown>) => {
        recorded.push(row);
      },
    };
    const result = await runWebsiteVerification(r as never, perSite as never, { now: new Date(), limit: 5 });
    expect(result).toEqual({ locationsChecked: 2, actionsVerified: 1 });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ actionId: "act-1", evidence: { url: "https://with-faq.test" } });
  });

  it("asks for at most `limit` locations", async () => {
    const r = repo();
    await runWebsiteVerification(r as never, deps(FAQ) as never, { now: new Date(), limit: 3 });
    expect(r.dueLocations).toHaveBeenCalledWith(3, expect.any(Array));
  });

  it("does nothing and fetches nothing when no location is due", async () => {
    const r = repo({ dueLocations: vi.fn().mockResolvedValue([]) });
    const result = await runWebsiteVerification(r as never, deps(FAQ) as never, { now: new Date(), limit: 5 });
    expect(result).toEqual({ locationsChecked: 0, actionsVerified: 0 });
    expect(fetchCalls).toEqual([]);
    expect(r.markChecked).not.toHaveBeenCalled();
  });

  it("does not verify when the prior checks are a malformed jsonb shape", async () => {
    const r = repo({
      actionsForLocations: vi.fn().mockResolvedValue([
        {
          id: "act-1",
          workspace_id: "ws-1",
          location_id: "loc-1",
          template_key: "visibility-content",
          prior_checks: { results: "nope" },
        },
      ]),
    });
    const result = await runWebsiteVerification(r as never, deps(FAQ) as never, { now: new Date(), limit: 5 });
    expect(result.actionsVerified).toBe(0);
    expect(recorded).toEqual([]);
    expect(r.markChecked).toHaveBeenCalled();
  });
});
