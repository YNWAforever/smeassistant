import { describe, expect, it } from "vitest";
import type { PrototypeLocale } from "@/lib/copy";
import { ACTION_ID, LOCATION_ID, SNAPSHOT_ID, actionRow, base, diff, incomparableDiff, overview, snapshot, socialRow } from "./__fixtures__";
import type { SignalRows } from "./signals";
import { buildEvidenceRefs } from "./evidence";
import { TEMPLATE_INTENTS, fallbackIntentFor, templateAnswer, type TemplateAnswer, type TemplateContext } from "./templates";

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
    // The two P4.3 intents need no snapshot; they have their own case below.
    for (const intent of TEMPLATE_INTENTS.filter((i) => i !== "explain_missing_inputs" && i !== "where_to_continue")) {
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

describe("contextual answers (P4.3)", () => {
  type Actor = NonNullable<TemplateContext["actor"]>;
  const owner: Actor = { role: "owner", locationScope: null };
  const manager: Actor = { role: "manager", locationScope: null };
  const outOfScope: Actor = { role: "manager", locationScope: ["99999999-9999-4999-8999-999999999999"] };
  const viewer: Actor = { role: "viewer", locationScope: null };
  const needy = overview({ ...socialRow, action_state: "needs_input", required_inputs: ["asset_or_text_only", "alt_text"], provided_inputs: {} });
  const ready = overview(actionRow);
  const V2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
  const V3 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
  const waiting = (id: string, actionId: string, versionNo: number, createdAt: string, approvalState: "draft" | "changes_requested" = "draft") =>
    ({ id, actionId, versionNo, approvalState, createdAt, locationId: LOCATION_ID });
  const signals = (over: Partial<SignalRows> = {}): SignalRows => ({ actions: [ready, needy], waitingVersions: [], google: "active", ...over });
  const withoutNextStep = (answer: TemplateAnswer): TemplateAnswer => {
    const rest = { ...answer };
    delete rest.nextStep;
    return rest;
  };

  const LABELS: Record<PrototypeLocale, [string, string]> = {
    en: ["Approved asset or text only", "Alt text"],
    "zh-HK": ["已批准素材或純文字", "替代文字"],
    "zh-TW": ["已批准素材或純文字", "替代文字"],
  };
  it.each(["en", "zh-HK", "zh-TW"] as PrototypeLocale[])("lists missing inputs by label in %s and links to the form", (locale) => {
    const answer = templateAnswer("explain_missing_inputs", context({ action: needy, actor: owner }, locale));
    for (const label of LABELS[locale]) expect(answer.answer).toContain(label);
    expect(answer.answer).not.toContain("asset_or_text_only");
    expect(answer.answer).toContain(needy.title[locale]);
    expect(answer.answer).not.toMatch(/\{\w+\}/);
    expect(answer.nextStep).toEqual({ kind: "provide_inputs", actionId: needy.id });
    expect(answer.evidenceRefs.map((r) => r.evidenceId)).toContain(`ev_${SNAPSHOT_ID}_score`);
    if (locale === "en") expect(answer.answer).toContain("nothing is guessed");
    else expect(answer.answer).toContain("不會作任何推測");
  });

  it("uses the first signal action that needs input when no action is in context", () => {
    const answer = templateAnswer("explain_missing_inputs", context({ action: null, signals: signals() }));
    expect(answer.answer).toContain("Fill the Instagram gap");
    expect(answer.nextStep).toEqual({ kind: "provide_inputs", actionId: needy.id });
  });

  it("falls back to the raw key under zh-TW when an input has no label", () => {
    const odd = overview({ ...socialRow, action_state: "needs_input", required_inputs: ["made_up_key"], provided_inputs: {} });
    const answer = templateAnswer("explain_missing_inputs", context({ action: odd, actor: owner }, "zh-TW"));
    expect(answer.answer).toContain("made_up_key");
    expect(answer.answer).toMatch(/[一-鿿]/);
  });

  it("says nothing is missing when the action is ready", () => {
    const answer = templateAnswer("explain_missing_inputs", context({ action: ready, actor: owner }));
    expect(answer.answer).toContain("nothing is missing");
    expect(answer.nextStep).toEqual({ kind: "open_action", actionId: ready.id });
    const none = templateAnswer("explain_missing_inputs", context({ action: null, signals: signals({ actions: [ready] }) }));
    expect(none.answer).toContain("No open action for Yik Yam is waiting for details");
    expect(none.nextStep).toEqual({ kind: "open_actions" });
  });

  it("answers without a snapshot", () => {
    const noScan = { snapshot: null, base: null, diff: null };
    const missing = templateAnswer("explain_missing_inputs", context({ ...noScan, action: needy }));
    expect(missing.answer).not.toContain("There is no finished scan");
    expect(missing.answer).toContain("Approved asset or text only");
    expect(missing.evidenceRefs).toEqual([]);
    expect(missing.nextStep).toEqual({ kind: "provide_inputs", actionId: needy.id });
    const where = templateAnswer("where_to_continue", context({ ...noScan, action: null, signals: signals({ waitingVersions: [waiting(V2, ready.id, 2, "2026-09-01T00:00:00Z")] }) }));
    expect(where.answer).not.toContain("There is no finished scan");
    expect(where.nextStep).toEqual({ kind: "review_version", actionId: ready.id, versionId: V2 });
  });

  it("names the focused waiting version", () => {
    const rows = signals({ waitingVersions: [waiting(V3, needy.id, 1, "2026-08-01T00:00:00Z"), waiting(V2, ready.id, 2, "2026-09-01T00:00:00Z", "changes_requested")] });
    const answer = templateAnswer("where_to_continue", context({ actor: owner, signals: rows, focusedVersionId: V2 }));
    expect(answer.answer).toContain("v2");
    expect(answer.answer).toContain("Reply to unanswered Google reviews");
    expect(answer.answer).toContain("Changes requested");
    expect(answer.answer).toContain("must approve this exact version");
    expect(answer.answer).toContain("this version has not been approved or sent");
    expect(answer.nextStep).toEqual({ kind: "review_version", actionId: ready.id, versionId: V2 });
    const zh = templateAnswer("where_to_continue", context({ actor: owner, signals: rows, focusedVersionId: V2 }, "zh-HK"));
    expect(zh.answer).toContain("v2");
    expect(zh.answer).toContain("要求修改");
  });

  it("answers truthfully when the focused version was approved meanwhile", () => {
    // V2 was approved after the suggestion was built: it is no longer waiting.
    const rows = signals({ google: "revoked", waitingVersions: [waiting(V3, needy.id, 1, "2026-08-01T00:00:00Z")] });
    const answer = templateAnswer("where_to_continue", context({ actor: owner, signals: rows, focusedVersionId: V2 }));
    expect(answer.answer).not.toContain("v2");
    expect(answer.answer).toContain("v1");
    expect(answer.answer).toContain("Fill the Instagram gap");
    expect(answer.nextStep).toEqual({ kind: "review_version", actionId: needy.id, versionId: V3 });
    const empty = templateAnswer("where_to_continue", context({ actor: owner, signals: signals({ google: "revoked" }), focusedVersionId: V2 }));
    expect(empty.answer).toContain("Nothing is waiting for review now");
    expect(empty.nextStep).toEqual({ kind: "open_actions" });
  });

  it("counts the waiting versions in scope and names the oldest", () => {
    const rows = signals({ waitingVersions: [waiting(V2, ready.id, 2, "2026-09-01T00:00:00Z"), waiting(V3, needy.id, 1, "2026-08-01T00:00:00Z")] });
    const answer = templateAnswer("where_to_continue", context({ actor: manager, signals: rows }));
    expect(answer.answer).toContain("2 versions are waiting for review");
    expect(answer.answer).toContain("v1 of “Fill the Instagram gap”");
    expect(answer.nextStep).toEqual({ kind: "review_version", actionId: needy.id, versionId: V3 });
    const hidden = templateAnswer("where_to_continue", context({ actor: outOfScope, signals: rows }));
    expect(hidden.answer).toContain("Nothing is waiting for review now");
    expect(hidden.answer).not.toContain("v1");
  });

  it("says nothing is waiting when the queue is empty", () => {
    const answer = templateAnswer("where_to_continue", context({ actor: owner, signals: signals() }));
    expect(answer.answer).toContain("Nothing is waiting for review now");
    expect(answer.nextStep).toEqual({ kind: "open_actions" });
    expect(answer.warnings.join(" ")).toMatch(/approved, sent or published/);
  });

  it("explains a broken Google connection to owners", () => {
    for (const locale of LOCALES) {
      const answer = templateAnswer("where_to_continue", context({ actor: owner, signals: signals({ google: "revoked", waitingVersions: [waiting(V2, ready.id, 2, "2026-09-01T00:00:00Z")] }) }, locale));
      expect(answer.nextStep).toEqual({ kind: "open_integrations" });
      expect(answer.answer).not.toMatch(/\{\w+\}/);
      if (locale === "en") expect(answer.answer).toContain("is revoked");
      if (locale === "zh-TW") expect(answer.answer).toContain("連線");
    }
  });

  it("says there is no Google connection when none exists, in every locale (T3-d)", () => {
    const expected: Record<PrototypeLocale, string> = {
      en: "There is no Google Business connection.",
      "zh-HK": "目前沒有 Google 商戶 的連接。",
      "zh-TW": "目前沒有 Google 商家 的連線。",
    };
    for (const locale of LOCALES) {
      const answer = templateAnswer("where_to_continue", context({ actor: owner, signals: signals({ google: null }) }, locale));
      expect(answer.answer, locale).toContain(expected[locale]);
      expect(answer.answer, locale).not.toMatch(/\{\w+\}/);
      expect(answer.nextStep).toEqual({ kind: "open_integrations" });
    }
    const en = templateAnswer("where_to_continue", context({ actor: owner, signals: signals({ google: null }) })).answer;
    expect(en).not.toContain("is not connected");
    expect(en).toContain("Google evidence and the");
  });

  it("says “20 or more” when the waiting-version read hits its 20-row cap (Minor 1)", () => {
    const rows = (count: number) =>
      Array.from({ length: count }, (_, i) =>
        waiting(`aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`, ready.id, i + 1, `2026-09-${String(i + 1).padStart(2, "0")}T00:00:00Z`),
      );
    const capped: Record<PrototypeLocale, string> = {
      en: "20 or more versions are waiting for review. The oldest is v1",
      "zh-HK": "有 20 個或以上版本等待審閱，最早的是",
      "zh-TW": "有 20 個或以上版本等待審閱，最早的是",
    };
    for (const locale of LOCALES) {
      const answer = templateAnswer("where_to_continue", context({ actor: owner, signals: signals({ waitingVersions: rows(20) }) }, locale));
      expect(answer.answer, locale).toContain(capped[locale]);
      expect(answer.answer, locale).not.toMatch(/\{\w+\}/);
      expect(answer.nextStep).toEqual({ kind: "review_version", actionId: ready.id, versionId: "aaaaaaaa-aaaa-4aaa-8aaa-000000000000" });
    }
    // Below the cap the count is exact.
    const under = templateAnswer("where_to_continue", context({ actor: owner, signals: signals({ waitingVersions: rows(19) }) }));
    expect(under.answer).toContain("19 versions are waiting for review.");
    expect(under.answer).not.toContain("or more");
    // At the cap with rows hidden by scope, the visible count is a floor too.
    const L2 = "99999999-9999-4999-8999-999999999999";
    const mixed = rows(20).map((row, i) => (i < 5 ? row : { ...row, locationId: L2 }));
    const scoped = templateAnswer("where_to_continue", context({ actor: { role: "manager", locationScope: [LOCATION_ID] }, signals: signals({ waitingVersions: mixed }) }));
    expect(scoped.answer).toContain("5 or more versions are waiting for review.");
  });

  it("never offers Google to a manager", () => {
    const rows = signals({ google: "expired", waitingVersions: [waiting(V2, ready.id, 2, "2026-09-01T00:00:00Z")] });
    const answer = templateAnswer("where_to_continue", context({ actor: manager, signals: rows }));
    expect(answer.nextStep).toEqual({ kind: "review_version", actionId: ready.id, versionId: V2 });
    expect(answer.answer).not.toContain("expired");
    const empty = templateAnswer("where_to_continue", context({ actor: manager, signals: signals({ google: "expired" }) }));
    expect(empty.nextStep).toEqual({ kind: "open_actions" });
  });

  it("tells viewers to ask an owner or manager, with no nextStep", () => {
    const rows = signals({ google: "revoked", waitingVersions: [waiting(V2, ready.id, 2, "2026-09-01T00:00:00Z")] });
    const cases = [
      templateAnswer("explain_missing_inputs", context({ action: needy, actor: viewer })),
      templateAnswer("explain_missing_inputs", context({ action: ready, actor: viewer })),
      templateAnswer("explain_missing_inputs", context({ action: null, actor: viewer, signals: signals({ actions: [ready] }) })),
      templateAnswer("where_to_continue", context({ actor: viewer, signals: rows, focusedVersionId: V2 })),
      templateAnswer("where_to_continue", context({ actor: viewer, signals: rows })),
      templateAnswer("where_to_continue", context({ actor: viewer, signals: signals() })),
      templateAnswer("explain_missing_inputs", context({ action: needy, actor: outOfScope })),
    ];
    for (const answer of cases) {
      expect(answer.nextStep).toBeUndefined();
      expect(answer.nextAction).toMatch(/^Ask an owner or manager to /);
    }
    expect(cases[3].answer).toContain("v2");
    expect(cases[4].answer).not.toContain("revoked");
    const zh = templateAnswer("explain_missing_inputs", context({ action: needy, actor: viewer }, "zh-HK"));
    expect(zh.nextAction).toContain("店主或經理");
    // zh-TW keeps 店主或經理, as the existing zh-TW workspace copy does (lib/copy-workspace.ts offers viewer body).
    for (const answer of [
      templateAnswer("explain_missing_inputs", context({ action: needy, actor: viewer }, "zh-TW")),
      templateAnswer("explain_missing_inputs", context({ action: ready, actor: viewer }, "zh-TW")),
      templateAnswer("where_to_continue", context({ actor: viewer, signals: rows }, "zh-TW")),
      templateAnswer("where_to_continue", context({ actor: viewer, signals: signals() }, "zh-TW")),
    ]) {
      expect(answer.nextAction).toMatch(/^請店主或經理/);
      expect(answer.nextAction).not.toContain("店家");
    }
  });

  it("never claims that nothing at all was approved or sent, in any locale", () => {
    // Approving and exporting v1, then editing it, leaves a draft v2: a broad
    // "nothing has been approved or sent" would be false. Only the named version's state is claimed.
    const two = [waiting(V2, ready.id, 2, "2026-09-01T00:00:00Z"), waiting(V3, needy.id, 1, "2026-08-01T00:00:00Z")];
    for (const locale of LOCALES) {
      const answers = [
        templateAnswer("where_to_continue", context({ actor: owner, signals: signals({ waitingVersions: two }), focusedVersionId: V2 }, locale)),
        templateAnswer("where_to_continue", context({ actor: owner, signals: signals({ waitingVersions: two }) }, locale)),
        templateAnswer("where_to_continue", context({ actor: owner, signals: signals({ waitingVersions: [two[0]] }) }, locale)),
        templateAnswer("where_to_continue", context({ actor: owner, signals: signals() }, locale)),
        templateAnswer("where_to_continue", context({ actor: owner, signals: signals({ google: "revoked" }) }, locale)),
        templateAnswer("where_to_continue", context({ actor: viewer, signals: signals({ waitingVersions: two }), focusedVersionId: V2 }, locale)),
        templateAnswer("explain_missing_inputs", context({ action: needy, actor: owner }, locale)),
        templateAnswer("explain_missing_inputs", context({ action: ready, actor: owner }, locale)),
      ];
      for (const answer of answers) {
        const text = `${answer.answer} ${answer.nextAction}`;
        expect(text, locale).not.toMatch(/nothing has been approved or sent/i);
        expect(text, locale).not.toContain("未有任何內容獲核准或送出");
        expect(text, locale).not.toContain("未有任何內容");
      }
    }
    const zhTw = templateAnswer("where_to_continue", context({ actor: owner, signals: signals({ waitingVersions: two }), focusedVersionId: V2 }, "zh-TW"));
    expect(zhTw.answer).toContain("此版本尚未核准或送出");
    const zhHk = templateAnswer("where_to_continue", context({ actor: owner, signals: signals({ waitingVersions: two }), focusedVersionId: V2 }, "zh-HK"));
    expect(zhHk.answer).toContain("此版本尚未獲核准或送出");
  });

  it("names a focused waiting version outside a scoped manager's locations, read-only (R4)", () => {
    const L2 = "99999999-9999-4999-8999-999999999999";
    const scoped: Actor = { role: "manager", locationScope: [L2] };
    const rows = signals({ waitingVersions: [waiting(V2, ready.id, 2, "2026-09-01T00:00:00Z"), { ...waiting(V3, needy.id, 1, "2026-08-01T00:00:00Z"), locationId: L2 }] });
    const answer = templateAnswer("where_to_continue", context({ actor: scoped, signals: rows, focusedVersionId: V2 }));
    expect(answer.answer).toContain("v2 of “Reply to unanswered Google reviews”");
    expect(answer.nextStep).toBeUndefined();
    expect(answer.nextAction).toBe("Ask an owner or manager to review v2.");
    // Unfocused, the list stays scope-filtered: only the in-scope v1 is counted.
    const unfocused = templateAnswer("where_to_continue", context({ actor: scoped, signals: rows }));
    expect(unfocused.answer).toContain("1 version is waiting for review: v1");
    expect(unfocused.nextStep).toEqual({ kind: "review_version", actionId: needy.id, versionId: V3 });
    // A focused out-of-scope action is answered read-only too.
    const action = templateAnswer("explain_missing_inputs", context({ action: needy, actor: outOfScope }));
    expect(action.answer).toContain("Approved asset or text only");
    expect(action.nextStep).toBeUndefined();
  });

  it("does not name the location when out-of-scope rows were hidden (R5)", () => {
    const L2 = "99999999-9999-4999-8999-999999999999";
    const scoped: Actor = { role: "manager", locationScope: [L2] };
    const rows = signals({ waitingVersions: [waiting(V2, ready.id, 2, "2026-09-01T00:00:00Z")] });
    const expected: Record<PrototypeLocale, [string, string]> = {
      en: ["Nothing is waiting for review now in your locations", "No open action in your locations is waiting for details"],
      "zh-HK": ["你負責的地點目前沒有等待審閱的項目", "你負責的地點目前沒有等待補充資料的未完成行動"],
      "zh-TW": ["你負責的據點目前沒有等待審閱的項目", "你負責的據點目前沒有等待補充資料的未完成行動"],
    };
    for (const locale of LOCALES) {
      const where = templateAnswer("where_to_continue", context({ actor: scoped, signals: rows }, locale));
      expect(where.answer).toContain(expected[locale][0]);
      expect(where.answer).not.toContain("Yik Yam");
      expect(where.nextStep).toEqual({ kind: "open_actions" });
      const missing = templateAnswer("explain_missing_inputs", context({ action: null, actor: scoped, signals: signals() }, locale));
      expect(missing.answer).toContain(expected[locale][1]);
      expect(missing.answer).not.toContain("Yik Yam");
    }
    // Nothing hidden: the location is named as before.
    expect(templateAnswer("where_to_continue", context({ actor: scoped, signals: signals() })).answer).toContain("Nothing is waiting for review now at Yik Yam");
    expect(templateAnswer("explain_missing_inputs", context({ action: null, actor: scoped, signals: signals({ actions: [ready] }) })).answer).toContain("No open action for Yik Yam");
  });

  it("lists a focused action's missing inputs whatever its state (R6)", () => {
    const working = overview({ ...socialRow, action_state: "in_progress", required_inputs: ["asset_or_text_only", "alt_text"], provided_inputs: {} });
    const answer = templateAnswer("explain_missing_inputs", context({ action: working, actor: owner }));
    expect(answer.answer).toContain("Approved asset or text only, Alt text");
    expect(answer.nextStep).toEqual({ kind: "provide_inputs", actionId: working.id });
    // Unfocused, the needs_input gate still applies: an in_progress action is not picked.
    const fallback = templateAnswer("explain_missing_inputs", context({ action: null, actor: owner, signals: signals({ actions: [ready, working] }) }));
    expect(fallback.answer).toContain("No open action for Yik Yam is waiting for details");
  });

  it("lists a focused offer action's inputs except offer_id, but never picks an offer unfocused (R6a)", () => {
    const offer = overview({ ...socialRow, template_key: "offer-instagram-post", action_state: "needs_input", required_inputs: ["offer_id", "brand_voice"], provided_inputs: {} });
    expect(offer.missingInputs).toEqual(["offer_id", "brand_voice"]);
    const answer = templateAnswer("explain_missing_inputs", context({ action: offer, actor: owner }));
    expect(answer.answer).toContain("still needs: Brand voice.");
    expect(answer.answer).not.toContain("Confirmed offer");
    expect(answer.answer).not.toContain("offer_id");
    expect(answer.answer).not.toContain("nothing is missing");
    expect(answer.nextStep).toEqual({ kind: "provide_inputs", actionId: offer.id });
    // The unfocused fallback (like signals.ts) still skips offer actions.
    const fallback = templateAnswer("explain_missing_inputs", context({ action: null, actor: owner, signals: signals({ actions: [ready, offer] }) }));
    expect(fallback.answer).toContain("No open action for Yik Yam is waiting for details");
    expect(fallback.nextStep).toEqual({ kind: "open_actions" });
  });

  it("adds nextStep to explain_priority and explain_change without changing their text", () => {
    for (const locale of LOCALES) {
      const plain = context({}, locale);
      const contextual = context({ actor: owner, signals: signals({ google: "revoked" }), focusedVersionId: V2 }, locale);
      const priority = templateAnswer("explain_priority", contextual);
      expect(priority.nextStep).toEqual({ kind: "open_action", actionId: ACTION_ID });
      expect(withoutNextStep(priority)).toEqual(withoutNextStep(templateAnswer("explain_priority", plain)));
      const change = templateAnswer("explain_change", contextual);
      expect(change.nextStep).toEqual({ kind: "open_actions" });
      expect(withoutNextStep(change)).toEqual(withoutNextStep(templateAnswer("explain_change", plain)));
    }
    expect(templateAnswer("explain_priority", context({ action: overview(socialRow) })).nextStep).toEqual({ kind: "open_action", actionId: socialRow.id });
  });
});
