import { describe, expect, it } from "vitest";
import { diffScans, type ScanDiffInput } from "./diff";
import type { FindingKey, ModuleKey } from "./types";

const VERSION = "2026-07-28";

function measured(score: number, findingKeys: FindingKey[] = []) {
  return { status: "measured" as const, score, findingKeys };
}

const unavailable = { status: "unavailable" as const, score: null, findingKeys: [] as FindingKey[] };

function scan(
  modules: Partial<Record<ModuleKey, ScanDiffInput["modules"][ModuleKey]>>,
  scoringVersion: string | null = VERSION,
): ScanDiffInput {
  return { scoringVersion, modules };
}

describe("diffScans — version gating", () => {
  it("refuses when either side predates scoring_version", () => {
    // Every row written before 2026-07-14 carries NULL next to a score produced by
    // unknown rules. There is no salvageable history.
    const withVersion = scan({ ig: measured(70), gbp: measured(60) });
    const withoutVersion = scan({ ig: measured(70), gbp: measured(60) }, null);
    expect(diffScans(withoutVersion, withVersion).incomparableReason).toBe("SCORING_VERSION_UNKNOWN");
    expect(diffScans(withVersion, withoutVersion).incomparableReason).toBe("SCORING_VERSION_UNKNOWN");
  });

  it("refuses across a version bump", () => {
    // A bump means our rules changed. A delta would measure our code, not them.
    const base = scan({ ig: measured(70), gbp: measured(60) }, "2026-07-14");
    const head = scan({ ig: measured(80), gbp: measured(60) }, "2026-07-28");
    const diff = diffScans(base, head);
    expect(diff.comparable).toBe(false);
    expect(diff.incomparableReason).toBe("SCORING_VERSION_MISMATCH");
    expect(diff.compositeDelta).toBeNull();
    expect(diff.resolvedFindings).toEqual([]);
  });
});

describe("diffScans — the findings trap", () => {
  it("does not report a lost module's findings as resolved", () => {
    // THE bug this module exists to prevent. Every scorer's unavailable branch
    // returns findings: [], so a naive set-difference reads one RapidAPI outage
    // as the merchant fixing every Instagram problem they had.
    const base = scan({
      ig: measured(40, ["ig.profile_clarity", "ig.bio_cta", "ig.engagement_low"]),
      gbp: measured(60, ["gbp.rating_low"]),
      aeo: measured(50),
    });
    const head = scan({ ig: unavailable, gbp: measured(60, ["gbp.rating_low"]), aeo: measured(50) });

    const diff = diffScans(base, head);
    expect(diff.resolvedFindings).toEqual([]);
    expect(diff.lostCoverage).toEqual(["ig"]);
    expect(diff.intersectionModules).toEqual(["gbp", "aeo"]);
  });

  it("does not report a newly measured module's findings as regressions", () => {
    // The mirror image: they were always there, we just could not see them.
    const base = scan({ ig: unavailable, gbp: measured(60), aeo: measured(50) });
    const head = scan({
      ig: measured(40, ["ig.profile_clarity", "ig.bio_cta"]),
      gbp: measured(60),
      aeo: measured(50),
    });

    const diff = diffScans(base, head);
    expect(diff.regressedFindings).toEqual([]);
    expect(diff.gainedCoverage).toEqual(["ig"]);
  });

  it("reports a genuine fix within a module measured on both sides", () => {
    const base = scan({ gbp: measured(60, ["gbp.rating_low", "gbp.photos_volume"]), aeo: measured(50) });
    const head = scan({ gbp: measured(75, ["gbp.rating_low"]), aeo: measured(50) });
    expect(diffScans(base, head).resolvedFindings).toEqual(["gbp.photos_volume"]);
  });

  it("separates time decay from a real regression", () => {
    // A merchant who changes nothing acquires gbp.review_freshness by waiting.
    // Calling that a regression blames them for the calendar — and pages them
    // about it once alerts exist.
    const base = scan({ gbp: measured(70), aeo: measured(50) });
    const head = scan({
      gbp: measured(55, ["gbp.review_freshness", "gbp.rating_low"]),
      aeo: measured(50),
    });
    const diff = diffScans(base, head);
    expect(diff.decayedFindings).toEqual(["gbp.review_freshness"]);
    expect(diff.regressedFindings).toEqual(["gbp.rating_low"]);
  });
});

describe("diffScans — the composite trap", () => {
  it("recomputes both composites over the intersection, not the stored denominators", () => {
    // base measured ig+gbp+aeo; head lost aeo. The honest delta compares ig+gbp
    // on both sides, so an unchanged merchant shows zero movement.
    const base = scan({ ig: measured(80), gbp: measured(60), aeo: measured(20) });
    const head = scan({ ig: measured(80), gbp: measured(60), aeo: unavailable });

    const diff = diffScans(base, head);
    expect(diff.intersectionModules).toEqual(["ig", "gbp"]);
    expect(diff.compositeBase).toBe(diff.compositeHead);
    expect(diff.compositeDelta).toBe(0);
  });

  it("does not let a dropped weak module look like improvement", () => {
    // The non-monotonic coupling, stated as a test: over the full measured set the
    // stored composite RISES when a weak module disappears. Over the intersection
    // it correctly does not move.
    const base = scan({ ig: measured(90), gbp: measured(90), aeo: measured(10) });
    const head = scan({ ig: measured(90), gbp: measured(90), aeo: unavailable });
    expect(diffScans(base, head).compositeDelta).toBe(0);
  });

  it("withholds a composite when the intersection has fewer than two independent channels", () => {
    // Trust is derived from IG and GBP, so gbp+trust is one channel, not two —
    // the same rule scoreAll applies when it returns overall: null.
    const base = scan({ gbp: measured(60), trust: measured(50), ig: unavailable, aeo: unavailable });
    const head = scan({ gbp: measured(70), trust: measured(55), ig: unavailable, aeo: unavailable });

    const diff = diffScans(base, head);
    expect(diff.comparable).toBe(true);
    expect(diff.compositeDelta).toBeNull();
    expect(diff.compositeWithheldReason).toBe("INSUFFICIENT_INDEPENDENT_CHANNELS");
  });

  it("still reports findings when the composite is withheld", () => {
    // Withholding the number must not withhold the diagnosis.
    const base = scan({ gbp: measured(60, ["gbp.rating_low"]), trust: measured(50) });
    const head = scan({ gbp: measured(70), trust: measured(50) });
    const diff = diffScans(base, head);
    expect(diff.compositeDelta).toBeNull();
    expect(diff.resolvedFindings).toEqual(["gbp.rating_low"]);
  });

  it("reports a real improvement when coverage is identical", () => {
    const base = scan({ ig: measured(50), gbp: measured(50), aeo: measured(50) });
    const head = scan({ ig: measured(60), gbp: measured(60), aeo: measured(60) });
    expect(diffScans(base, head).compositeDelta).toBe(10);
  });
});

describe("diffScans — degenerate inputs", () => {
  it("refuses two scans sharing no measured module", () => {
    const base = scan({ ig: measured(50), gbp: unavailable });
    const head = scan({ ig: unavailable, gbp: measured(50) });
    expect(diffScans(base, head).incomparableReason).toBe("NO_SHARED_MEASURED_MODULE");
  });

  it("treats a measured module with a null score as not measured", () => {
    // normalizeModuleResults forces score to null whenever the provider was not
    // measured; a status of "measured" alone is not enough to trust the number.
    const base = scan({ ig: { status: "measured", score: null, findingKeys: [] }, gbp: measured(60), aeo: measured(50) });
    const head = scan({ ig: measured(70), gbp: measured(60), aeo: measured(50) });
    expect(diffScans(base, head).intersectionModules).toEqual(["gbp", "aeo"]);
    expect(diffScans(base, head).gainedCoverage).toEqual(["ig"]);
  });

  it("is stable when nothing changed at all", () => {
    const same = () => scan({ ig: measured(70, ["ig.bio_cta"]), gbp: measured(60), aeo: measured(55) });
    const diff = diffScans(same(), same());
    expect(diff.compositeDelta).toBe(0);
    expect(diff.resolvedFindings).toEqual([]);
    expect(diff.regressedFindings).toEqual([]);
    expect(diff.decayedFindings).toEqual([]);
    expect(diff.lostCoverage).toEqual([]);
    expect(diff.gainedCoverage).toEqual([]);
  });
});
