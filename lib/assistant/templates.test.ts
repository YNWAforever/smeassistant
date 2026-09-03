import { describe, expect, it } from "vitest";
import type { PrototypeLocale } from "@/lib/copy";
import { SNAPSHOT_ID, actionRow, base, diff, incomparableDiff, overview, snapshot, socialRow } from "./__fixtures__";
import { buildEvidenceRefs } from "./evidence";
import { TEMPLATE_INTENTS, fallbackIntentFor, templateAnswer, type TemplateContext } from "./templates";

const LOCALES: PrototypeLocale[] = ["zh-HK", "zh-TW", "en"];

function context(over: Partial<TemplateContext> = {}, locale: PrototypeLocale = "en"): TemplateContext {
  const actions = [overview(actionRow), overview(socialRow)];
  const ctx: TemplateContext = { locale, timezone: "Asia/Hong_Kong", locationName: "Yik Yam", snapshot, base, diff, actions, action: actions[0], evidenceRefs: [], ...over };
  ctx.evidenceRefs = over.evidenceRefs ?? (ctx.snapshot ? buildEvidenceRefs({ snapshot: ctx.snapshot, diff: ctx.diff, base: ctx.base, action: ctx.action, locationName: ctx.locationName, locale }) : []);
  return ctx;
}

describe("templateAnswer", () => {
  it("answers every template intent in every locale with real evidence ids", () => {
    for (const locale of LOCALES) {
      for (const intent of TEMPLATE_INTENTS) {
        const answer = templateAnswer(intent, context({}, locale));
        expect(answer.answer.length, `${intent}/${locale}`).toBeGreaterThan(20);
        expect(answer.nextAction.length, `${intent}/${locale}`).toBeGreaterThan(5);
        expect(answer.answer, `${intent}/${locale} has an unfilled placeholder`).not.toMatch(/\{\w+\}/);
        expect(answer.evidenceRefs.length, `${intent}/${locale}`).toBeGreaterThan(0);
        for (const ref of answer.evidenceRefs) expect(ref.evidenceId).toMatch(new RegExp(`^ev_${SNAPSHOT_ID}_`));
        if (locale !== "en") expect(answer.answer).toMatch(/[一-鿿]/);
      }
    }
  });

  it("explains the priority from the action's own factors and evidence", () => {
    const answer = templateAnswer("explain_priority", context());
    expect(answer.answer).toContain("“Reply to unanswered Google reviews” is the top priority (High)");
    expect(answer.answer).toContain("Severity +30, Readiness +20, Urgency +12");
    expect(answer.answer).toContain("18% · 7 unanswered");
    expect(answer.answer).toContain("the required inputs are ready");
    expect(answer.evidenceRefs.map((r) => r.evidenceId)).toContain(`ev_${SNAPSHOT_ID}_action_${actionRow.id}`);
    expect(answer.warnings).toHaveLength(1);
    const zh = templateAnswer("explain_priority", context({}, "zh-HK"));
    expect(zh.answer).toContain("「回覆未回覆的 Google 評論」是首要行動（高）");
  });

  it("explains a comparable change in points, with the ledger and observed metric moves", () => {
    const answer = templateAnswer("explain_change", context());
    expect(answer.answer).toContain("from 66 to 62 (-4 points — points, not percent)");
    expect(answer.answer).toContain("1 findings resolved, 1 regressed, 0 decayed");
    expect(answer.answer).toContain("Owner response rate: 31% → 18%");
    expect(answer.answer).not.toContain("Opening hours complete");
    expect(answer.evidenceRefs.map((r) => r.evidenceId)).toContain(`ev_${SNAPSHOT_ID}_composite`);
    expect(answer.warnings[0]).toMatch(/not proof/);
  });

  it("is honest when there is no diff, or the pair is not comparable", () => {
    expect(templateAnswer("explain_change", context({ diff: null, base: null })).answer).toContain("no earlier scan to compare with, so the change is Unknown rather than zero");
    expect(templateAnswer("explain_change", context({ diff: incomparableDiff })).answer).toContain("the two scans used different scoring versions");
    expect(templateAnswer("explain_change", context({ diff: { ...diff, composite_withheld_reason: "INSUFFICIENT_INDEPENDENT_CHANNELS" } })).answer).toContain("composite delta is withheld");
    expect(templateAnswer("explain_insights", context({ base: null, diff: null })).answer).toContain("No earlier comparable scan exists yet");
  });

  it("says so when there is no snapshot or no open action instead of inventing numbers", () => {
    for (const intent of TEMPLATE_INTENTS) {
      const answer = templateAnswer(intent, context({ snapshot: null, base: null, diff: null }));
      expect(answer.answer).toContain("There is no finished scan for Yik Yam yet");
      expect(answer.evidenceRefs).toEqual([]);
      expect(answer.answer).not.toMatch(/\d+%/);
    }
    const none = context({ actions: [], action: null });
    expect(templateAnswer("explain_priority", none).answer).toContain("There are no open actions for Yik Yam right now");
    expect(templateAnswer("fallback_plan", none).answer).toContain("no open action for Yik Yam to build a fallback plan from");
    expect(templateAnswer("compare_priorities", none).answer).toContain("no open actions");
    expect(templateAnswer("compare_priorities", context({ actions: [overview(actionRow)] })).answer).toContain("Only one open action exists");
    expect(templateAnswer("explain_priority", context({ actions: [], action: null }, "zh-TW")).answer).toContain("目前沒有未完成的行動");
  });

  it("ranks by factor points and flags missing inputs", () => {
    const answer = templateAnswer("compare_priorities", context({ action: null }));
    expect(answer.answer).toContain("1. “Reply to unanswered Google reviews” — High, 62 pts, top factor Severity +30");
    expect(answer.answer).toContain("2. “Fill the Instagram gap” — Medium, 25 pts, top factor Score impact +25 (waiting for inputs)");
  });

  it("reports limits from module states and coverage", () => {
    const answer = templateAnswer("explain_limits", context());
    expect(answer.answer).toContain("measured 3 of 4 sources (Google Business, Instagram, Search & AI surfaces); not measured: Website (Unsupported)");
    expect(answer.answer).toContain("coverage 78%");
    expect(templateAnswer("explain_limits", context({ snapshot: { ...snapshot, overallScore: null } })).answer).toContain("Score: withheld (fewer than two independent sources measured)");
  });

  it("cites the Instagram gap for assets and the scoring version for rescans", () => {
    expect(templateAnswer("asset_next_step", context()).answer).toContain("Days since last post 16");
    expect(templateAnswer("asset_next_step", context({ snapshot: { ...snapshot, metrics: {} } })).answer).toContain("Instagram was Measured in the latest scan");
    expect(templateAnswer("rescan_validation", context()).answer).toContain("scoring version matches the latest scan (2026.08)");
    expect(templateAnswer("rescan_validation", context({ snapshot: { ...snapshot, scoringVersion: null } })).answer).toContain("(unknown)");
  });

  it("maps draft intents to a template stand-in", () => {
    expect(fallbackIntentFor("draft_review_reply")).toBe("explain_priority");
    expect(fallbackIntentFor("generate_social")).toBe("asset_next_step");
    expect(fallbackIntentFor("generate_faq")).toBe("explain_limits");
    expect(fallbackIntentFor("explain_change")).toBe("explain_change");
  });
});
