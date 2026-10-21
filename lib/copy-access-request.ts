/**
 * The ownership access request (Phase 2 item 27), reached as copy[locale].accessRequest:
 * the request form on onboarding and the request status on onboarding and the
 * workspace chooser. Filing is not ownership (guardrail 15), and DEC-06 forbids
 * promising a review time, so the status lines state only what is recorded.
 * Both Chinese locales read the same text, as they always have.
 */

export type AccessRequestCopy = {
  form: {
    notProof: string
    intent: string
    channel: string
    contact: string
    evidence: string
    evidencePlaceholder: string
    evidenceNote: string
    submit: string
  }
  toasts: {
    missing: string
    recorded: string
    tooMany: string
    notMatched: string
    failed: string
  }
  status: {
    eyebrow: string
    pending: string
    awaiting_information: string
    approved: string
    rejected: string
    closed: string
  }
}

export const accessRequestEn: AccessRequestCopy = {
  form: {
    notProof: "Filing a request is not proof of ownership; Fimmick verifies it separately.",
    intent: "What are you asking for?",
    channel: "How should we reach you?",
    contact: "Number or address",
    evidence: "Something we can check (optional)",
    evidencePlaceholder: "For example a business registration number",
    evidenceNote: "A reference we can check independently. Do not upload documents; there is no upload here.",
    submit: "Send the request",
  },
  toasts: {
    missing: "Describe your request and how to reach you.",
    recorded: "Your request is recorded.",
    tooMany: "Too many requests; try again shortly.",
    notMatched: "This report could not be matched to your account.",
    failed: "The request could not be submitted.",
  },
  status: {
    eyebrow: "Ownership request",
    pending: "Your request is recorded. We have not committed to a review time.",
    awaiting_information: "Fimmick has asked you for more information before deciding.",
    approved: "Your request was approved and your workspace was created.",
    rejected: "Your request was not approved.",
    closed: "Your request has been closed.",
  },
}

export const accessRequestZhHK: AccessRequestCopy = {
  form: {
    notProof: "提交申請不等於證明擁有權；Fimmick 會另行核實。",
    intent: "你想申請甚麼？",
    channel: "聯絡方式",
    contact: "聯絡號碼或地址",
    evidence: "可供核實的參考（選填）",
    evidencePlaceholder: "例如商業登記號碼",
    evidenceNote: "請填寫可獨立核實的參考，不需上載文件。",
    submit: "提交申請",
  },
  toasts: {
    missing: "請填寫你的說明及聯絡方式。",
    recorded: "已記錄你的申請。",
    tooMany: "請求過於頻繁，請稍後再試。",
    notMatched: "此報告未能與你的帳戶對應。",
    failed: "未能提交申請。",
  },
  status: {
    eyebrow: "擁有權申請",
    pending: "已記錄你的申請。我們未就審核時間作出承諾。",
    awaiting_information: "Fimmick 需要你補充資料才能決定。",
    approved: "申請已批准，工作台已建立。",
    rejected: "申請未獲批准。",
    closed: "申請已結束。",
  },
}

export const accessRequestZhTW: AccessRequestCopy = {
  form: {
    notProof: "提交申請不等於證明擁有權；Fimmick 會另行核實。",
    intent: "你想申請甚麼？",
    channel: "聯絡方式",
    contact: "聯絡號碼或地址",
    evidence: "可供核實的參考（選填）",
    evidencePlaceholder: "例如商業登記號碼",
    evidenceNote: "請填寫可獨立核實的參考，不需上載文件。",
    submit: "提交申請",
  },
  toasts: {
    missing: "請填寫你的說明及聯絡方式。",
    recorded: "已記錄你的申請。",
    tooMany: "請求過於頻繁，請稍後再試。",
    notMatched: "此報告未能與你的帳戶對應。",
    failed: "未能提交申請。",
  },
  status: {
    eyebrow: "擁有權申請",
    pending: "已記錄你的申請。我們未就審核時間作出承諾。",
    awaiting_information: "Fimmick 需要你補充資料才能決定。",
    approved: "申請已批准，工作台已建立。",
    rejected: "申請未獲批准。",
    closed: "申請已結束。",
  },
}
