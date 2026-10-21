import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { listen } from "../../../test/e2e/safety";

export const MODEL = "longcat-2.5-preview-free";
export const scriptDirectory = ".superpowers/sdd/review-usage-reliability-20261017";
export const directory = `${scriptDirectory}/live-${new Date().toISOString().replace(/[:.]/g, "-")}`;
mkdirSync(directory);
const endpoint = "https://opencode.ai/inference/go/v1/chat/completions";
export const ledger: Record<string, unknown>[] = [];
let fatal: string | null = null;
let holdNext = false, release: (() => void) | undefined;
export function holdNextResponse() { holdNext = true; }
export function releaseResponse() { release?.(); }

export function record(name: string, data: unknown) {
  writeFileSync(`${directory}/${name}.json`, JSON.stringify(data, null, 2));
}
export async function freeGate(key: string) {
  const response = await fetch("https://opencode.ai/docs/zen/", { signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new Error("official_pricing_unavailable");
  const plain = (await response.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  if (!/LongCat 2\.5 Preview Free\s+Free\s+Free\s+Free\s+-/.test(plain)
      || !plain.includes("LongCat 2.5 Preview Free is free on OpenCode for a limited time."))
    throw new Error("zero_budget_pricing_not_confirmed");
  const catalog = await fetch("https://opencode.ai/inference/go/v1/models", {
    headers: { authorization: `Bearer ${key}`, "user-agent": "sme-scanner/1.0" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!catalog.ok || !(await catalog.json()).data?.some((model: { id: string }) => model.id === MODEL))
    throw new Error("approved_free_model_not_in_catalog");
  const proof = { observedAt: new Date().toISOString(), model: MODEL, endpoint, budgetUsd: 0,
    pricing: "Free input, output and cache read; limited-time free model",
    sources: ["https://opencode.ai/docs/zen/", "https://opencode.ai/inference/go/v1/models"], fallbackAllowed: false,
    authorization: "User explicitly approved the Go endpoint on 2026-10-17; no production configuration change." };
  record("current-price-proof", proof);
  return proof;
}
export async function startLiveRelay() {
  const raw = readFileSync(".env.ai-uat.local", "utf8");
  const matches = [...raw.matchAll(/^\s*OPENCODE_API_KEY\s*=\s*(.+?)\s*$/gm)];
  if (matches.length !== 1) throw new Error("one_selected_key_required");
  const key = matches[0][1].trim().replace(/^(['"])(.*)\1$/, "$2");
  if (!key || /[\r\n]/.test(key)) throw new Error("invalid_selected_key");
  await freeGate(key);
  const server = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/opencode.ai/v1/chat/completions") { res.writeHead(404).end(); return; }
    const entry: Record<string, unknown> = { number: ledger.length + 1, startedAt: new Date().toISOString() };
    try {
      if (fatal || ledger.length >= 12) throw new Error(fatal ?? "bounded_call_limit_reached");
      if (req.headers.authorization !== "Bearer local-fixture-only") throw new Error("unexpected_local_client");
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const rawBody = Buffer.concat(chunks);
      const payload = JSON.parse(rawBody.toString("utf8"));
      if (payload.model !== MODEL || payload.thinking?.type !== "disabled" || payload.stream
          || payload.tools || payload.max_tokens > 4000 || !payload.response_format)
        throw new Error("unapproved_model_or_request");
      entry.freeGate = await freeGate(key);
      entry.requestedModel = MODEL;
      entry.promptSha256 = createHash("sha256").update(JSON.stringify(payload.messages)).digest("hex");
      entry.factChecks = {
        includesBranchA: JSON.stringify(payload.messages).includes("12 Branch A Road"),
        includesImportedAddress: JSON.stringify(payload.messages).includes("99 Imported B Street"),
        professionalVoice: JSON.stringify(payload.messages).includes("Voice: professional"),
        directVoice: JSON.stringify(payload.messages).includes("Voice: direct"),
      };
      ledger.push(entry);
      const hold = holdNext; holdNext = false;
      record("provider-ledger", ledger);
      const upstream = await fetch(endpoint, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(60_000),
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json",
          "user-agent": "sme-scanner/1.0",
          "x-opencode-session": String(req.headers["x-opencode-session"] ?? "isolated-uat") },
        body: rawBody,
      });
      entry.status = upstream.status;
      if (!upstream.ok) {
        entry.responseContentType = upstream.headers.get("content-type");
        entry.providerRequestId = upstream.headers.get("x-request-id");
        try {
          const failure = await upstream.json();
          for (const name of ["code", "type"]) {
            const value = failure?.error?.[name] ?? failure?.[name];
            if (typeof value === "string" && /^[a-zA-Z0-9_.-]{1,80}$/.test(value)) entry[`providerError${name}`] = value;
          }
        } catch {}
        if ([401, 402, 403].includes(upstream.status)) fatal = `provider_access_${upstream.status}`;
        res.writeHead(upstream.status, upstream.headers.get("retry-after") ? { "retry-after": upstream.headers.get("retry-after")! } : {}).end();
        return;
      }
      const text = await upstream.text();
      const data = JSON.parse(text);
      entry.responseModel = data.model ?? null;
      entry.responseId = data.id ?? null;
      entry.usage = data.usage ?? null;
      try {
        const output = JSON.parse(String(data.choices?.[0]?.message?.content ?? ""));
        entry.outputBodyPresent = typeof output.body === "string" && Boolean(output.body.trim());
        entry.outputFactsNeeded = Array.isArray(output.facts_needed)
          ? output.facts_needed.filter((value: unknown) => typeof value === "string" && /^[a-z_]{1,80}$/.test(value))
          : null;
      } catch {}
      const costs = [data.cost, data.usage?.cost, data.usage?.total_cost].filter(value => value !== undefined && value !== null);
      if (costs.some(value => !Number.isFinite(Number(value)) || Number(value) !== 0)) {
        fatal = "provider_reported_nonzero_or_invalid_cost";
        throw new Error(fatal);
      }
      if (data.model !== MODEL) {
        fatal = "response_model_mismatch";
        throw new Error(fatal);
      }
      // This relay serves only the uniquely owned isolated test fixture. Retain
      // its response (never headers/credentials) to diagnose withheld drafts.
      record(`provider-response-${entry.number}`, data);
      entry.reportedCostUsd = costs.length ? 0 : null;
      entry.costBasis = costs.length ? "provider-reported zero" : "official free pricing; response omitted cost; invoice not checked";
      if (hold) {
        entry.heldForLateUsageRegression = true;
        record("provider-ledger", ledger);
        await new Promise<void>(resolve => {
          const timer = setTimeout(resolve, 60_000);
          release = () => { clearTimeout(timer); resolve(); release = undefined; };
        });
      }
      res.writeHead(200, { "content-type": "application/json" }).end(text);
    } catch (error) {
      entry.error = error instanceof Error && /^[a-z0-9_]+$/.test(error.message) ? error.message : "relay_request_failed";
      if (!ledger.includes(entry)) ledger.push(entry);
      res.writeHead(503).end();
    } finally {
      entry.finishedAt = new Date().toISOString();
      record("provider-ledger", ledger);
    }
  });
  const url = await listen(server);
  return { url, stop: () => new Promise<void>(resolve => server.close(() => resolve())) };
}
