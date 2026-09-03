import { describe, expect, it, vi } from "vitest";
import { searchInstagramCandidates, type IgSource } from "./service";
import { buildInstagramCandidate } from "./handle";
import type { IgSourceOutcome, IgSourceResult } from "./types";

function sourceResult(handles: string[], outcome: IgSourceOutcome = "SUCCESS"): IgSourceResult {
  return { outcome, candidates: handles.map((handle) => buildInstagramCandidate(handle, "picker_confirmed")) };
}

function source(key: IgSource["key"], result: IgSourceResult): IgSource & { run: ReturnType<typeof vi.fn> } {
  return { key, run: vi.fn(async () => result) } as never;
}

const request = { businessName: "金萬餐廳", market: "HK" as const, district: "跑馬地" };
const withWebsite = { ...request, websiteUrl: "https://www.instagram.com/kamman.hk/" };

describe("searchInstagramCandidates", () => {
  it("spends nothing at all when path A resolves the handle", async () => {
    const rapid = source("rapidapi", sourceResult(["other.shop"]));
    const serp = source("serpapi", sourceResult(["another.shop"]));

    const result = await searchInstagramCandidates(withWebsite, { sources: [rapid, serp] });

    expect(result.outcome).toBe("SUCCESS");
    expect(result.candidates.map((candidate) => candidate.handle)).toEqual(["kamman.hk"]);
    expect(result.candidates[0]?.provenance).toBe("gbp_cross_referenced");
    expect(rapid.run).not.toHaveBeenCalled();
    expect(serp.run).not.toHaveBeenCalled();
  });

  it("stops at the first source that returns candidates", async () => {
    const rapid = source("rapidapi", sourceResult(["kamman.hk"]));
    const serp = source("serpapi", sourceResult(["should.not.be.reached"]));

    const result = await searchInstagramCandidates(request, { sources: [rapid, serp] });

    expect(result.candidates.map((candidate) => candidate.handle)).toEqual(["kamman.hk"]);
    expect(rapid.run).toHaveBeenCalledTimes(1);
    expect(serp.run).not.toHaveBeenCalled();
  });

  it("falls through to the next source when the first is UNSUPPORTED", async () => {
    const rapid = source("rapidapi", sourceResult([], "UNSUPPORTED"));
    const serp = source("serpapi", sourceResult(["kamman.hk"]));

    const result = await searchInstagramCandidates(request, { sources: [rapid, serp] });

    expect(result.outcome).toBe("SUCCESS");
    expect(result.candidates.map((candidate) => candidate.handle)).toEqual(["kamman.hk"]);
    expect(serp.run).toHaveBeenCalledTimes(1);
  });

  it("never reports UNSUPPORTED to the caller — it is not an outcome a merchant can act on", async () => {
    const result = await searchInstagramCandidates(request, {
      sources: [source("rapidapi", sourceResult([], "UNSUPPORTED")), source("serpapi", sourceResult([], "UNSUPPORTED"))],
    });
    expect(result.outcome).toBe("NO_RESULTS");
  });

  it("falls through a real failure and succeeds on the next source", async () => {
    const rapid = source("rapidapi", sourceResult([], "PROVIDER_QUOTA_ERROR"));
    const serp = source("serpapi", sourceResult(["kamman.hk"]));

    const result = await searchInstagramCandidates(request, { sources: [rapid, serp] });

    expect(result.outcome).toBe("SUCCESS");
    expect(serp.run).toHaveBeenCalledTimes(1);
  });

  it("surfaces the first real failure when every source fails", async () => {
    const result = await searchInstagramCandidates(request, {
      sources: [
        source("rapidapi", sourceResult([], "PROVIDER_QUOTA_ERROR")),
        source("serpapi", sourceResult([], "TIMEOUT")),
      ],
    });
    expect(result.outcome).toBe("PROVIDER_QUOTA_ERROR");
    expect(result.candidates).toEqual([]);
  });

  it("prefers a real failure over NO_RESULTS when reporting", async () => {
    const result = await searchInstagramCandidates(request, {
      sources: [
        source("rapidapi", sourceResult([], "NO_RESULTS")),
        source("serpapi", sourceResult([], "PROVIDER_AUTH_ERROR")),
      ],
    });
    expect(result.outcome).toBe("PROVIDER_AUTH_ERROR");
  });

  it("returns NO_RESULTS when every source answers and none finds anything", async () => {
    const result = await searchInstagramCandidates(request, {
      sources: [source("rapidapi", sourceResult([])), source("serpapi", sourceResult([], "NO_RESULTS"))],
    });
    expect(result.outcome).toBe("NO_RESULTS");
  });

  it("caps the candidate list at 8", async () => {
    const handles = Array.from({ length: 12 }, (_unused, index) => `shop${index}`);
    const result = await searchInstagramCandidates(request, { sources: [source("rapidapi", sourceResult(handles))] });
    expect(result.candidates).toHaveLength(8);
  });

  it("spends nothing when the query has no meaningful name", async () => {
    const rapid = source("rapidapi", sourceResult(["kamman.hk"]));
    const result = await searchInstagramCandidates({ businessName: "  ", market: "HK" }, { sources: [rapid] });
    expect(rapid.run).not.toHaveBeenCalled();
    expect(result.outcome).toBe("NO_RESULTS");
  });

  it("spends nothing once the caller has aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const rapid = source("rapidapi", sourceResult(["kamman.hk"]));

    const result = await searchInstagramCandidates(request, { sources: [rapid], signal: controller.signal });

    expect(rapid.run).not.toHaveBeenCalled();
    expect(result.outcome).toBe("TIMEOUT");
  });

  it("still returns the path-A candidate when the caller aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const rapid = source("rapidapi", sourceResult([]));

    const result = await searchInstagramCandidates(withWebsite, { sources: [rapid], signal: controller.signal });

    expect(rapid.run).not.toHaveBeenCalled();
    expect(result.outcome).toBe("SUCCESS");
    expect(result.candidates.map((candidate) => candidate.handle)).toEqual(["kamman.hk"]);
  });

  it("passes the request and the caller's signal to each source it runs", async () => {
    const controller = new AbortController();
    const rapid = source("rapidapi", sourceResult(["kamman.hk"]));
    await searchInstagramCandidates(request, { sources: [rapid], signal: controller.signal });
    expect(rapid.run).toHaveBeenCalledWith(request, controller.signal);
  });
});
