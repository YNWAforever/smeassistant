import type { RawData } from "@sme-scanner/contracts";
import {
  deriveTrustProvider,
  type ClaimedScanJob,
  type ProviderConfidence,
  type ProviderResult,
  type ScanProviderCollection,
  type ScanProviderCollector,
} from "@sme-scanner/scan-engine";
import type { AEOPayload, GBPPayload, IGPayload } from "@sme-scanner/scoring";
import kamManHouse from "@/scripts/fixtures/kam-man-house.json";
import twCafe from "@/scripts/fixtures/tw-cafe.json";
import unavailableIg from "@/scripts/fixtures/unavailable-ig.json";

/**
 * Deterministic provider payloads for `SCAN_SOURCES=fixture` (CLAUDE.md 3.2.1).
 *
 * A fixture is one `ProviderCollection<IGPayload, GBPPayload, AEOPayload>` plus
 * the `RawData` the report's proof panels read, stored as JSON under
 * scripts/fixtures/. `processScan` is unchanged; only the `collect` dependency
 * differs, so a fixture scan writes the same audit_jobs / audit_findings rows
 * a live scan would, through the same scorer.
 */
export const SCAN_FIXTURE_NAMES = ["kam-man-house", "tw-cafe", "unavailable-ig"] as const;
export type ScanFixtureName = (typeof SCAN_FIXTURE_NAMES)[number];

export function isScanFixtureName(value: unknown): value is ScanFixtureName {
  return typeof value === "string" && (SCAN_FIXTURE_NAMES as readonly string[]).includes(value);
}

/** A `ProviderResult` minus `collectedAt`, which the collector stamps at scan time. */
export type FixtureProvider<T> =
  | { status: "measured"; confidence: ProviderConfidence; data: T }
  | { status: "unavailable" | "unsupported"; limitationCode: string }
  | { status: "failed"; limitationCode: string; retryable: boolean };

export interface ScanFixture {
  name: ScanFixtureName;
  market: "hk" | "tw";
  /**
   * Anchor for every ISO timestamp inside the fixture (post dates, review
   * dates, latest photo). The collector shifts them all by `now - collectedAt`
   * so "days since last post" is the same on every scan date, which keeps the
   * scores a fixture produces stable over time.
   */
  collectedAt: string;
  ig: FixtureProvider<IGPayload>;
  gbp: FixtureProvider<GBPPayload>;
  aeo: FixtureProvider<AEOPayload>;
  raw: RawData;
}

const SOURCES: Record<ScanFixtureName, unknown> = {
  "kam-man-house": kamManHouse,
  "tw-cafe": twCafe,
  "unavailable-ig": unavailableIg,
};

const CONFIDENCES: readonly ProviderConfidence[] = ["high", "medium", "low"];
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(detail: string): never {
  throw new Error(`scan_fixture_invalid: ${detail}`);
}

function parseProvider<T extends { available: boolean }>(key: string, value: unknown): FixtureProvider<T> {
  if (!isRecord(value)) invalid(`${key} must be an object`);
  const status = value.status;
  if (status === "measured") {
    const confidence = value.confidence;
    if (!CONFIDENCES.includes(confidence as ProviderConfidence)) invalid(`${key}.confidence must be high|medium|low`);
    if (!isRecord(value.data) || value.data.available !== true) invalid(`${key}.data must be an available payload`);
    return { status, confidence: confidence as ProviderConfidence, data: value.data as unknown as T };
  }
  if (typeof value.limitationCode !== "string" || !value.limitationCode) invalid(`${key}.limitationCode is required`);
  if (status === "unavailable" || status === "unsupported") return { status, limitationCode: value.limitationCode };
  if (status === "failed") return { status, limitationCode: value.limitationCode, retryable: value.retryable === true };
  return invalid(`${key}.status is not a provider status`);
}

export function parseScanFixture(value: unknown): ScanFixture {
  if (!isRecord(value)) invalid("fixture must be an object");
  if (!isScanFixtureName(value.name)) invalid("name must be one of " + SCAN_FIXTURE_NAMES.join(", "));
  if (value.market !== "hk" && value.market !== "tw") invalid("market must be hk or tw");
  if (typeof value.collectedAt !== "string" || !ISO_TIMESTAMP.test(value.collectedAt) || !Number.isFinite(Date.parse(value.collectedAt))) {
    invalid("collectedAt must be an ISO timestamp");
  }
  if (!isRecord(value.raw)) invalid("raw must be an object");
  return {
    name: value.name,
    market: value.market,
    collectedAt: value.collectedAt,
    ig: parseProvider<IGPayload>("ig", value.ig),
    gbp: parseProvider<GBPPayload>("gbp", value.gbp),
    aeo: parseProvider<AEOPayload>("aeo", value.aeo),
    raw: value.raw as RawData,
  };
}

const cache = new Map<ScanFixtureName, ScanFixture>();

export function loadScanFixture(name: ScanFixtureName): ScanFixture {
  const cached = cache.get(name);
  if (cached) return cached;
  const parsed = parseScanFixture(SOURCES[name]);
  if (parsed.name !== name) invalid(`${name}.json declares name ${parsed.name}`);
  cache.set(name, parsed);
  return parsed;
}

/** Deep-copy `value`, moving every ISO timestamp string by `deltaMs`. */
export function shiftTimestamps<T>(value: T, deltaMs: number): T {
  if (typeof value === "string") {
    if (!ISO_TIMESTAMP.test(value)) return value;
    const parsed = Date.parse(value);
    return (Number.isFinite(parsed) ? new Date(parsed + deltaMs).toISOString() : value) as T;
  }
  if (Array.isArray(value)) return value.map((item) => shiftTimestamps(item, deltaMs)) as T;
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, shiftTimestamps(nested, deltaMs)]),
    ) as T;
  }
  return value;
}

/**
 * Which fixture a job exercises when none is named: the Taiwan café for TW
 * jobs, the IG-less merchant when no handle was given (so an IG-less scan
 * reports IG_HANDLE_NOT_PROVIDED exactly like the live collector), else the
 * demo merchant.
 */
export function resolveFixtureName(job: Pick<ClaimedScanJob, "region" | "ig_handle">): ScanFixtureName {
  if (job.region === "tw") return "tw-cafe";
  if (!job.ig_handle?.trim()) return "unavailable-ig";
  return "kam-man-house";
}

export interface FixtureCollectorOptions {
  /** Injectable clock; every timestamp in the collection is relative to it. */
  now?: () => Date;
}

function toProvider<T>(provider: FixtureProvider<T>, collectedAt: string, deltaMs: number): ProviderResult<T> {
  if (provider.status !== "measured") return provider;
  return {
    status: "measured",
    data: shiftTimestamps(provider.data, deltaMs),
    confidence: provider.confidence,
    collectedAt,
  };
}

/**
 * A `ScanProviderCollector` that resolves fixture data instead of calling
 * RapidAPI / Google Places / SerpApi. Walks the same stages as
 * `collectScanProviders` so the scanning page's progress looks the same.
 */
export function createFixtureCollector(
  name?: ScanFixtureName,
  options: FixtureCollectorOptions = {},
): ScanProviderCollector {
  return async (job, setStage): Promise<ScanProviderCollection> => {
    const fixture = loadScanFixture(name ?? resolveFixtureName(job));
    const now = options.now?.() ?? new Date();
    const collectedAt = now.toISOString();
    const deltaMs = now.getTime() - Date.parse(fixture.collectedAt);

    await setStage("collecting_ig_gbp");
    const ig = toProvider(fixture.ig, collectedAt, deltaMs);
    const gbp = toProvider(fixture.gbp, collectedAt, deltaMs);
    await setStage("collecting_aeo");
    const aeo = toProvider(fixture.aeo, collectedAt, deltaMs);

    return {
      ig,
      gbp,
      trust: deriveTrustProvider(ig, gbp, collectedAt),
      aeo,
      // Fixtures never carry media to snapshot; the evidence gallery stays empty.
      evidence: [],
      raw: shiftTimestamps(fixture.raw, deltaMs),
    };
  };
}
