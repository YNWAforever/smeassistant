import { describe, expect, it } from "vitest";
import { SNAPSHOT_ID, base, diff, incomparableDiff, overview, snapshot } from "./__fixtures__";
import { buildEvidenceRefs, compositeValue, formatMetricValue, metricChange, pickRefs } from "./evidence";

describe("buildEvidenceRefs", () => {
  it("cites every measured metric with ev_<snapshotId>_<metricKey>, the job id and Observed", () => {
    const refs = buildEvidenceRefs({ snapshot, diff, base, locationName: "Yik Yam", locale: "en" });
    const rate = refs.find((r) => r.evidenceId === `ev_${SNAPSHOT_ID}_gbp.response_rate_pct`);
    expect(rate).toEqual({
      evidenceId: `ev_${SNAPSHOT_ID}_gbp.response_rate_pct`,
      scanId: "job-head",
      factType: "Observed",
      label: "Owner response rate",
      value: "18%",
      observedAt: "2026-08-25T01:42:00Z",
      source: "Google Business · Yik Yam",
    });
    expect(refs.map((r) => r.evidenceId)).toEqual([
      `ev_${SNAPSHOT_ID}_score`,
      `ev_${SNAPSHOT_ID}_coverage`,
      `ev_${SNAPSHOT_ID}_gbp.rating`,
      `ev_${SNAPSHOT_ID}_gbp.reviews_count`,
      `ev_${SNAPSHOT_ID}_gbp.unanswered_sampled`,
      `ev_${SNAPSHOT_ID}_gbp.response_rate_pct`,
      `ev_${SNAPSHOT_ID}_gbp.hours_complete`,
      `ev_${SNAPSHOT_ID}_ig.days_since_last_post`,
      `ev_${SNAPSHOT_ID}_aeo.ai_citation_count`,
      `ev_${SNAPSHOT_ID}_composite`,
    ]);
    expect(refs.every((r) => r.scanId === "job-head" && r.observedAt === snapshot.observedAt)).toBe(true);
    expect(refs[0]).toMatchObject({ value: "62/100", factType: "Observed", source: "SME Scanner · Yik Yam" });
    expect(refs[1]).toMatchObject({ value: "78%" });
    expect(refs.at(-1)).toMatchObject({ factType: "Observed", value: "66 → 62 (-4)", label: "Composite score change" });
  });

  it("labels in the requested locale and names modules per locale", () => {
    const refs = buildEvidenceRefs({ snapshot, locationName: "奕蔭街", locale: "zh-HK" });
    expect(refs.find((r) => r.evidenceId.endsWith("gbp.rating"))).toMatchObject({ label: "Google 評分", value: "4.3", source: "Google 商戶 · 奕蔭街" });
    expect(refs.find((r) => r.evidenceId.endsWith("gbp.hours_complete"))).toMatchObject({ value: "是" });
    expect(refs.find((r) => r.evidenceId.endsWith("composite"))).toBeUndefined();
  });

  it("marks the composite Unknown when the pair is not comparable or the delta is withheld", () => {
    const notComparable = buildEvidenceRefs({ snapshot, diff: incomparableDiff, locationName: "Yik Yam", locale: "en" }).at(-1);
    expect(notComparable).toMatchObject({ factType: "Unknown", value: "not comparable · SCORING_VERSION_MISMATCH" });
    const withheld = compositeValue({ ...diff, composite_withheld_reason: "INSUFFICIENT_INDEPENDENT_CHANNELS" }, "en");
    expect(withheld).toBe("withheld · INSUFFICIENT_INDEPENDENT_CHANNELS");
    expect(buildEvidenceRefs({ snapshot: { ...snapshot, overallScore: null }, locationName: "x", locale: "en" })[0]).toMatchObject({ factType: "Unknown", value: "withheld" });
  });

  it("appends the focused action's own evidence line", () => {
    const refs = buildEvidenceRefs({ snapshot, action: overview(), locationName: "Yik Yam", locale: "en" });
    expect(refs.at(-1)).toMatchObject({ evidenceId: `ev_${SNAPSHOT_ID}_action_${overview().id}`, scanId: "job-head", factType: "Observed", value: "18% · 7 unanswered", label: "Reply to unanswered Google reviews" });
    expect(pickRefs(refs, SNAPSHOT_ID, ["score", "nope"]).map((r) => r.evidenceId)).toEqual([`ev_${SNAPSHOT_ID}_score`]);
  });
});

describe("metricChange", () => {
  it("is Observed only when comparable and the module is in the intersection", () => {
    expect(metricChange("gbp.response_rate_pct", snapshot, base, diff)).toEqual({ key: "gbp.response_rate_pct", before: 31, after: 18, delta: -13, factType: "Observed" });
    expect(metricChange("gbp.response_rate_pct", snapshot, base, incomparableDiff)).toMatchObject({ before: 31, after: 18, delta: null, factType: "Unknown" });
    expect(metricChange("gbp.response_rate_pct", snapshot, base, { ...diff, intersection_modules: ["ig"] })).toMatchObject({ delta: null, factType: "Unknown" });
    expect(metricChange("gbp.hours_complete", snapshot, base, diff)).toMatchObject({ before: null, delta: null, factType: "Unknown" });
    expect(metricChange("ig.followers", snapshot, base, diff)).toBeNull();
  });

  it("formats rates, ratings, flags and counts", () => {
    expect(formatMetricValue("aeo.ai_overview_presence_rate", 0.5, "en")).toBe("50%");
    expect(formatMetricValue("gbp.rating", 4, "en")).toBe("4.0");
    expect(formatMetricValue("website.has_faq_schema", 0, "en")).toBe("no");
    expect(formatMetricValue("gbp.reviews_count", 127.6, "en")).toBe("128");
  });
});
