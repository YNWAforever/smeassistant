/**
 * Human-readable fallback for a finding whose label is missing from the message
 * files: "gbp.reviews_volume_low" becomes "reviews volume low".
 *
 * Finding keys are produced by packages/scoring and their labels live in
 * messages/*.json, so the two can drift — a new key ships before its copy does.
 * next-intl does not throw on a missing message, it returns the key path, so
 * without a fallback an untranslated finding renders as
 * "report.findingGbpReviewsVolumeLow". On the screen that is merely ugly; on the
 * printed sales document it reaches a prospect's inbox.
 */
export function readableFindingKey(key: string): string {
  return key.split(".").pop()?.replaceAll("_", " ") ?? key;
}

/**
 * Maps a scoring finding key to its message key inside the `report` namespace:
 * "gbp.reviews_volume_low" → "findingGbpReviewsVolumeLow".
 *
 * Exported rather than kept beside its caller so the copy-coverage test asserts
 * against the mapping actually used at runtime instead of reimplementing it —
 * a test with its own copy of this transform would agree with itself while
 * disagreeing with the document.
 */
export function findingMessageKey(findingKey: string): string {
  const [module = "", rest = ""] = findingKey.split(".");
  const pascal = rest.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
  return `finding${module.charAt(0).toUpperCase()}${module.slice(1)}${pascal}`;
}

/**
 * Resolve a finding key to its translated label through an already-created
 * translator, falling back to the humanized raw key when the message is
 * missing. next-intl does not throw on a missing message — it returns the
 * key path, sometimes namespace-prefixed — so both forms are checked.
 * Shared by the report print document and the owner fix-pack list; a copy in
 * each caller would drift.
 */
export function resolveFindingLabel(t: (key: string) => string, findingKey: string): string {
  const messageKey = findingMessageKey(findingKey);
  const label = t(messageKey);
  return label === messageKey || label === `report.${messageKey}`
    ? readableFindingKey(findingKey)
    : label;
}
