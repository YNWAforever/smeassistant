import type { Locale } from "./locale";

export const identityMessages: Record<Locale, { unavailable: string }> = {
  en: { unavailable: "We couldn't verify your session right now. Please reload this page shortly." },
  "zh-HK": { unavailable: "暫時未能驗證你的登入狀態，請稍後重新載入此頁。" },
  "zh-TW": { unavailable: "暫時無法驗證你的登入狀態，請稍後重新載入此頁。" },
};
