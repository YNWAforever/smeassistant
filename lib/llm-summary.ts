import { llmComplete } from "./llm";

interface SummaryInput {
  business_name: string;
  industry: string;
  district: string;
  overall_score: number;
  top_findings: Array<{
    module: string;
    message: string;
    score_impact: number;
    /** Same finding's effect on the headline: score_impact x the module weight. */
    overall_impact: number;
  }>;
}

/** Rounds a magnitude to one decimal and strips a trailing ".0", e.g. 6 not "6.0". */
function formatMagnitude(n: number): string {
  const fixed = Math.round(Math.abs(n) * 10) / 10;
  const asString = fixed.toFixed(1);
  return asString.endsWith(".0") ? asString.slice(0, -2) : asString;
}

const MODULE_LABELS_ZH: Record<string, string> = {
  ig: "IG 可見度",
  gbp: "Google 商家",
  aeo: "AI 能見度",
  trust: "信任指標",
};

const MODULE_LABELS_EN: Record<string, string> = {
  ig: "IG Visibility",
  gbp: "Google Business",
  aeo: "AI Visibility",
  trust: "Trust Signals",
};

const MODULE_LABELS_TW: Record<string, string> = {
  ig: "IG 能見度",
  gbp: "Google 商家",
  aeo: "AI 能見度",
  trust: "信任指標",
};

function buildSummaryPrompt(input: SummaryInput, locale: "zh-HK" | "en" | "zh-TW"): string {
  const labels = locale === "en" ? MODULE_LABELS_EN : locale === "zh-TW" ? MODULE_LABELS_TW : MODULE_LABELS_ZH;
  // score_impact is module-relative (it subtracts from that module's own
  // 0-100 score); overall_impact is the same finding's real effect on the
  // headline (score_impact x that module's weight). The two numbers are
  // labelled separately and explicitly so the model never states the
  // module-relative figure as if it were a headline delta.
  const findingsText = input.top_findings
    .map((f) => {
      const label = labels[f.module] ?? f.module;
      return `- [${label}] ${f.message} (module impact: ${Math.abs(f.score_impact)} pts off ${label}'s own score; overall-score impact: ${formatMagnitude(f.overall_impact)} pts)`;
    })
    .join("\n");
  const weightingNote =
    "Note: the overall score is a weighted average of the module scores, not their sum -- each issue's \"module impact\" and \"overall-score impact\" above are different numbers, and the per-issue overall-score impacts do not simply add up to the overall score.";

  if (locale === "en") {
    return `You are an expert digital marketing consultant for Hong Kong SMEs. Based on the data below, write a 3–5 sentence English summary explaining this business's visibility issues.

Business: ${input.business_name}
Industry: ${input.industry}
District: ${input.district}
Overall Score: ${input.overall_score}/100

${weightingNote}

Key Issues:
${findingsText}

Requirements:
- Write in natural, professional English as if speaking directly to the business owner
- Identify which channel has the biggest problem
- Explain how the issues affect each other
- End with one specific improvement direction
- Never state a module impact number as if it were the overall score's change -- use the overall-score impact figure for any claim about the headline score
- Keep it concise: 3–5 sentences, plain text only, no formatting`;
  }

  if (locale === "zh-TW") {
    const weightingNoteTW =
      "註：綜合評分是各模組分數的加權平均，不是加總 -- 上面每個問題的「模組內影響」和「對綜合評分的影響」是不同的數字，個別問題對綜合評分的影響不能直接加總得出綜合評分的變化。";
    return `你是一位台灣中小企業的數位行銷顧問。根據以下數據，用台灣繁體中文寫一段 3-5 句的總結，說明這家店的線上能見度問題。

商家：${input.business_name}
產業：${input.industry}
地區：${input.district}
綜合評分：${input.overall_score}/100

${weightingNoteTW}

主要問題：
${findingsText}

要求：
- 用自然、專業的台灣繁體中文，像顧問當面說明
- 指出哪個管道問題最大
- 說明各問題如何互相影響
- 結尾給一個具體的改善方向
- 不要把「模組內影響」的數字當作綜合評分的變化來陳述 -- 談到綜合評分時只能用「對綜合評分的影響」這個數字
- 簡潔，3-5 句，純文字，不要格式`;
  }

  const weightingNoteZH =
    "注意：綜合評分係各模組分數嘅加權平均，唔係加埋嚟 -- 上面每個問題嘅「模組內影響」同「對綜合評分嘅影響」係唔同嘅數字，逐個問題對綜合評分嘅影響唔可以直接加埋嚟得出綜合評分嘅變化。";
  return `你係一個香港 SME 營銷診斷專家。根據以下數據，用廣東話寫一個 3-5 句嘅總結，解釋呢間舖頭嘅能見度問題。

商戶：${input.business_name}
行業：${input.industry}
地區：${input.district}
綜合評分：${input.overall_score}/100

${weightingNoteZH}

主要問題：
${findingsText}

要求：
- 用自然廣東話，似一個顧問面對面講嘢
- 指出邊個渠道最大問題
- 說明每個問題點樣互相影響
- 結尾畀一個具體嘅改善方向
- 唔好將「模組內影響」嘅數字當做係綜合評分嘅變化嚟講 -- 講到綜合評分嘅時候淨係可以用「對綜合評分嘅影響」呢個數字
- 唔好太長，3-5 句夠
- 唔使格式，直接出純文字`;
}

export async function generateExecutiveSummary(
  input: SummaryInput,
  locale: "zh-HK" | "en" | "zh-TW" = "zh-HK"
): Promise<string | null> {
  const prompt = buildSummaryPrompt(input, locale);
  const result = await llmComplete(prompt, { maxTokens: 300, temperature: 0.7, timeoutMs: 12000 });
  if (!result) return null;

  // This is one of several production LLM callers (see also
  // lib/agents/generate-fix-pack.ts and lib/notifications/digest-narrative.ts),
  // so this log line accounts for this call site's own spend, not the
  // product's total. Token counts alone — no prompt, no completion, no
  // merchant identifier — so the line is safe to keep and greppable when someone
  // asks what these calls cost. Structured for the moment agent_runs.cost
  // exists to receive it.
  console.info("[llm] completion usage", {
    category: "llm_usage",
    caller: "executive_summary",
    locale,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  });

  return result.text;
}
