import {describe,it,expect} from "vitest";
import {deriveActions,rankActions,type FindingRow} from "./actions";
import type {ScanDiffRow,SnapshotRecord} from "./snapshots";

const snapshot: SnapshotRecord = {
  id: "snap-1", jobId: "job-1", workspaceId: "ws-1", locationId: "loc-1", market: "hk", observedAt: "2026-09-01T00:00:00Z", scoringVersion: "2026-08-16",
  overallScore: 62, coverage: 0.78,
  moduleStates: {
    google_business: { status: "measured", confidence: "high", limitationCode: null, score: 71 },
    instagram: { status: "unavailable", confidence: "none", limitationCode: "IG_HANDLE_NOT_PROVIDED", score: null },
    search_ai: { status: "measured", confidence: "medium", limitationCode: null, score: 40 },
    website: { status: "measured", confidence: "high", limitationCode: null, score: null },
  },
  metrics: {}, websiteChecks: { evaluated: 15, passed: 9, results: [{ key: "faq_schema", pass: false }] }, comparableTo: null, diffId: null, createdAt: "2026-09-01T00:00:00Z",
};

const findings: FindingRow[] = [
  { finding_key: "gbp.owner_response_low", module: "gbp", severity: "critical", score_impact: -15, owner_message_zh: "zh1", owner_message_en: "Low response rate", evidence: { rate: 18 } },
  { finding_key: "gbp.rating_low", module: "gbp", severity: "warning", score_impact: -6, owner_message_zh: "zh2", owner_message_en: "Rating low", evidence: { rating: 3.9 } },
  { finding_key: "trust.review_volume", module: "trust", severity: "info", score_impact: 0, owner_message_zh: "zh3", owner_message_en: "Good volume", evidence: {} },
  { finding_key: "trust.cross_signal", module: "trust", severity: "warning", score_impact: -4, owner_message_zh: "x", owner_message_en: "x", evidence: {} },
  { finding_key: "ig.content_consistency", module: "ig", severity: "warning", score_impact: -8, owner_message_zh: "zh4", owner_message_en: "Gap", evidence: { days: 16 } },
];

const baseInput = { snapshot, findings, latestDiff: null, brandProfileExists: true, googleConnection: { status: "active" }, industry: "fnb", existingDrafts: new Set<never>(), now: new Date("2026-09-03T00:00:00Z") };

const diffRow = (over: Partial<ScanDiffRow>): ScanDiffRow => ({
  id: "d", base_job_id: "b", head_job_id: "job-1", comparable: true, incomparable_reason: null, composite_withheld_reason: null, intersection_modules: ["gbp"],
  composite_base: 66, composite_head: 62, composite_delta: -4, resolved_findings: [], regressed_findings: [], decayed_findings: [], lost_coverage: [], gained_coverage: [],
  created_at: "2026-09-01T00:00:00Z", ...over,
});

describe("deriveActions", () => {
  it("groups negative-impact findings per template, ignores zero-impact and ledger keys, adds the website FAQ trigger", () => {
    const derived = deriveActions(baseInput);
    const keys = derived.map((a) => a.templateKey);
    expect(keys).toContain("review-response");
    expect(keys).toContain("social-post");
    expect(keys).toContain("visibility-content");
    expect(keys).not.toContain("google-reconnect");
    const review = derived.find((a) => a.templateKey === "review-response")!;
    expect(review.sourceFindingKeys).toEqual(["gbp.owner_response_low", "gbp.rating_low"]);
    expect(review.evidence.value).toBe("18");
    expect(review.evidence.freshness.en).toBe("Updated 2 days ago");
    expect(review.dedupeKey).toBe("ws-1:loc-1:review-response");
    expect(derived.some((a) => a.sourceFindingKeys.includes("trust.review_volume") || a.sourceFindingKeys.includes("trust.cross_signal"))).toBe(false);
    expect(derived.find((a) => a.templateKey === "visibility-content")!.sourceFindingKeys).toEqual(["website.checks.faq_schema"]);
  });

  it("adds google-reconnect when the connection is missing or expired and ranks deterministically", () => {
    expect(deriveActions({ ...baseInput, googleConnection: null }).map((a) => a.templateKey)).toContain("google-reconnect");
    const expired = deriveActions({ ...baseInput, googleConnection: { status: "expired" } });
    expect(expired.find((a) => a.templateKey === "google-reconnect")!.capability).toBe("Requires connection");
    const a = deriveActions(baseInput).map((x) => [x.templateKey, x.priorityScore]);
    const b = deriveActions(baseInput).map((x) => [x.templateKey, x.priorityScore]);
    expect(a).toEqual(b);
    const ranked = rankActions(deriveActions(baseInput));
    for (let i = 1; i < ranked.length; i += 1) expect(ranked[i - 1].priorityScore).toBeGreaterThanOrEqual(ranked[i].priorityScore);
  });

  it("marks regressed findings urgent via the comparable diff", () => {
    const withDiff = deriveActions({ ...baseInput, latestDiff: diffRow({ regressed_findings: ["gbp.owner_response_low"] }) }).find((a) => a.templateKey === "review-response")!;
    expect(withDiff.priorityFactors.find((f) => f.key === "urgency")!.points).toBe(15);
  });

  it("does not ask the owner for reviews the scan already collected", () => {
    const resolved = deriveActions({ ...baseInput, resolvedInputs: new Set(["reviews_without_response"]) }).find((a) => a.templateKey === "review-response")!;
    expect(resolved.requiredInputs).not.toContain("reviews_without_response");
    // Readiness follows the same list, so priority and the input form agree.
    expect(resolved.priorityFactors.find((f) => f.key === "readiness")!.points).toBe(resolved.requiredInputs.length ? 0 : 10);
  });

  it("keeps the ask when the scan retained no unanswered review", () => {
    const unresolved = deriveActions({ ...baseInput, resolvedInputs: new Set<string>() }).find((a) => a.templateKey === "review-response")!;
    expect(unresolved.requiredInputs).toContain("reviews_without_response");
    expect(unresolved.priorityFactors.find((f) => f.key === "readiness")!.points).toBe(0);
  });

  it("reproduces today's inputs and scores exactly when no evidence is resolved", () => {
    const withArgument = deriveActions({ ...baseInput, resolvedInputs: new Set<string>() });
    const without = deriveActions(baseInput);
    expect(without.map((a) => [a.templateKey, a.requiredInputs, a.priorityScore])).toEqual(
      withArgument.map((a) => [a.templateKey, a.requiredInputs, a.priorityScore]),
    );
  });
});
