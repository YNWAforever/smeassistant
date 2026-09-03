// Cheap, deterministic name variants beyond the raw business/GBP name, so the exact-alias matcher
// (and the fuzzy fallback behind it) has more to work with — e.g. "The Hong Kong Medical Central
// Club" also matches as "Hong Kong Medical Central Club".
export function nameVariants(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return [];
  const variants = new Set<string>([trimmed]);
  const withoutThe = trimmed.replace(/^the\s+/i, "");
  if (withoutThe !== trimmed) variants.add(withoutThe);
  // Latin legal suffixes must be separate words (`\s+`) so names that merely END in those letters
  // ("Tesco", "COSCO", "Fitness Unlimited") are not truncated into bogus aliases; 有限公司 is
  // written without a preceding space, so it alone gets `\s*`.
  const withoutSuffix = withoutThe.replace(/(?:\s+(?:ltd\.?|limited|company|co\.?)|\s*有限公司)$/i, "").trim();
  if (withoutSuffix && withoutSuffix !== withoutThe) variants.add(withoutSuffix);
  const noPunctuation = withoutSuffix.replace(/[^\p{L}\p{N}]+/gu, "");
  if (noPunctuation) variants.add(noPunctuation);
  return [...variants];
}
