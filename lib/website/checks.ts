/**
 * Website checks (CLAUDE.md §3.6.2). Fifteen display-only checks run at snapshot
 * build time with a short fetch, never inside scan-engine. They feed
 * `scan_snapshots.website_checks` and the `website.*` metrics; scoring inputs
 * are unchanged (guardrail 3: never a second score).
 *
 * Deliberately regex-based: the checks are coarse presence tests, and adding an
 * HTML parser for them would be a new runtime dependency for no accuracy gain.
 */

export const WEBSITE_CHECK_KEYS = [
  "reachable",
  "https",
  "title",
  "meta_description_50_160",
  "single_h1",
  "canonical",
  "viewport",
  "html_lang",
  "og_image",
  "faq_schema",
  "local_business_schema",
  "opening_hours_text",
  "phone_present",
  "address_present",
  "contact_or_booking_link",
] as const;

export type WebsiteCheckKey = (typeof WEBSITE_CHECK_KEYS)[number];

export interface WebsiteCheckResult {
  key: WebsiteCheckKey;
  pass: boolean;
  detail?: string;
}

export interface WebsiteChecks {
  evaluated: number;
  passed: number;
  results: WebsiteCheckResult[];
}

export const EMPTY_WEBSITE_CHECKS: WebsiteChecks = { evaluated: 0, passed: 0, results: [] };

export interface RunWebsiteChecksOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_BYTES = 512 * 1024;

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  if (!match) return null;
  return (match[2] ?? match[3] ?? match[4] ?? "").trim();
}

function metaContent(html: string, predicate: (tag: string) => boolean): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (predicate(tag)) return attr(tag, "content");
  }
  return null;
}

function linkHref(html: string, rel: string): string | null {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const relValue = attr(tag, "rel");
    if (relValue && relValue.toLowerCase().split(/\s+/).includes(rel)) return attr(tag, "href");
  }
  return null;
}

function jsonLdBlocks(html: string): string[] {
  const blocks: string[] = [];
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) blocks.push(match[1]);
  return blocks;
}

function jsonLdHasType(html: string, types: string[]): boolean {
  const wanted = types.map((t) => t.toLowerCase());
  return jsonLdBlocks(html).some((block) => {
    const typeValues = block.match(/"@type"\s*:\s*("[^"]+"|\[[^\]]*\])/gi) ?? [];
    return typeValues.some((value) => wanted.some((t) => value.toLowerCase().includes(`"${t}"`)));
  });
}

function stripTags(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

/** Pure inspection of already-fetched HTML; exported so tests need no network. */
export function inspectHtml(html: string, finalUrl: string): WebsiteCheckResult[] {
  const text = stripTags(html);
  const results: WebsiteCheckResult[] = [];
  const push = (key: WebsiteCheckKey, pass: boolean, detail?: string) =>
    results.push(detail ? { key, pass, detail } : { key, pass });

  push("reachable", true);
  push("https", /^https:/i.test(finalUrl), finalUrl.split("/")[0]);

  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
  push("title", title.length > 0, title ? `${title.length} chars` : "missing");

  const description = metaContent(html, (tag) => (attr(tag, "name") ?? "").toLowerCase() === "description") ?? "";
  push("meta_description_50_160", description.length >= 50 && description.length <= 160, `${description.length} chars`);

  const h1Count = (html.match(/<h1\b/gi) ?? []).length;
  push("single_h1", h1Count === 1, `${h1Count} h1`);

  push("canonical", Boolean(linkHref(html, "canonical")));
  push("viewport", Boolean(metaContent(html, (tag) => (attr(tag, "name") ?? "").toLowerCase() === "viewport")));

  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0];
  push("html_lang", Boolean(htmlTag && attr(htmlTag, "lang")));

  push(
    "og_image",
    Boolean(metaContent(html, (tag) => (attr(tag, "property") ?? attr(tag, "name") ?? "").toLowerCase() === "og:image")),
  );
  push("faq_schema", jsonLdHasType(html, ["FAQPage"]));
  push(
    "local_business_schema",
    jsonLdHasType(html, ["LocalBusiness", "Restaurant", "Store", "FoodEstablishment", "Cafe", "CafeOrCoffeeShop", "Bakery", "Bar"]),
  );

  const hoursPattern =
    /(opening hours|open(?:ing)? (?:times|hours)|營業時間|開放時間|\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\b[^.]{0,40}\d{1,2}(?::\d{2})?\s*(?:am|pm|:)?)/i;
  push("opening_hours_text", hoursPattern.test(text) || /"openingHours(?:Specification)?"/i.test(html));

  const phonePattern = /\+?\d[\d\s().-]{6,}\d/;
  push("phone_present", phonePattern.test(text) || /href\s*=\s*["']tel:/i.test(html));

  const addressPattern =
    /(\b(?:road|rd\.?|street|st\.?|avenue|ave\.?|lane|building|floor|shop|unit)\b[^.]{0,60}\d|\d+[^.]{0,60}\b(?:road|rd\.?|street|st\.?|avenue|ave\.?)\b|路|街|道|大廈|樓|號)/i;
  push("address_present", addressPattern.test(text) || /"streetAddress"/i.test(html));

  const contactPattern =
    /href\s*=\s*["'][^"']*(contact|book|booking|reserve|reservation|order|whatsapp|wa\.me|line\.me|tel:|mailto:|inline\.app|openrice|eatigo|quandoo)[^"']*["']/i;
  push("contact_or_booking_link", contactPattern.test(html));

  return results;
}

export function summarise(results: WebsiteCheckResult[]): WebsiteChecks {
  return { evaluated: results.length, passed: results.filter((r) => r.pass).length, results };
}

export async function runWebsiteChecks(url: string, opts: RunWebsiteChecksOptions = {}): Promise<WebsiteChecks> {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let target: URL;
  try {
    target = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    return EMPTY_WEBSITE_CHECKS;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await doFetch(target.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": "SMEScannerWorkspace/1.0 (+website-checks)", accept: "text/html,application/xhtml+xml" },
    });
    if (!response.ok) return EMPTY_WEBSITE_CHECKS;
    const html = (await response.text()).slice(0, MAX_BYTES);
    return summarise(inspectHtml(html, response.url || target.toString()));
  } catch {
    // Unreachable, timed out, TLS failure: website state becomes `unavailable`
    // (evaluated = 0). Never guess a partial result.
    return EMPTY_WEBSITE_CHECKS;
  } finally {
    clearTimeout(timer);
  }
}
