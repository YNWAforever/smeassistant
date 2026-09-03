import type { PrototypeLocale } from "@/lib/copy";
import { localized, type LocalizedText } from "@/lib/domain";
import type { DemoQuestionId, EvidenceReference } from "@/lib/pocket-assistant/contracts";
import { formatDay, metricLabel, priorityLabel, stateLabel } from "@/lib/workspace/format";
import type { MetricKey } from "@/lib/workspace/metrics";
import type { ActionOverview } from "@/lib/workspace/overview";
import type { ModuleStateKey, ScanDiffRow, SnapshotRecord } from "@/lib/workspace/snapshots";
import { MODULE_NAMES, formatCoverage, formatMetricValue, formatScore, measuredMetricKeys, metricChange, pickRefs, type ModuleKey } from "./evidence";

/**
 * Deterministic assistant answers (CLAUDE.md §3.8 (a)): the explain/compare
 * intents never call the model. Every number is copied from the snapshot
 * metrics, `scan_diffs`, or the action rows handed in; when the rows needed
 * for an answer are missing the answer says so instead of inventing them.
 * zh-TW shares the zh-HK written register except where wording differs.
 */
export const TEMPLATE_INTENTS = [
  "explain_priority",
  "explain_change",
  "explain_limits",
  "fallback_plan",
  "compare_priorities",
  "explain_insights",
  "asset_next_step",
  "rescan_validation",
] as const satisfies readonly DemoQuestionId[];

export type TemplateIntent = (typeof TEMPLATE_INTENTS)[number];

export function isTemplateIntent(value: unknown): value is TemplateIntent {
  return typeof value === "string" && (TEMPLATE_INTENTS as readonly string[]).includes(value);
}

export interface TemplateContext {
  locale: PrototypeLocale;
  timezone: string;
  locationName: string;
  snapshot: SnapshotRecord | null;
  /** The snapshot `snapshot.comparableTo` points at, when loaded. */
  base: SnapshotRecord | null;
  diff: ScanDiffRow | null;
  /** Open actions for the location, highest priority first. */
  actions: ActionOverview[];
  /** The action the sheet was opened from, if any. */
  action: ActionOverview | null;
  evidenceRefs: EvidenceReference[];
}

export interface TemplateAnswer {
  answer: string;
  nextAction: string;
  evidenceRefs: EvidenceReference[];
  warnings: string[];
}

const MODULES: ModuleKey[] = ["google_business", "instagram", "search_ai", "website"];
const INSIGHT_KEYS: MetricKey[] = ["gbp.response_rate_pct", "gbp.rating", "ig.days_since_last_post", "aeo.ai_citation_count", "website.checks_passed"];

const NO_SNAPSHOT = localized(
  "There is no finished scan for {loc} yet, so there are no numbers to cite. Run a scan first; the assistant only answers from this workspace's snapshots.",
  "{loc} 仍未有已完成的掃描，因此沒有可引用的數字。請先進行掃描；助手只會根據此工作區的快照回答。",
);
const RUN_SCAN = localized("Run a scan for {loc} from the Rescan page, then ask again.", "先在「重新掃描」頁為 {loc} 進行掃描，再重新提問。");
const NO_ACTIONS = localized(
  "There are no open actions for {loc} right now, so there is nothing to prioritise. The latest scan ({date}) scored {score} with {cov} coverage.",
  "{loc} 目前沒有未完成的行動，因此沒有可排序的項目。最新掃描（{date}）評分 {score}，覆蓋率 {cov}。",
);
const NOT_PROOF = localized("Priority is a recommendation; it does not prove rankings, revenue or bookings will improve.", "優先次序是建議，不代表已證明會提升排名、收入或預訂。");
const CAUSATION = localized("This is an observed change over time, not proof that any action caused it.", "這是時間上的已觀察變化，不能證明由某項行動引致。");
const NO_LLM_NUMBERS = localized("Numbers come only from this workspace's scan snapshots and scan_diffs.", "數字只來自此工作區的掃描快照及 scan_diffs。");
const READY = localized("the required inputs are ready", "所需資料已齊備");
const MISSING = localized("it still needs: {inputs}", "仍需要：{inputs}");
const PRIORITY_ANSWER = localized(
  "“{title}” is the top priority ({priority}) because {factors}. Evidence: {value} ({source}, {fact}). Estimated effort {effort} minutes; {inputs}.",
  "「{title}」是首要行動（{priority}），原因：{factors}。證據：{value}（{source}，{fact}）。預計需時 {effort} 分鐘；{inputs}。",
);
const PRIORITY_NEXT_READY = localized("Open the action and generate a draft; the owner approves a specific version before anything is exported.", "開啟該行動並產生草稿；店主核准指定版本後才可匯出。");
const PRIORITY_NEXT_INPUT = localized("Open the action and supply the missing inputs before generating a draft.", "開啟該行動，先補齊缺少的資料，再產生草稿。");
const CHANGE_NO_DIFF = localized(
  "The latest scan ({date}) has no earlier scan to compare with, so the change is Unknown rather than zero. Score {score}, coverage {cov}.",
  "最新掃描（{date}）沒有較早的掃描可供比較，因此變化屬「未知」而非零。評分 {score}，覆蓋率 {cov}。",
);
const CHANGE_INCOMPARABLE = localized(
  "The latest scan ({date}) cannot be compared with the previous one: {reason}. The two snapshots stay separate; no delta is drawn across them.",
  "最新掃描（{date}）不能與上一次比較：{reason}。兩個快照須分開看待，不會跨快照計算變化。",
);
const CHANGE_WITHHELD = localized(
  "The scans are comparable, but the composite delta is withheld ({reason}). Per-module facts: {ledger}.",
  "兩次掃描可比較，但綜合變化已保留（{reason}）。各模組事實：{ledger}。",
);
const CHANGE_OBSERVED = localized(
  "The composite score moved from {base} to {head} ({delta} points — points, not percent) between {baseDate} and {date}. {ledger}.{metrics}",
  "綜合評分由 {base} 變為 {head}（{delta} 分，是分數差而非百分比），比較 {baseDate} 與 {date} 兩次掃描。{ledger}。{metrics}",
);
const LEDGER = localized("{r} findings resolved, {g} regressed, {d} decayed by time", "{r} 項發現已解決，{g} 項退步，{d} 項因時間衰減");
const METRIC_LINE = localized(" {label}: {before} → {after}.", " {label}：{before} → {after}。");
const CHANGE_NEXT = localized("Keep both scan ids; compare the next rescan only if scan_diffs marks it comparable.", "保留兩個 scan id；下一次重掃只在 scan_diffs 標示可比較時才作比較。");
const REASONS: Record<string, LocalizedText> = {
  SCORING_VERSION_UNKNOWN: localized("the scoring version of one scan is unknown", "其中一次掃描的評分版本不明"),
  SCORING_VERSION_MISMATCH: localized("the two scans used different scoring versions", "兩次掃描使用了不同的評分版本"),
  NO_SHARED_MEASURED_MODULE: localized("no source was measured in both scans", "沒有來源在兩次掃描中都被量度"),
  INSUFFICIENT_INDEPENDENT_CHANNELS: localized("too few independent channels were measured", "已量度的獨立渠道太少"),
};
const LIMITS = localized(
  "The latest scan ({date}) measured {measured} of 4 sources ({names}); {unmeasured}. Score: {score}; coverage {cov}. The evidence supports what those public sources showed on that date. It does not prove revenue, bookings, ranking gains or customer intent, and an unmeasured source is not a zero.",
  "最新掃描（{date}）量度了 4 個來源中的 {measured} 個（{names}）；{unmeasured}。評分：{score}；覆蓋率 {cov}。證據只支持該日公開來源顯示的內容，不能證明收入、預訂、排名提升或顧客意圖；未量度的來源亦不等於零分。",
);
const UNMEASURED = localized("not measured: {list}", "未量度：{list}");
const ALL_MEASURED = localized("every source was measured", "所有來源均已量度");
const SCORE_WITHHELD = localized("withheld (fewer than two independent sources measured)", "已保留（少於兩個獨立來源被量度）");
const LIMITS_NEXT = localized("Treat revenue and bookings as unknown; rescan with the same sources, location and scoring version before drawing a trend.", "把收入及預訂視為未知；以相同來源、地點及評分版本重掃後，才可畫出趨勢。");
const PLAN = localized(
  "If the next scan shows no improvement: this week, work through “{title}” ({effort} minutes; evidence {value}). Once approved, record the version and the export time. Then rescan {loc} under the same scoring version ({version}) and read the delta only if scan_diffs marks the pair comparable.",
  "如下次掃描沒有改善：本星期先完成「{title}」（{effort} 分鐘；證據 {value}）。核准後記錄版本及匯出時間。之後以相同評分版本（{version}）為 {loc} 重掃，只在 scan_diffs 標示可比較時才解讀變化。",
);
const PLAN_NEXT = localized("Approve a version this week; check delivery within 7 days; rescan in the next comparable window.", "本星期核准一個版本；7 日內檢查是否已送出；下一個可比較窗口重掃。");
const PLAN_NO_ACTION = localized("There is no open action for {loc} to build a fallback plan from. {scan}", "{loc} 沒有未完成的行動可用作後備計劃。{scan}");
const COMPARE_ONE = localized(
  "Only one open action exists for {loc}: “{title}” ({priority}). There is nothing to rank it against yet.",
  "{loc} 只有一項未完成的行動：「{title}」（{priority}），暫時沒有其他項目可作比較。",
);
const COMPARE = localized("Ranked by priority score for {loc}: {list}. Priority reflects evidence confidence, urgency, readiness and effort; it changes as evidence, permissions and inputs change.", "{loc} 的行動按優先分數排序：{list}。優先次序反映證據可信度、急切程度、準備程度及所需時間，會隨證據、權限及資料改變。");
const COMPARE_ITEM = localized("{n}. “{title}” — {priority}, {points} pts, top factor {factor}{missing}", "{n}. 「{title}」— {priority}，{points} 分，主要因素為{factor}{missing}");
const COMPARE_MISSING = localized(" (waiting for inputs)", "（等待補充資料）");
const COMPARE_NEXT = localized("Start with the first item; collect the missing inputs for the others rather than letting an agent guess them.", "先處理第一項；其餘項目先向店主收集缺少的資料，不交由 Agent 推測。");
const INSIGHTS = localized(
  "Latest scan {date}: score {score}, coverage {cov}. {earlier} {comparable}{metrics}",
  "最新掃描 {date}：評分 {score}，覆蓋率 {cov}。{earlier}{comparable}{metrics}",
);
const INSIGHTS_EARLIER = localized("Earlier scan {date}: score {score}, coverage {cov}.", "較早掃描 {date}：評分 {score}，覆蓋率 {cov}。");
const INSIGHTS_NO_EARLIER = localized("No earlier comparable scan exists yet, so the chart shows one point.", "尚未有較早的可比較掃描，圖表只有一個點。");
const INSIGHTS_COMPARABLE = localized(" The pair is comparable; {ledger}.", "兩者可比較；{ledger}。");
const INSIGHTS_INCOMPARABLE = localized(" The pair is not comparable ({reason}); read them as separate snapshots.", "兩者不可比較（{reason}）；請當作獨立快照解讀。");
const INSIGHTS_NEXT = localized("Keep scan id and observed time on every point; only join points that scan_diffs marks comparable.", "每個點都保留 scan id 及觀察時間；只連接 scan_diffs 標示可比較的點。");
const SEPARATE = localized("Snapshots from different dates must stay labelled separately.", "不同日期的快照必須分開標示。");
const ASSET = localized(
  "This answer does not read asset rights. Only assets marked approved in Assets can back a social draft; anything still under review stays out of public content. {ig}",
  "此回答不會讀取素材的使用權。只有在「素材」中標示為已核准的素材才可用於社交草稿；仍在審閱中的素材不可用於公開內容。{ig}",
);
const ASSET_IG = localized("Instagram evidence from {date}: {label} {value}.", "來自 {date} 的 Instagram 證據：{label} {value}。");
const ASSET_IG_NONE = localized("Instagram was {status} in the latest scan, so there is no posting-gap number to cite.", "最新掃描中 Instagram 的狀態為「{status}」，因此沒有可引用的內容空檔數字。");
const ASSET_NEXT = localized("Use an approved asset (or choose text-only) for the social draft; keep unreviewed uploads in Needs review.", "以已核准素材（或選擇純文字）建立社交草稿；未審閱的上載保留在「需要審閱」。");
const ASSET_WARN = localized("Uploading an asset does not grant the right to publish it.", "上載素材不等於已獲授權發佈。");
const RESCAN = localized(
  "A rescan of {loc} counts as comparable only when: the same location and Google Business profile are scanned; the scoring version matches the latest scan ({version}); at least one source measured now ({names}) is measured again; and scan_diffs marks the pair comparable. The composite delta is still withheld when too few independent channels are measured.",
  "{loc} 的重掃只在以下條件全部符合時才算可比較：掃描同一地點及 Google 商戶檔案；評分版本與最新掃描相同（{version}）；現時已量度的來源（{names}）至少有一個再次被量度；且 scan_diffs 標示為可比較。若已量度的獨立渠道太少，綜合變化仍會被保留。",
);
const RESCAN_NEXT = localized("Start the rescan from the Rescan page after the approved version has been delivered; do not compare against a snapshot with a different scope.", "在核准版本送出後，於「重新掃描」頁啟動重掃；不要與範圍不同的快照比較。");
const RESCAN_WARN = localized("A result that is not comparable is a new snapshot, not a trend.", "不可比較的結果只是新快照，不是趨勢。");
const UNKNOWN_VERSION = localized("unknown", "不明");
const NONE = localized("none", "無");

type Vars = Record<string, string | number>;

function fill(text: LocalizedText, locale: PrototypeLocale, vars: Vars = {}): string {
  return text[locale].replace(/\{(\w+)\}/g, (_, key: string) => (key in vars ? String(vars[key]) : `{${key}}`));
}

function joinList(items: string[], locale: PrototypeLocale): string {
  return items.join(locale === "en" ? ", " : "、");
}

function reasonText(code: string | null, locale: PrototypeLocale): string {
  return code && REASONS[code] ? REASONS[code][locale] : (code ?? "UNKNOWN");
}

function ledger(diff: ScanDiffRow, locale: PrototypeLocale): string {
  return fill(LEDGER, locale, { r: diff.resolved_findings.length, g: diff.regressed_findings.length, d: diff.decayed_findings.length });
}

function factorPoints(action: ActionOverview): number {
  return action.priorityFactors.reduce((sum, f) => sum + f.points, 0);
}

function topFactors(action: ActionOverview, locale: PrototypeLocale, count: number): string {
  const sorted = [...action.priorityFactors].sort((a, b) => b.points - a.points).slice(0, count);
  if (!sorted.length) return locale === "en" ? "no priority factors were recorded" : "沒有記錄優先因素";
  return joinList(sorted.map((f) => `${f.label[locale]} +${f.points}`), locale);
}

function moduleNames(snapshot: SnapshotRecord, locale: PrototypeLocale, measured: boolean): string[] {
  return MODULES.filter((m) => (snapshot.moduleStates[m as ModuleStateKey].status === "measured") === measured).map((m) =>
    measured ? MODULE_NAMES[m][locale] : `${MODULE_NAMES[m][locale]} (${stateLabel(snapshot.moduleStates[m as ModuleStateKey].status, locale)})`,
  );
}

function metricLines(ctx: TemplateContext, snapshot: SnapshotRecord, keys: MetricKey[], limit: number): string {
  const lines: string[] = [];
  for (const key of keys) {
    const change = metricChange(key, snapshot, ctx.base, ctx.diff);
    if (!change || change.before === null) continue;
    lines.push(fill(METRIC_LINE, ctx.locale, { label: metricLabel(key, ctx.locale), before: formatMetricValue(key, change.before, ctx.locale), after: formatMetricValue(key, change.after, ctx.locale) }));
    if (lines.length >= limit) break;
  }
  return lines.join("");
}

function unavailable(ctx: TemplateContext): TemplateAnswer {
  const vars = { loc: ctx.locationName };
  return { answer: fill(NO_SNAPSHOT, ctx.locale, vars), nextAction: fill(RUN_SCAN, ctx.locale, vars), evidenceRefs: [], warnings: [NO_LLM_NUMBERS[ctx.locale]] };
}

function snapshotVars(ctx: TemplateContext, snapshot: SnapshotRecord): Vars {
  return {
    loc: ctx.locationName,
    date: formatDay(snapshot.observedAt, ctx.locale, ctx.timezone),
    score: snapshot.overallScore === null ? SCORE_WITHHELD[ctx.locale] : formatScore(snapshot.overallScore, ctx.locale),
    cov: formatCoverage(snapshot.coverage),
    version: snapshot.scoringVersion ?? UNKNOWN_VERSION[ctx.locale],
  };
}

function actionRefs(ctx: TemplateContext, snapshot: SnapshotRecord, action: ActionOverview | null, extra: string[] = []): EvidenceReference[] {
  return pickRefs(ctx.evidenceRefs, snapshot.id, [...(action ? [`action_${action.id}`] : []), "score", "coverage", ...extra]);
}

function explainPriority(ctx: TemplateContext, snapshot: SnapshotRecord): TemplateAnswer {
  const { locale } = ctx;
  const action = ctx.action ?? ctx.actions[0] ?? null;
  if (!action) {
    return { answer: fill(NO_ACTIONS, locale, snapshotVars(ctx, snapshot)), nextAction: fill(RUN_SCAN, locale, { loc: ctx.locationName }), evidenceRefs: actionRefs(ctx, snapshot, null), warnings: [NOT_PROOF[locale]] };
  }
  const missing = action.missingInputs.length;
  const answer = fill(PRIORITY_ANSWER, locale, {
    title: action.title[locale],
    priority: priorityLabel(action.priority, locale),
    factors: topFactors(action, locale, 3),
    value: action.evidence.value,
    source: action.evidence.source,
    fact: action.evidence.factType,
    effort: action.effortMinutes,
    inputs: missing ? fill(MISSING, locale, { inputs: joinList(action.missingInputs, locale) }) : READY[locale],
  });
  return { answer, nextAction: (missing ? PRIORITY_NEXT_INPUT : PRIORITY_NEXT_READY)[locale], evidenceRefs: actionRefs(ctx, snapshot, action), warnings: [NOT_PROOF[locale]] };
}

function explainChange(ctx: TemplateContext, snapshot: SnapshotRecord): TemplateAnswer {
  const { locale, diff } = ctx;
  const vars = snapshotVars(ctx, snapshot);
  const refs = pickRefs(ctx.evidenceRefs, snapshot.id, ["composite", "score", "coverage"]);
  const warnings = [CAUSATION[locale]];
  if (!diff) return { answer: fill(CHANGE_NO_DIFF, locale, vars), nextAction: fill(RUN_SCAN, locale, vars), evidenceRefs: refs, warnings };
  if (!diff.comparable) return { answer: fill(CHANGE_INCOMPARABLE, locale, { ...vars, reason: reasonText(diff.incomparable_reason, locale) }), nextAction: CHANGE_NEXT[locale], evidenceRefs: refs, warnings };
  if (diff.composite_withheld_reason) {
    return { answer: fill(CHANGE_WITHHELD, locale, { reason: reasonText(diff.composite_withheld_reason, locale), ledger: ledger(diff, locale) }), nextAction: CHANGE_NEXT[locale], evidenceRefs: refs, warnings };
  }
  const changed = [...INSIGHT_KEYS, ...measuredMetricKeys(snapshot).filter((key) => !INSIGHT_KEYS.includes(key))].filter((key) => {
    const change = metricChange(key, snapshot, ctx.base, diff);
    return change?.factType === "Observed" && change.delta !== 0;
  });
  const answer = fill(CHANGE_OBSERVED, locale, {
    ...vars,
    base: diff.composite_base === null ? "—" : Math.round(Number(diff.composite_base)),
    head: diff.composite_head === null ? "—" : Math.round(Number(diff.composite_head)),
    delta: diff.composite_delta === null ? "—" : `${Number(diff.composite_delta) > 0 ? "+" : ""}${Math.round(Number(diff.composite_delta))}`,
    baseDate: ctx.base ? formatDay(ctx.base.observedAt, locale, ctx.timezone) : formatDay(diff.created_at, locale, ctx.timezone),
    ledger: ledger(diff, locale),
    metrics: metricLines(ctx, snapshot, changed, 3),
  });
  return { answer, nextAction: CHANGE_NEXT[locale], evidenceRefs: [...refs, ...pickRefs(ctx.evidenceRefs, snapshot.id, changed.slice(0, 3))], warnings };
}

function explainLimits(ctx: TemplateContext, snapshot: SnapshotRecord): TemplateAnswer {
  const { locale } = ctx;
  const measured = moduleNames(snapshot, locale, true);
  const unmeasured = moduleNames(snapshot, locale, false);
  const answer = fill(LIMITS, locale, {
    ...snapshotVars(ctx, snapshot),
    measured: measured.length,
    names: measured.length ? joinList(measured, locale) : NONE[locale],
    unmeasured: unmeasured.length ? fill(UNMEASURED, locale, { list: joinList(unmeasured, locale) }) : ALL_MEASURED[locale],
  });
  return { answer, nextAction: LIMITS_NEXT[locale], evidenceRefs: pickRefs(ctx.evidenceRefs, snapshot.id, ["score", "coverage", "composite"]), warnings: [SEPARATE[locale]] };
}

function fallbackPlan(ctx: TemplateContext, snapshot: SnapshotRecord): TemplateAnswer {
  const { locale } = ctx;
  const action = ctx.action ?? ctx.actions[0] ?? null;
  const vars = snapshotVars(ctx, snapshot);
  if (!action) {
    return { answer: fill(PLAN_NO_ACTION, locale, { ...vars, scan: fill(NO_ACTIONS, locale, vars) }), nextAction: fill(RUN_SCAN, locale, vars), evidenceRefs: actionRefs(ctx, snapshot, null), warnings: [NOT_PROOF[locale]] };
  }
  const answer = fill(PLAN, locale, { ...vars, title: action.title[locale], effort: action.effortMinutes, value: action.evidence.value });
  return { answer, nextAction: PLAN_NEXT[locale], evidenceRefs: actionRefs(ctx, snapshot, action), warnings: [NOT_PROOF[locale]] };
}

function comparePriorities(ctx: TemplateContext, snapshot: SnapshotRecord): TemplateAnswer {
  const { locale } = ctx;
  const ranked = [...ctx.actions].sort((a, b) => factorPoints(b) - factorPoints(a)).slice(0, 3);
  const vars = snapshotVars(ctx, snapshot);
  if (!ranked.length) return { answer: fill(NO_ACTIONS, locale, vars), nextAction: fill(RUN_SCAN, locale, vars), evidenceRefs: actionRefs(ctx, snapshot, null), warnings: [NOT_PROOF[locale]] };
  const refs = pickRefs(ctx.evidenceRefs, snapshot.id, [...ranked.map((a) => `action_${a.id}`), "score"]);
  if (ranked.length === 1) {
    return { answer: fill(COMPARE_ONE, locale, { ...vars, title: ranked[0].title[locale], priority: priorityLabel(ranked[0].priority, locale) }), nextAction: COMPARE_NEXT[locale], evidenceRefs: refs, warnings: [NOT_PROOF[locale]] };
  }
  const list = ranked.map((a, i) =>
    fill(COMPARE_ITEM, locale, {
      n: i + 1,
      title: a.title[locale],
      priority: priorityLabel(a.priority, locale),
      points: factorPoints(a),
      factor: topFactors(a, locale, 1),
      missing: a.missingInputs.length ? COMPARE_MISSING[locale] : "",
    }),
  );
  return { answer: fill(COMPARE, locale, { ...vars, list: list.join(locale === "en" ? "; " : "；") }), nextAction: COMPARE_NEXT[locale], evidenceRefs: refs, warnings: [NOT_PROOF[locale]] };
}

function explainInsights(ctx: TemplateContext, snapshot: SnapshotRecord): TemplateAnswer {
  const { locale, base, diff } = ctx;
  const earlier = base ? fill(INSIGHTS_EARLIER, locale, { date: formatDay(base.observedAt, locale, ctx.timezone), score: formatScore(base.overallScore, locale), cov: formatCoverage(base.coverage) }) : INSIGHTS_NO_EARLIER[locale];
  const comparable = !diff ? "" : diff.comparable ? fill(INSIGHTS_COMPARABLE, locale, { ledger: ledger(diff, locale) }) : fill(INSIGHTS_INCOMPARABLE, locale, { reason: reasonText(diff.incomparable_reason, locale) });
  const keys = INSIGHT_KEYS.filter((key) => typeof snapshot.metrics[key] === "number");
  const answer = fill(INSIGHTS, locale, { ...snapshotVars(ctx, snapshot), earlier, comparable, metrics: metricLines(ctx, snapshot, keys, 5) });
  return { answer, nextAction: INSIGHTS_NEXT[locale], evidenceRefs: pickRefs(ctx.evidenceRefs, snapshot.id, ["score", "coverage", "composite", ...keys]), warnings: [SEPARATE[locale], CAUSATION[locale]] };
}

function assetNextStep(ctx: TemplateContext, snapshot: SnapshotRecord): TemplateAnswer {
  const { locale } = ctx;
  const gap = snapshot.metrics["ig.days_since_last_post"];
  const ig = typeof gap === "number"
    ? fill(ASSET_IG, locale, { date: formatDay(snapshot.observedAt, locale, ctx.timezone), label: metricLabel("ig.days_since_last_post", locale), value: formatMetricValue("ig.days_since_last_post", gap, locale) })
    : fill(ASSET_IG_NONE, locale, { status: stateLabel(snapshot.moduleStates.instagram.status, locale) });
  return { answer: fill(ASSET, locale, { ig }), nextAction: ASSET_NEXT[locale], evidenceRefs: pickRefs(ctx.evidenceRefs, snapshot.id, ["ig.days_since_last_post", "ig.posts_sampled", "coverage"]), warnings: [ASSET_WARN[locale]] };
}

function rescanValidation(ctx: TemplateContext, snapshot: SnapshotRecord): TemplateAnswer {
  const { locale } = ctx;
  const measured = moduleNames(snapshot, locale, true);
  const answer = fill(RESCAN, locale, { ...snapshotVars(ctx, snapshot), names: measured.length ? joinList(measured, locale) : NONE[locale] });
  return { answer, nextAction: RESCAN_NEXT[locale], evidenceRefs: pickRefs(ctx.evidenceRefs, snapshot.id, ["score", "coverage", "composite"]), warnings: [RESCAN_WARN[locale]] };
}

const HANDLERS: Record<TemplateIntent, (ctx: TemplateContext, snapshot: SnapshotRecord) => TemplateAnswer> = {
  explain_priority: explainPriority,
  explain_change: explainChange,
  explain_limits: explainLimits,
  fallback_plan: fallbackPlan,
  compare_priorities: comparePriorities,
  explain_insights: explainInsights,
  asset_next_step: assetNextStep,
  rescan_validation: rescanValidation,
};

export function templateAnswer(intent: TemplateIntent, ctx: TemplateContext): TemplateAnswer {
  if (!ctx.snapshot) return unavailable(ctx);
  return HANDLERS[intent](ctx, ctx.snapshot);
}

/** The template that stands in when a draft intent cannot run (no action, or the model is unavailable). */
export function fallbackIntentFor(intent: DemoQuestionId): TemplateIntent {
  switch (intent) {
    case "draft_review_reply":
    case "friendlier_review_reply":
      return "explain_priority";
    case "generate_social":
      return "asset_next_step";
    default:
      return isTemplateIntent(intent) ? intent : "explain_limits";
  }
}
