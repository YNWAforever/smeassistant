export type ScanEvent =
  | { name: "scan_started"; properties: { market: "HK" | "TW"; locale: string } }
  | { name: "scan_completed"; properties: { outcome: "done" | "partial" | "failed"; coverage: number } }
  | { name: "report_preview_viewed"; properties: { market: "HK" | "TW" } }
  | { name: "report_unlocked"; properties: { market: "HK" | "TW"; channel: string; objective: string } }
  | { name: "full_report_viewed"; properties: { access: "viewer" | "staff" } }
  | { name: "cta_clicked"; properties: { cta: string; market: "HK" | "TW" } };
