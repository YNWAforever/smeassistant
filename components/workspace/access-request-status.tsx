import type { MyRequestStatus } from "@/lib/workspace/my-access-request"

/**
 * DEC-06 says not to claim an operating service exists, so this promises no
 * review, no response time and no "our team is looking at this". It states
 * what is recorded and nothing more.
 */
const COPY: Record<MyRequestStatus, { en: string; zh: string }> = {
  pending: {
    en: "Your request is recorded. We have not committed to a review time.",
    zh: "已記錄你的申請。我們未就審核時間作出承諾。",
  },
  awaiting_information: {
    en: "Fimmick has asked you for more information before deciding.",
    zh: "Fimmick 需要你補充資料才能決定。",
  },
  approved: {
    en: "Your request was approved and your workspace was created.",
    zh: "申請已批准，工作台已建立。",
  },
  rejected: { en: "Your request was not approved.", zh: "申請未獲批准。" },
  closed: { en: "Your request has been closed.", zh: "申請已結束。" },
}

export function AccessRequestStatus({
  status,
  isChinese,
  businessName,
}: {
  status: MyRequestStatus
  isChinese: boolean
  businessName: string
}) {
  const copy = COPY[status]
  return (
    <div className="section-card">
      <p className="eyebrow">{isChinese ? "擁有權申請" : "Ownership request"}</p>
      <h2>{businessName}</h2>
      <p>{isChinese ? copy.zh : copy.en}</p>
    </div>
  )
}
