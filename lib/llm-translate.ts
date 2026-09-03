import type { AuditFindingRow } from "@sme-scanner/contracts";
import { llmComplete, llmConfigured } from "./llm";

interface TranslatedFinding {
  id: string;
  message: string;
}

// Translate in small batches so a single response never grows large enough to be
// truncated by max_tokens. Batches run in parallel and fail independently.
const CHUNK_SIZE = 6;

const PROMPTS: Record<"en" | "zh-TW", string> = {
  en: `Translate these SME audit finding messages from Cantonese to clear, professional English for an SME owner.`,
  "zh-TW": `將以下中小企診斷訊息從香港粵語改寫成自然、專業的台灣繁體中文（書面語，非口語），對象是台灣店家老闆。保留所有數字與英文專有名詞（IG、Google、AI、Reels 等）。`,
};

async function translateChunk(chunk: AuditFindingRow[], target: "en" | "zh-TW"): Promise<TranslatedFinding[]> {
  const input = chunk.map((f) => ({ id: f.id, message: f.owner_message_zh }));

  const prompt = `${PROMPTS[target]}
Keep each "id" exactly as given. Return ONLY valid JSON in this exact shape (no markdown, no commentary):
{"translations": [{"id": "<same id>", "message": "<translation>"}]}

Messages:
${JSON.stringify(input, null, 2)}`;

  const result = await llmComplete(prompt, { maxTokens: 2000, temperature: 0.3 });
  if (!result) return [];
  const raw = result.text;

  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const jsonStr = start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw;
    const parsed = JSON.parse(jsonStr) as { translations?: TranslatedFinding[] };
    const list = Array.isArray(parsed.translations) ? parsed.translations : [];
    return list.filter((t) => t && typeof t.id === "string" && typeof t.message === "string");
  } catch (err) {
    console.error("[llm-translate] parse failed:", err);
    return [];
  }
}

async function translateFindings(
  findings: AuditFindingRow[],
  target: "en" | "zh-TW",
  alreadyHave: (f: AuditFindingRow) => boolean,
): Promise<TranslatedFinding[]> {
  if (!llmConfigured()) {
    console.error("[llm-translate] LLM not configured");
    return [];
  }
  const toTranslate = findings.filter((f) => f.owner_message_zh && !alreadyHave(f));
  if (toTranslate.length === 0) return [];

  const chunks: AuditFindingRow[][] = [];
  for (let i = 0; i < toTranslate.length; i += CHUNK_SIZE) {
    chunks.push(toTranslate.slice(i, i + CHUNK_SIZE));
  }
  const results = await Promise.all(chunks.map((chunk) => translateChunk(chunk, target)));
  return results.flat();
}

export async function translateFindingsToEnglish(
  findings: AuditFindingRow[],
): Promise<Array<{ id: string; owner_message_en: string }>> {
  const out = await translateFindings(findings, "en", (f) => !!f.owner_message_en);
  return out.map((t) => ({ id: t.id, owner_message_en: t.message }));
}

export async function translateFindingsToMandarin(
  findings: AuditFindingRow[],
): Promise<Array<{ id: string; owner_message_tw: string }>> {
  const out = await translateFindings(findings, "zh-TW", (f) => !!f.owner_message_tw);
  return out.map((t) => ({ id: t.id, owner_message_tw: t.message }));
}
