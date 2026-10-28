import "server-only";
import { isIP } from "node:net";
import { z } from "zod";
import type { ConnectorContext, ContextItem } from "./types";
import { boundedJson, providerFailure } from "./http";
import { researchBudgetRepository, type ResearchBudgetInput, type ResearchBudgetRepository, type ResearchProvider, type ResearchSettlement } from "@/lib/repositories/research-budget";
import { conversationHomeEnabled } from "@/lib/workspace/conversation-flag";

export interface ResearchInput { workspaceId: string; locationId: string | null; provider: ResearchProvider; url: string | null; market: string; keyword?: string }
export interface ResearchDependencies { env?: Record<string, string | undefined>; budget?: ResearchBudgetRepository; fetch?: typeof fetch; now?: () => Date }
interface Configuration { accountId: string; workspaceLimitUsd: number; accountLimitUsd: number; ceilingUsd: number; authorization: string }
const markets = { hk: 2344, tw: 2158 } as const;

function positiveUsd(value: string | undefined): number | null {
  if (!value || !/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1_000_000 ? parsed : null;
}
function configuration(provider: ResearchProvider, env: Record<string, string | undefined>): Configuration | null {
  if (!conversationHomeEnabled(env) || env.CONVERSATION_RESEARCH_PRICING_VERIFIED !== "true") return null;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(env.CONVERSATION_RESEARCH_ACCOUNT_ID ?? "")) return null;
  const workspaceLimitUsd = positiveUsd(env.CONVERSATION_RESEARCH_WORKSPACE_MONTHLY_USD), accountLimitUsd = positiveUsd(env.CONVERSATION_RESEARCH_ACCOUNT_MONTHLY_USD);
  const ceilingUsd = positiveUsd(provider === "firecrawl" ? env.FIRECRAWL_MAX_CALL_USD : env.DATAFORSEO_MAX_CALL_USD);
  if (workspaceLimitUsd === null || accountLimitUsd === null || ceilingUsd === null) return null;
  if (provider === "firecrawl") {
    if (env.CONVERSATION_FIRECRAWL_ENABLED !== "true" || !env.FIRECRAWL_API_KEY?.trim()) return null;
    return { accountId: env.CONVERSATION_RESEARCH_ACCOUNT_ID!, workspaceLimitUsd, accountLimitUsd, ceilingUsd, authorization: `Bearer ${env.FIRECRAWL_API_KEY}` };
  }
  if (provider !== "dataforseo" || env.CONVERSATION_DATAFORSEO_ENABLED !== "true" || !env.DATAFORSEO_LOGIN?.trim() || !env.DATAFORSEO_PASSWORD?.trim()) return null;
  return { accountId: env.CONVERSATION_RESEARCH_ACCOUNT_ID!, workspaceLimitUsd, accountLimitUsd, ceilingUsd, authorization: `Basic ${Buffer.from(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`).toString("base64")}` };
}

/** Only ordinary public web URLs are sent to a provider; URL parsing also canonicalizes numeric IPv4. */
function publicUrl(value: string | null): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value), host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) return null;
    if (!host.includes(".") && !isIP(host)) return null;
    if (["localhost", "local", "internal", "invalid", "test"].some(suffix => host === suffix || host.endsWith(`.${suffix}`))) return null;
    if (isIP(host) === 4) {
      const [a, b] = host.split(".").map(Number);
      if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) || (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0)) return null;
    } else if (isIP(host) === 6) {
      // Global-unicast only; exclude documentation and transition networks as well.
      if (!/^[23][0-9a-f]{3}:/.test(host) || /^(2001:(db8|0):|2002:)/.test(host)) return null;
    }
    return url.href;
  } catch { return null; }
}
function base(input: ResearchInput): ConnectorContext { return { source: input.provider, status: "disabled", observedAt: null, scope: input.url ?? "", items: [] }; }
function supported(input: ResearchInput, env: Record<string, string | undefined>): boolean {
  if (!Object.hasOwn(markets, input.market)) return false;
  if (input.provider !== "dataforseo") return true;
  return (env.DATAFORSEO_MARKETS ?? "").split(",").map(value => value.trim()).includes(input.market);
}
function budgetInput(input: ResearchInput, config: Configuration, now: Date): ResearchBudgetInput {
  return { workspaceId: input.workspaceId, locationId: input.locationId, provider: input.provider, accountId: config.accountId, workspaceLimitUsd: config.workspaceLimitUsd, accountLimitUsd: config.accountLimitUsd, ceilingUsd: config.ceilingUsd, now };
}
export async function researchStatus(input: ResearchInput, deps: ResearchDependencies = {}): Promise<ConnectorContext> {
  const result = base(input), env = deps.env ?? process.env, config = configuration(input.provider, env);
  if (!config) return { ...result, reason: "research_disabled" };
  if (!supported(input, env)) return { ...result, status: "unsupported", reason: "market_unsupported" };
  if (!publicUrl(input.url)) return { ...result, status: "unsupported", reason: "website_unsupported" };
  try {
    const status = await (deps.budget ?? researchBudgetRepository()).status(budgetInput(input, config, (deps.now ?? (() => new Date()))()));
    return { ...result, status: status.allowed ? "empty" : "blocked", reason: status.reason ?? "research_available", budget: status.budget };
  } catch { return { ...result, status: "failed", reason: "budget_unavailable" }; }
}

/** The explicit timer bounds fetch AND body decoding, even if a transport ignores abort. */
async function requestJson(url: string, body: unknown, authorization: string, fetcher: typeof fetch): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new DOMException("deadline", "TimeoutError")); }, 15000);
  });
  try {
    return await Promise.race([deadline, (async () => {
      const response = await fetcher(url, { method: "POST", headers: { Authorization: authorization, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal, redirect: "error", cache: "no-store" });
      // Error bodies may contain billable cost information, so read bounded JSON before checking HTTP status.
      const payload = await boundedJson(response);
      return { payload, httpOk: response.ok };
    })()]);
  } finally { if (timer) clearTimeout(timer); }
}
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const money = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
function reportedCost(provider: ResearchProvider, payload: unknown, ceiling: number): number | undefined {
  const root = record(payload);
  if (!root) return undefined;
  if (provider === "firecrawl") {
    const credits = money(record(record(root.data)?.metadata)?.creditsUsed);
    return credits === undefined ? undefined : credits * ceiling;
  }
  const rootCost = money(root.cost), tasks = Array.isArray(root.tasks) ? root.tasks : [];
  const taskCosts = tasks.map(task => money(record(task)?.cost));
  const total = taskCosts.reduce<number>((sum, cost) => sum + (cost ?? 0), 0);
  return rootCost === undefined && taskCosts.every(cost => cost === undefined) ? undefined : Math.max(rootCost ?? 0, total);
}
type Parsed = { status: ResearchSettlement["outcome"]; items: ContextItem[]; reason?: string };
function parseFirecrawl(payload: unknown, url: string): Parsed {
  const root = record(payload), data = record(root?.data);
  if (root?.success !== true || !data || typeof data.markdown !== "string") return { status: "failed", items: [], reason: "provider_failed" };
  const metadata = record(data.metadata), statusCode = metadata?.statusCode;
  if (typeof statusCode === "number" && (!Number.isInteger(statusCode) || statusCode < 200 || statusCode >= 300) || metadata?.error || data.error) return { status: "failed", items: [], reason: "provider_failed" };
  let partial = !metadata || typeof statusCode !== "number" || !Number.isInteger(statusCode) || Boolean(data.warning) || data.markdown.length > 20000;
  const title = z.string().trim().min(1).max(500).safeParse(metadata?.title);
  if (metadata?.title !== undefined && !title.success) partial = true;
  const source = typeof metadata?.sourceURL === "string" ? publicUrl(metadata.sourceURL) : null;
  if (metadata?.sourceURL !== undefined && !source) partial = true;
  if (!data.markdown.trim()) return { status: partial ? "partial" : "empty", items: [], ...(partial ? { reason: "bounded_results" } : {}) };
  return { status: partial ? "partial" : "ready", items: [{ title: title.success ? title.data : new URL(url).hostname, text: data.markdown.slice(0, 20000), url: source ?? url }], ...(partial ? { reason: "bounded_results" } : {}) };
}
const organic = z.object({ type: z.literal("organic"), title: z.string().trim().min(1).max(500), url: z.string().max(2048).refine(value => publicUrl(value) !== null), description: z.string().max(5000).nullable().optional(), rank_group: z.number().int().positive().max(1000) });
const serpEnvelope = z.object({ status_code: z.literal(20000), cost: z.number().finite().nonnegative(), tasks_count: z.literal(1), tasks_error: z.literal(0), tasks: z.tuple([z.object({ status_code: z.literal(20000), cost: z.number().finite().nonnegative(), result_count: z.literal(1), result: z.tuple([z.object({ keyword: z.string().max(700), location_code: z.number().int(), language_code: z.literal("en"), pages_count: z.literal(1), items_count: z.number().int().nonnegative(), items: z.array(z.unknown()).max(100).nullable() })]) })]) });
function parseSerp(payload: unknown, market: string, keyword: string): Parsed {
  const parsed = serpEnvelope.safeParse(payload);
  if (!parsed.success) return { status: "failed", items: [], reason: "provider_failed" };
  const data = parsed.data.tasks[0].result[0];
  if (data.location_code !== markets[market as keyof typeof markets] || data.keyword !== keyword) return { status: "failed", items: [], reason: "provider_failed" };
  const rows = data.items ?? [], items: ContextItem[] = [];
  let partial = data.items_count !== rows.length;
  for (const row of rows) {
    if (["paid", "featured_snippet"].includes(String(record(row)?.type))) continue;
    const item = organic.safeParse(row);
    if (!item.success) { partial = true; continue; }
    if (items.length === 10) { partial = true; continue; }
    items.push({ title: item.data.title, url: publicUrl(item.data.url)!, ...(item.data.description ? { text: item.data.description } : {}), metrics: { position: item.data.rank_group } });
  }
  if (rows.length && !items.length && partial) return { status: "failed", items: [], reason: "provider_failed" };
  return { status: partial ? "partial" : items.length ? "ready" : "empty", items, ...(partial ? { reason: "bounded_results" } : {}) };
}
export async function runResearch(input: ResearchInput, deps: ResearchDependencies = {}): Promise<ConnectorContext> {
  const result = base(input), env = deps.env ?? process.env, config = configuration(input.provider, env);
  if (!config) return { ...result, reason: "research_disabled" };
  if (!supported(input, env)) return { ...result, status: "unsupported", reason: "market_unsupported" };
  const url = publicUrl(input.url), keyword = input.keyword?.trim();
  if (!url) return { ...result, status: "unsupported", reason: "website_unsupported" };
  if (input.provider === "dataforseo" && (!keyword || keyword.length > 700 || /[\u0000-\u001f]/.test(keyword))) return { ...result, status: "unsupported", reason: "keyword_required" };
  const now = (deps.now ?? (() => new Date()))(), ledger = deps.budget ?? researchBudgetRepository(), request = budgetInput(input, config, now);
  let reservation;
  try { reservation = await ledger.reserve(request); }
  catch { return { ...result, status: "failed", reason: "budget_unavailable" }; }
  if (!reservation.allowed) return { ...result, status: "blocked", reason: reservation.reason, budget: reservation.budget };
  let parsed: Parsed, reportedUsd: number | undefined;
  try {
    const endpoint = input.provider === "firecrawl" ? "https://api.firecrawl.dev/v2/scrape" : "https://api.dataforseo.com/v3/serp/google/organic/live/regular";
    // Empty parsers + basic proxy avoid automatic document OCR and premium proxy charges.
    const body = input.provider === "firecrawl" ? { url, formats: ["markdown"], parsers: [], proxy: "basic", onlyMainContent: true, timeout: 10000, maxAge: 0 } : [{ keyword, location_code: markets[input.market as keyof typeof markets], language_code: "en", depth: 10, max_crawl_pages: 1, device: "desktop", os: "windows" }];
    const response = await requestJson(endpoint, body, config.authorization, deps.fetch ?? fetch) as { payload: unknown; httpOk: boolean };
    reportedUsd = reportedCost(input.provider, response.payload, config.ceilingUsd);
    parsed = !response.httpOk ? { status: "failed", items: [], reason: "provider_failed" } : input.provider === "firecrawl" ? parseFirecrawl(response.payload, url) : parseSerp(response.payload, input.market, keyword!);
  } catch (error) { parsed = { status: "failed", items: [], reason: providerFailure(error) }; }
  const scoped = { ...result, scope: input.provider === "dataforseo" ? `${input.market}: ${keyword}` : url, observedAt: now.toISOString(), ...parsed, budget: reservation.budget };
  try {
    const settled = await ledger.settle({ ...request, reservationId: reservation.reservationId, outcome: parsed.status, reportedUsd });
    return { ...scoped, budget: settled.budget, ...(!settled.allowed ? { status: "blocked" as const, reason: settled.reason } : {}) };
  } catch { return { ...scoped, status: "failed", reason: "budget_unavailable" }; }
}
