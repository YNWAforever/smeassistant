/**
 * Workspace text built by lib helpers, reached as copy[locale].workspaceLabels:
 * draft guardrail warnings, why two scans cannot be compared (guardrail 3), effort,
 * the export's alt-text line, and the activity ledger's actor and entity names.
 * Approver warnings say "before approving"; visitor (unsaved preview) warnings say
 * "before using it". {detail} and {minutes} are filled with lib/copy-ui.ts `fill`.
 */

export type WorkspaceLabelsCopy = {
  guardrails: {
    offerPriceMismatch: string
    offerDatesMissing: string
    offerProhibitedTerm: string
    unexpectedLink: {
      approver: string
      visitor: string
    }
    unconfirmedClaim: {
      approver: string
      visitor: string
    }
    prohibitedTerm: string
    compensationPromise: string
    altTextMissing: string
    tooManyHashtags: string
    jsonldMissing: string
    jsonldInvalid: string
    jsonldMismatch: string
    titleTooLong: string
    bioTooLong: string
    bodyTooLong: string
  }
  comparison: {
    SCORING_VERSION_MISMATCH: string
    SCORING_VERSION_UNKNOWN: string
    NO_SHARED_MEASURED_MODULE: string
    INSUFFICIENT_INDEPENDENT_CHANNELS: string
    NO_DIFF: string
    none: string
  }
  effort: string
  altText: string
  actors: {
    user: string
    agent: string
    system: string
    scanner: string
    operator: string
  }
  entities: {
    audit_job: string
    action: string
    action_run: string
    agent_run: string
    output_version: string
    delivery: string
    asset: string
    brand_profile: string
    offer: string
    workspace: string
    workspace_member: string
    workspace_access_request: string
    oauth_connection: string
  }
}

export const workspaceLabelsEn: WorkspaceLabelsCopy = {
  guardrails: {
    offerPriceMismatch: "The offer amount or currency is missing, inconsistent or ambiguous; check the confirmed offer before approving.",
    offerDatesMissing: "The offer start and end dates are missing or inconsistent; check the dates and years before approving.",
    offerProhibitedTerm: "Contains a prohibited offer term; check it before approving.",
    unexpectedLink: {
      approver: "Contains a link you did not supply — check it before approving.",
      visitor: "Contains a link you did not supply — check it before using it.",
    },
    unconfirmedClaim: {
      approver: "Mentions a price or superlative that is not in your confirmed facts — check it before approving.",
      visitor: "Mentions a price or superlative you have not confirmed — check it before using it.",
    },
    prohibitedTerm: "Contains a prohibited brand term: {detail}",
    compensationPromise: "Appears to promise compensation, a refund or a discount.",
    altTextMissing: "Image alt text is missing.",
    tooManyHashtags: "Too many hashtags.",
    jsonldMissing: "The JSON-LD block is missing.",
    jsonldInvalid: "The JSON-LD is not valid, so the next scan will not read it.",
    jsonldMismatch: "The JSON-LD questions and answers do not match the text above them.",
    titleTooLong: "Title is longer than {detail} characters.",
    bioTooLong: "Bio is longer than {detail} characters.",
    bodyTooLong: "Body is longer than {detail} characters.",
  },
  comparison: {
    SCORING_VERSION_MISMATCH: "Scoring version changed",
    SCORING_VERSION_UNKNOWN: "Scoring version unknown",
    NO_SHARED_MEASURED_MODULE: "No shared measured source",
    INSUFFICIENT_INDEPENDENT_CHANNELS: "Too few independent channels",
    NO_DIFF: "No second comparable scan yet",
    none: "No comparable scan yet",
  },
  effort: "about {minutes} minutes",
  altText: "Alt text",
  actors: {
    user: "Member",
    agent: "Kinnso OS",
    system: "Kinnso OS",
    scanner: "Scanner",
    operator: "Operator",
  },
  entities: {
    audit_job: "Scan",
    action: "Action",
    action_run: "Draft run",
    agent_run: "Fix Pack draft",
    output_version: "Version",
    delivery: "Delivery",
    asset: "Asset",
    brand_profile: "Brand profile",
    offer: "Offer",
    workspace: "Workspace",
    workspace_member: "Member",
    workspace_access_request: "Access request",
    oauth_connection: "Connection",
  },
}

export const workspaceLabelsZhHK: WorkspaceLabelsCopy = {
  guardrails: {
    offerPriceMismatch: "優惠金額或貨幣缺漏、不一致或不明確；確認前請核對已確認優惠。",
    offerDatesMissing: "優惠起訖日期缺漏或不一致；確認前請核對日期及年份。",
    offerProhibitedTerm: "含優惠禁用字眼；確認前請核對。",
    unexpectedLink: {
      approver: "含有你沒有提供的連結，確認前請先檢查。",
      visitor: "含有你沒有提供的連結，使用前請先檢查。",
    },
    unconfirmedClaim: {
      approver: "提及你未確認的價錢或誇大字眼，確認前請先檢查。",
      visitor: "提及你未確認的價錢或誇大字眼，使用前請先檢查。",
    },
    prohibitedTerm: "含品牌禁用詞：{detail}",
    compensationPromise: "似乎承諾補償、退款或折扣。",
    altTextMissing: "缺少圖片替代文字。",
    tooManyHashtags: "主題標籤過多。",
    jsonldMissing: "缺少 JSON-LD 結構化資料。",
    jsonldInvalid: "JSON-LD 結構無效，下次掃描將無法讀取。",
    jsonldMismatch: "JSON-LD 的問答與上方文字不一致。",
    titleTooLong: "標題超過 {detail} 字元。",
    bioTooLong: "簡介超過 {detail} 字元。",
    bodyTooLong: "內文超過 {detail} 字元。",
  },
  comparison: {
    SCORING_VERSION_MISMATCH: "評分方法轉咗，未可以同上次比",
    SCORING_VERSION_UNKNOWN: "唔知用緊邊套評分，未可以同上次比",
    NO_SHARED_MEASURED_MODULE: "上次同今次查到嘅嘢唔同，未可以比",
    INSUFFICIENT_INDEPENDENT_CHANNELS: "查到嘅來源太少，未可以比",
    NO_DIFF: "未有第二次掃描，未可以比",
    none: "未可以同上次比",
  },
  effort: "約 {minutes} 分鐘",
  altText: "圖片替代文字",
  actors: {
    user: "成員",
    agent: "Kinnso OS",
    system: "Kinnso OS",
    scanner: "掃描器",
    operator: "營運人員",
  },
  entities: {
    audit_job: "掃描",
    action: "行動",
    action_run: "草稿生成",
    agent_run: "Fix Pack 草稿",
    output_version: "版本",
    delivery: "交付",
    asset: "素材",
    brand_profile: "品牌資料",
    offer: "優惠",
    workspace: "工作台",
    workspace_member: "成員",
    workspace_access_request: "存取申請",
    oauth_connection: "連接",
  },
}

export const workspaceLabelsZhTW: WorkspaceLabelsCopy = {
  guardrails: {
    offerPriceMismatch: "優惠金額或幣別缺漏、不一致或不明確；確認前請確認已確認優惠。",
    offerDatesMissing: "優惠起訖日期缺漏或不一致；確認前請確認日期及年份。",
    offerProhibitedTerm: "包含優惠禁用用語；確認前請確認。",
    unexpectedLink: {
      approver: "包含你沒有提供的連結，確認前請先確認。",
      visitor: "包含你沒有提供的連結，使用前請先確認。",
    },
    unconfirmedClaim: {
      approver: "提到你未確認的價格或誇大用語，確認前請先確認。",
      visitor: "提到你未確認的價格或誇大用語，使用前請先確認。",
    },
    prohibitedTerm: "含品牌禁用詞：{detail}",
    compensationPromise: "似乎承諾補償、退款或折扣。",
    altTextMissing: "缺少圖片替代文字。",
    tooManyHashtags: "主題標籤過多。",
    jsonldMissing: "缺少 JSON-LD 結構化資料。",
    jsonldInvalid: "JSON-LD 結構無效，下次掃描將無法讀取。",
    jsonldMismatch: "JSON-LD 的問答與上方文字不一致。",
    titleTooLong: "標題超過 {detail} 字元。",
    bioTooLong: "簡介超過 {detail} 字元。",
    bodyTooLong: "內文超過 {detail} 字元。",
  },
  comparison: {
    SCORING_VERSION_MISMATCH: "評分版本不同",
    SCORING_VERSION_UNKNOWN: "評分版本未知",
    NO_SHARED_MEASURED_MODULE: "沒有共同已量度來源",
    INSUFFICIENT_INDEPENDENT_CHANNELS: "獨立來源不足",
    NO_DIFF: "尚未有第二次可比較的掃描",
    none: "尚無可比較掃描",
  },
  effort: "約 {minutes} 分鐘",
  altText: "圖片替代文字",
  actors: {
    user: "成員",
    agent: "Kinnso OS",
    system: "Kinnso OS",
    scanner: "掃描器",
    operator: "營運人員",
  },
  entities: {
    audit_job: "掃描",
    action: "行動",
    action_run: "草稿生成",
    agent_run: "Fix Pack 草稿",
    output_version: "版本",
    delivery: "交付",
    asset: "素材",
    brand_profile: "品牌資料",
    offer: "優惠",
    workspace: "工作台",
    workspace_member: "成員",
    workspace_access_request: "存取申請",
    oauth_connection: "連接",
  },
}
