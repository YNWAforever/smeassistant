import type {
  AssistantArtifact,
  DemoAssistantRunResponse,
  DemoQuestionId,
  EvidenceReference,
} from "@/lib/pocket-assistant/contracts"

const evidence = {
  before: {
    evidenceId: "ev_review_response_20260805",
    scanId: "scan_kmh_20260805",
    factType: "Observed",
    label: "行動前評論回覆率",
    value: "22%",
    observedAt: "2026-08-05T09:42:00+08:00",
    source: "Google Business · 奕蔭街",
  },
  after: {
    evidenceId: "ev_review_response_20260820",
    scanId: "scan_kmh_20260820",
    factType: "Observed",
    label: "可比較重掃評論回覆率",
    value: "31%",
    observedAt: "2026-08-20T09:42:00+08:00",
    source: "Google Business · 奕蔭街",
  },
  current: {
    evidenceId: "ev_review_response_20260825",
    scanId: "scan_kmh_20260825",
    factType: "Observed",
    label: "最新評論回覆率",
    value: "18% · 7 則待回覆",
    observedAt: "2026-08-25T09:42:00+08:00",
    source: "Google Business · 奕蔭街",
  },
  score: {
    evidenceId: "ev_visibility_score_20260825",
    scanId: "scan_kmh_20260825",
    factType: "Observed",
    label: "最新能見度快照",
    value: "62/100 · 覆蓋率 78%",
    observedAt: "2026-08-25T09:42:00+08:00",
    source: "SME Scanner · 香港市場",
  },
  social: {
    evidenceId: "ev_social_gap_20260822",
    scanId: "scan_kmh_20260825",
    factType: "Observed",
    label: "社交內容空檔",
    value: "最近確認帖文距今 16 日",
    observedAt: "2026-08-22T15:10:00+08:00",
    source: "Instagram 公開證據 · 部分覆蓋",
  },
  faq: {
    evidenceId: "ev_faq_gap_20260825",
    scanId: "scan_kmh_20260825",
    factType: "Observed",
    label: "搜尋答案缺口",
    value: "3 個高意向問題沒有可靠答案",
    observedAt: "2026-08-25T10:05:00+08:00",
    source: "網站、Google Search 與 AI 版面",
  },
  menu: {
    evidenceId: "ev_menu_translation_20260825",
    scanId: "scan_kmh_20260825",
    factType: "Observed",
    label: "英文餐牌完整度",
    value: "24 個項目中 9 個缺少英文標籤",
    observedAt: "2026-08-25T10:12:00+08:00",
    source: "公開網站 · 天后",
  },
} satisfies Record<string, EvidenceReference>

function artifact(
  type: AssistantArtifact["type"],
  id: string,
  title: string,
  body: string,
  acceptanceCriteria: string[],
): AssistantArtifact {
  return { type, artifactId: id, version: 1, title, body, acceptanceCriteria }
}

const reviewReply = "多謝你喜歡我們的食物，也謝謝你坦白告訴我們星期五午市等候較久。這次體驗未如理想，我們已把意見交給店內團隊跟進繁忙時段的安排。希望下次再見時，能為你帶來更順暢的體驗。"

type DemoAnswer = Omit<DemoAssistantRunResponse, "runId" | "demoBoundary">

const zhAnswers: Record<DemoQuestionId, DemoAnswer> = {
  explain_priority: {
    state: "completed",
    answer: "評論回覆是首要行動，因為最新可比較快照顯示回覆率由 31% 跌至 18%，已有 7 則近期評論等待店主回覆；所需資料及草稿亦已準備，能以較少店主時間處理一個高意向接觸點。",
    nextAction: "先審閱最近 7 則評論的回覆草稿，再由店主核准指定版本。",
    evidenceRefs: [evidence.current, evidence.after],
    warnings: ["優先次序是建議，不代表已證明會提升排名、收入或預訂。"],
    requiresApproval: false,
  },
  explain_change: {
    state: "completed",
    answer: "22% 升至 31% 等於增加 9 個百分點，而不是增加 9%。兩個數字來自同一地點、同一來源及 15 日比較窗口，因此可描述為已觀察改善。",
    nextAction: "保留兩個 scan_id，並在下一次同條件重掃檢查改善是否維持。",
    evidenceRefs: [evidence.before, evidence.after],
    warnings: ["這是時間上的關聯，不能單憑兩個快照判定因果。"],
    requiresApproval: false,
  },
  explain_limits: {
    state: "completed",
    answer: "目前只能證明公開評論回覆率曾經改變，以及最新快照再次回落。未有證據證明回覆草稿帶來收入、訂座、排名、顧客意圖或銷售增長；Instagram 的不完整覆蓋亦不能當成零分。",
    nextAction: "把收入及預訂保留為未知，先用相同來源、地點和量度方式重掃。",
    evidenceRefs: [evidence.before, evidence.after, evidence.current, evidence.score],
    warnings: ["不要把不同日期 snapshot 混成同一次掃描結果。"],
    requiresApproval: false,
  },
  fallback_plan: {
    state: "completed",
    answer: "如果再次跌至 18%，本星期先處理最近 7 則未回覆評論；把投訴、一般意見及讚賞分批，先處理需要回應的服務問題。完成後記錄核准版本及匯出時間，再安排相同條件重掃。",
    nextAction: "今天審閱回覆批次；7 日內檢查是否全部送出；下一個可比較窗口重新掃描。",
    evidenceRefs: [evidence.current],
    output: artifact(
      "validation_plan",
      "artifact_kmh_review_recovery",
      "評論回覆復原與重掃計劃",
      "今日：審閱 7 則回覆草稿。送出後：保留版本及匯出紀錄。下一個可比較窗口：以同一 Google 商戶、地點及覆蓋規則重掃。",
      ["7 則近期評論已有店主回覆", "核准版本及匯出時間已記錄", "重掃使用相同地點、來源及量度規則"],
    ),
    warnings: [],
    requiresApproval: true,
  },
  draft_review_reply: {
    state: "needs_approval",
    answer: "以下草稿承認等候時間，但沒有承諾賠償、指定改善日期或加入未經確認的營運細節。",
    nextAction: "由店主檢查語氣及事實，建立新版本後才可核准；不會自動發佈。",
    evidenceRefs: [evidence.current],
    output: artifact("review_reply", "artifact_kmh_reply_demo", "3 星評論回覆草稿", reviewReply, ["不加入未確認事實", "不作過度承諾", "由店主核准指定版本"]),
    warnings: ["此草稿只使用已清理的示範評論。"],
    requiresApproval: true,
  },
  friendlier_review_reply: {
    state: "needs_approval",
    answer: "我已把語氣調得更親切，同時保留『不過度承諾』的品牌規則。這是一個新輸出，不能覆蓋目前未儲存內容。",
    nextAction: "建立新的不可變更版本，再由有權限的店主或經理核准。",
    evidenceRefs: [evidence.current],
    output: artifact("review_reply", "artifact_kmh_reply_friendlier", "較親切的評論回覆", reviewReply, ["另存新版本", "保留原始評論證據連結", "核准前不可匯出或發佈"]),
    warnings: [],
    requiresApproval: true,
  },
  compare_priorities: {
    state: "completed",
    answer: "評論回覆排在社交帖文及 FAQ 前，因為它是最新退步、涉及 7 個已知待處理項目，而且草稿已準備；社交來源只有部分覆蓋，而 FAQ 仍需要店主補充私人宴會事實。",
    nextAction: "先完成評論回覆；同時向店主收集 FAQ 所需事實，不把缺少資料交給 Agent 推測。",
    evidenceRefs: [evidence.current, evidence.social, evidence.faq],
    warnings: ["優先排序會隨證據新鮮度、權限及所需資料改變。"],
    requiresApproval: false,
  },
  explain_insights: {
    state: "completed",
    answer: "8 月 5 日至 20 日的 22% → 31% 是一次已觀察改善；8 月 25 日的 18% 是其後另一個 snapshot 的新退步。三者可以按時間解讀，但不能混作同一次量度，也不能證明收入因果。",
    nextAction: "在圖表及回覆中保留 scan_id 與 observed_at，下一次只比較符合資格的快照。",
    evidenceRefs: [evidence.before, evidence.after, evidence.current],
    warnings: ["不同日期的 snapshot 必須分開標示。"],
    requiresApproval: false,
  },
  asset_next_step: {
    state: "completed",
    answer: "目前已核准午市套餐相片可支援本週社交帖文；餐牌 PDF 仍需確認使用權與內容，未確認前不應交給圖片或海報能力作公開素材。",
    nextAction: "先用已核准相片建立社交草稿；把餐牌素材保留在『需要審閱』。",
    evidenceRefs: [evidence.social],
    warnings: ["上載素材不等於已獲授權發佈。"],
    requiresApproval: false,
  },
  rescan_validation: {
    state: "needs_approval",
    answer: "重新掃描應沿用原行動的 acceptance criteria：同一 Google 商戶、奕蔭街、相同回覆率定義及合資格覆蓋。若來源或範圍不同，結果只可作新快照，不可畫成同一趨勢。",
    nextAction: "確認來源、地點、覆蓋及觀察窗口後才開始重掃。",
    evidenceRefs: [evidence.current],
    output: artifact("validation_plan", "artifact_kmh_rescan_contract", "可比較重掃驗證條件", "同一 Google 商戶與奕蔭街地點；相同評論回覆率定義；記錄 scan_id、observed_at、來源狀態及覆蓋率。", ["來源及地點一致", "覆蓋符合比較門檻", "不跨越證據缺口畫線"]),
    warnings: [],
    requiresApproval: true,
  },
  generate_social: {
    state: "needs_approval",
    answer: "已根據已核准午市套餐相片準備社交文案；未加入價錢、優惠期限或未確認食材。",
    nextAction: "核對相片使用權與替代文字，建立新版本後交店主核准。",
    evidenceRefs: [evidence.social],
    output: artifact("social_post", "artifact_kmh_social_demo", "本週午市社交帖文", "忙碌的一星期，也值得用一頓暖心午餐為自己充充電。歡迎與同事來錦汶館坐坐。\n\n#跑馬地美食 #香港茶餐廳 #午市", ["使用已核准相片", "包含替代文字", "不加入未確認優惠"]),
    warnings: [],
    requiresApproval: true,
  },
  generate_faq: {
    state: "needs_approval",
    answer: "FAQ 結構已準備，但容納人數、預訂提前期及素食選項仍是未知，不能由 Agent 補作事實。",
    nextAction: "先向店主收集 3 項事實，再建立 FAQ 與 JSON-LD 新版本。",
    evidenceRefs: [evidence.faq],
    output: artifact("faq", "artifact_kmh_faq_demo", "私人宴會 FAQ 結構", "Q1：最多可容納多少人？\nQ2：需要提前多久預訂？\nQ3：可否安排素食選項？", ["店主確認所有答案", "頁面內容與 JSON-LD 一致", "未知資料不自行生成"]),
    warnings: ["目前只可建立問題結構，不可生成未經確認答案。"],
    requiresApproval: true,
  },
  generate_menu: {
    state: "needs_approval",
    answer: "已建立英文餐牌翻譯工作批次；食材、致敏原及特色菜名仍需店主逐項確認。",
    nextAction: "先確認 9 個缺少標籤的項目，再建立雙語餐牌新版本。",
    evidenceRefs: [evidence.menu],
    output: artifact("menu_translation", "artifact_kmh_menu_demo", "雙語餐牌翻譯批次", "9 個項目等待英文標籤；保留中文原名、店主確認英文名稱及任何致敏原描述。", ["中英文逐項對照", "致敏原由店主確認", "核准後才可匯出"]),
    warnings: ["不要推測食材或致敏原。"],
    requiresApproval: true,
  },
}

const enLabels: Record<DemoQuestionId, string> = {
  explain_priority: "Review replies are the priority because the latest comparable snapshot fell from 31% to 18%, seven recent reviews remain unanswered, and an owner-reviewable draft is ready.",
  explain_change: "The move from 22% to 31% is a nine-percentage-point increase across two comparable snapshots. It is an observed change, not proof of causation.",
  explain_limits: "The evidence does not prove revenue, bookings, ranking gains or customer intent. It only supports the stated public-snapshot changes and coverage limits.",
  fallback_plan: "Review the seven newest unanswered reviews, preserve the approved version and export record, then re-scan under the same comparison rules.",
  draft_review_reply: "A warm, non-promissory reply draft is ready for owner review.",
  friendlier_review_reply: "The tone is friendlier while keeping the no-overpromising guardrail. Save it as a new version.",
  compare_priorities: "Review replies rank ahead of social and FAQ work because the regression is recent, the affected items are known, and the draft is ready.",
  explain_insights: "22% to 31% is the earlier observed improvement; 18% is a later regression. Keep all three snapshots separate by scan ID and observation time.",
  asset_next_step: "Use the approved lunch-set photo for the social draft. Keep the menu PDF in review until rights and content are confirmed.",
  rescan_validation: "Use the same Google Business profile, location, response-rate definition and eligible coverage before calling the next scan comparable.",
  generate_social: "A social caption is ready from an approved asset without unconfirmed prices or offer dates.",
  generate_faq: "The FAQ structure is ready, but the owner must supply capacity, lead time and vegetarian-option facts.",
  generate_menu: "The menu translation batch is ready for owner confirmation of names, ingredients and allergens.",
}

export function createDemoAssistantRun(questionId: DemoQuestionId, locale: string): DemoAssistantRunResponse {
  const base = zhAnswers[questionId]
  const isEnglish = locale === "en"
  return {
    ...base,
    runId: `demo_run_${crypto.randomUUID()}`,
    answer: isEnglish ? enLabels[questionId] : base.answer,
    nextAction: isEnglish ? "Review the evidence and keep owner approval as the next control point." : base.nextAction,
    demoBoundary: isEnglish
      ? "Sanitised Kam Man House demo data only. No arbitrary business or customer data is accepted."
      : "只使用已清理的錦汶館示範資料；不接受任意商戶、客戶或私人資料。",
  }
}
