/**
 * Splits Chinese display copy into words (Intl.Segmenter, ICU dictionary) so a
 * headline can wrap only between words — never inside one (找/到) — while
 * `text-wrap: balance` evens the lines. Punctuation stays on the word before
 * it, so a line never starts with "，" or "。".
 *
 * Run it on the server and pass the result down: the browser's ICU dictionary
 * may segment differently, which would break hydration if both computed it.
 * Text without Han characters is returned whole (spaces already break it).
 */
export function phrases(text: string, locale: string): string[] {
  if (!/\p{Script=Han}/u.test(text) || typeof Intl.Segmenter !== "function") return [text];
  const out: string[] = [];
  for (const { segment, isWordLike } of new Intl.Segmenter(locale, { granularity: "word" }).segment(text)) {
    if (!isWordLike && out.length > 0) out[out.length - 1] += segment;
    else out.push(segment);
  }
  return out;
}
