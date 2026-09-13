import { localized, type LocalizedText } from "@/lib/domain";
import type { WebsiteCheckKey } from "@/lib/website/checks";

export interface FaqQuestion {
  key: "owner_fact_1" | "owner_fact_2" | "owner_fact_3";
  question: LocalizedText;
  /** A brand_profiles.facts key whose stored value can prefill this question's answer. Null for an AEO-derived question -- no canonical brand fact answers an arbitrary search query. */
  brandFactKey: string | null;
}

const CHECK_QUESTIONS: Partial<Record<WebsiteCheckKey, { question: LocalizedText; brandFactKey: string }>> = {
  opening_hours_text: {
    question: localized("What are your opening hours?", "你嘅營業時間係幾多？", "您的營業時間是幾點到幾點？"),
    brandFactKey: "opening_hours",
  },
  contact_or_booking_link: {
    question: localized("How should a customer book or contact you?", "顧客應該點樣預約或聯絡你？", "顧客應該如何預約或聯絡您？"),
    brandFactKey: "booking_contact",
  },
  address_present: {
    question: localized("What is your exact address?", "你嘅確實地址係邊度？", "您的確實地址是哪裡？"),
    brandFactKey: "address",
  },
  phone_present: {
    question: localized("What is your contact phone number?", "你嘅聯絡電話係幾多？", "您的聯絡電話是幾號？"),
    brandFactKey: "phone",
  },
};

const GENERIC_FALLBACK_QUESTIONS: LocalizedText[] = [
  localized("What should a customer know before visiting?", "顧客到訪前應該知道咩？", "顧客到訪前應該知道什麼？"),
  localized("What is your booking or reservation policy?", "你嘅預約政策係點㗎？", "您的預約政策是什麼？"),
  localized("Do you offer options for dietary restrictions or allergies?", "有冇提供飲食限制或致敏原嘅選擇？", "是否有提供飲食限制或過敏原的選擇？"),
];

function aeoQuestion(query: string): LocalizedText {
  return localized(
    `What should customers searching "${query}" find on your site?`,
    `顧客搜尋「${query}」時，你嘅網站應該畀佢哋睇到咩？`,
    `顧客搜尋「${query}」時，您的網站應該讓他們看到什麼？`,
  );
}

export interface DeriveFaqQuestionsInput {
  /** Failing website check keys, in the order runWebsiteChecks produced them. */
  failingWebsiteChecks: readonly WebsiteCheckKey[];
  /** Distinct un-cited AEO query texts for the job -- the exact "search and AI surfaces could not find" evidence. */
  aeoQueries: readonly string[];
}

/**
 * The FAQ + JSON-LD template asks for exactly three owner_fact_* inputs
 * (lib/agents/agents/faq-jsonld.ts). Before this, the form showed three
 * blank "Owner fact N" boxes and neither the owner nor the model knew which
 * customer questions were actually unanswered (P2.3 item 11).
 *
 * Derived from the same evidence that created the action: AEO queries the
 * business was not cited for come first (the most concrete "a real search
 * asked this and did not find you" signal), then failing content-relevant
 * website checks, padded with generic fallbacks so the form always has
 * exactly three. Deliberately excludes the purely technical checks (https,
 * canonical, viewport, html_lang, og_image, faq_schema itself): those are
 * not facts an owner can answer in an FAQ.
 */
export function deriveFaqQuestions(input: DeriveFaqQuestionsInput): FaqQuestion[] {
  const candidates: Array<{ question: LocalizedText; brandFactKey: string | null }> = [];
  const seenQueries = new Set<string>();
  for (const query of input.aeoQueries) {
    if (candidates.length >= 3) break;
    const clean = query.trim();
    if (!clean || seenQueries.has(clean)) continue;
    seenQueries.add(clean);
    candidates.push({ question: aeoQuestion(clean), brandFactKey: null });
  }
  for (const check of input.failingWebsiteChecks) {
    if (candidates.length >= 3) break;
    const mapped = CHECK_QUESTIONS[check];
    if (mapped) candidates.push({ question: mapped.question, brandFactKey: mapped.brandFactKey });
  }
  for (const fallback of GENERIC_FALLBACK_QUESTIONS) {
    if (candidates.length >= 3) break;
    candidates.push({ question: fallback, brandFactKey: null });
  }
  return candidates.slice(0, 3).map((candidate, index) => ({
    key: `owner_fact_${index + 1}` as FaqQuestion["key"],
    question: candidate.question,
    brandFactKey: candidate.brandFactKey,
  }));
}
