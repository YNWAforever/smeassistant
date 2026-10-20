/**
 * Report page strings added in the Phase 3 rebuild, reached as
 * copy[locale].report. The existing report strings stay in
 * copy[locale].funnel.report. zh-HK is Hong Kong written Chinese, zh-TW uses
 * Taiwan terms (店家).
 */

export type ReportUiCopy = {
  doThisFirst: string
  nextUp: string
  whyItMatters: string
  whatToDo: string
  source: string
  scannedOn: string
  dateNotRecorded: string
  notMeasuredNote: string
  filters: { label: string; severity: string; source: string; all: string; showing: string; none: string }
  actions: {
    label: string
    save: string
    copyLink: string
    copied: string
    copyFailed: string
    shareHint: string
    print: string
  }
}

export const reportEn: ReportUiCopy = {
  doThisFirst: "Do this first",
  nextUp: "Next up",
  whyItMatters: "Why it matters",
  whatToDo: "What to do next",
  source: "Source",
  scannedOn: "Scanned {date}",
  dateNotRecorded: "Date not recorded",
  notMeasuredNote: "This source was not measured in this scan.",
  filters: {
    label: "Filter findings",
    severity: "Priority",
    source: "Source",
    all: "All",
    showing: "Showing {shown} of {total} findings",
    none: "No findings match these filters.",
  },
  actions: {
    label: "Report actions",
    save: "Save to my workspace",
    copyLink: "Copy link",
    copied: "Link copied",
    copyFailed: "Could not copy the link",
    shareHint: "People you send it to see the free preview.",
    print: "Print or save as PDF",
  },
}

export const reportZhHK: ReportUiCopy = {
  doThisFirst: "先做這一步",
  nextUp: "之後再做",
  whyItMatters: "為何重要",
  whatToDo: "下一步",
  source: "來源",
  scannedOn: "{date} 掃描",
  dateNotRecorded: "未有記錄日期",
  notMeasuredNote: "今次掃描未有量度這個來源。",
  filters: {
    label: "篩選發現",
    severity: "優先次序",
    source: "來源",
    all: "全部",
    showing: "顯示 {total} 項中的 {shown} 項發現",
    none: "沒有符合篩選條件的發現。",
  },
  actions: {
    label: "報告操作",
    save: "儲存到我的工作台",
    copyLink: "複製連結",
    copied: "已複製連結",
    copyFailed: "未能複製連結",
    shareHint: "收到連結的人只會看到免費預覽。",
    print: "列印或儲存為 PDF",
  },
}

export const reportZhTW: ReportUiCopy = {
  doThisFirst: "先做這一步",
  nextUp: "接著再做",
  whyItMatters: "為什麼重要",
  whatToDo: "下一步",
  source: "來源",
  scannedOn: "{date} 掃描",
  dateNotRecorded: "未記錄日期",
  notMeasuredNote: "這次掃描沒有量測這個來源。",
  filters: {
    label: "篩選發現",
    severity: "優先順序",
    source: "來源",
    all: "全部",
    showing: "顯示 {total} 項中的 {shown} 項發現",
    none: "沒有符合篩選條件的發現。",
  },
  actions: {
    label: "報告操作",
    save: "儲存到我的工作台",
    copyLink: "複製連結",
    copied: "已複製連結",
    copyFailed: "無法複製連結",
    shareHint: "收到連結的人只會看到免費預覽。",
    print: "列印或儲存為 PDF",
  },
}
