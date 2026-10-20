import type { PrototypeLocale } from "@/lib/copy"

/**
 * Strings for app/global-error.tsx only. That boundary replaces the root
 * layout, so no LocaleDataProvider has run and `copy[locale]` is unavailable
 * in the browser; these few lines ship with it instead, in every locale.
 */
export const fatalCopy: Record<PrototypeLocale, { title: string; body: string; retry: string; home: string; reference: string }> = {
  en: { title: "Something went wrong", body: "Kinnso OS could not load this page. Your work is safe.", retry: "Try again", home: "Go to the home page", reference: "Reference: {code}" },
  "zh-HK": { title: "出現問題", body: "Kinnso OS 未能載入此頁。你的工作不受影響。", retry: "再試一次", home: "前往首頁", reference: "參考編號：{code}" },
  "zh-TW": { title: "發生問題", body: "Kinnso OS 無法載入這個頁面。你的工作不受影響。", retry: "再試一次", home: "前往首頁", reference: "參考編號：{code}" },
}
