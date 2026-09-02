import { createDemoAssistantRun } from "@/lib/pocket-assistant/demo"
import { isDemoQuestionId } from "@/lib/pocket-assistant/contracts"

export async function POST(request: Request) {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 })
  }

  if (!payload || typeof payload !== "object") {
    return Response.json({ error: "invalid_request" }, { status: 400 })
  }

  const { questionId, locale, sampleId } = payload as Record<string, unknown>
  if (sampleId !== "demo-kam-man-house" || !isDemoQuestionId(questionId)) {
    return Response.json({ error: "demo_scope_not_allowed" }, { status: 403 })
  }

  if (!new Set(["zh-HK", "zh-TW", "en"]).has(String(locale))) {
    return Response.json({ error: "unsupported_locale" }, { status: 400 })
  }

  return Response.json(createDemoAssistantRun(questionId, String(locale)), {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
