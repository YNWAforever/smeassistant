import { randomUUID } from "crypto";
import type {
  AEOPayload,
  AuditPayload,
  GBPPayload,
  IGPayload,
  ScoreResult,
} from "@sme-scanner/scoring";
import type { EvidenceCandidate } from "@sme-scanner/contracts";
import type { IgMatchProvenance } from "@sme-scanner/contracts";
import type { ProviderCollection, ProviderResult } from "./provider-result";

export interface ClaimedMerchantEvidence {
  placeId: string | null;
  dataId: string | null;
  dataCid: string | null;
  mapsUrl: string | null;
  address: string | null;
  alternateNames: string[];
}

export interface ClaimedScanJob {
  id: string;
  business_name: string;
  ig_handle: string | null;
  ig_match_provenance: IgMatchProvenance | null;
  website_url: string | null;
  industry: string | null;
  district: string | null;
  region: string | null;
  merchant_evidence?: ClaimedMerchantEvidence;
}

export type ScanProviderCollection = ProviderCollection<IGPayload, GBPPayload, AEOPayload>;

export type ScanStage =
  | "collecting"
  | "collecting_ig_gbp"
  | "collecting_aeo"
  | "scoring"
  | "persisting"
  | "done"
  | "partial"
  | "failed";

export interface ScanPersistence {
  jobId: string;
  status: "done" | "partial" | "failed";
  overall: number | null;
  coverage: number;
  scoringVersion: string;
  moduleResults: ScoreResult["modules"];
  findings: ScoreResult["findings"];
  rawData?: ScanProviderCollection["raw"];
}

export interface ScanFailure {
  jobId: string;
  category: "CLAIM_FAILED" | "COLLECTION_FAILED" | "SCORING_FAILED" | "PERSIST_FAILED" | "PROCESSOR_FAILED";
  correlationId: string;
}

export interface ScanProcessorDependencies {
  claimJob: (jobId: string) => Promise<ClaimedScanJob | null>;
  collect: (
    job: ClaimedScanJob,
    setStage: (stage: ScanStage) => Promise<void>,
  ) => Promise<ScanProviderCollection>;
  score: (payload: AuditPayload) => ScoreResult;
  persist: (result: ScanPersistence) => Promise<void>;
  fail: (failure: ScanFailure) => Promise<boolean>;
  setStage?: (jobId: string, stage: ScanStage) => Promise<void>;
  recordTerminal?: (transition: Pick<ScanPersistence, "jobId" | "status" | "coverage">) => Promise<void>;
  persistEvidence?: (jobId: string, candidates: EvidenceCandidate[]) => Promise<void>;
}

export type ScanProviderCollector = ScanProcessorDependencies["collect"];

export type ScanProcessResult =
  | { status: "done" | "partial" }
  | { status: "already_claimed" }
  | { status: "failed"; correlationId?: string; failurePersistence: "persisted" | "not_persisted" | "not_claimed" };

const INDEPENDENT_PROVIDERS = ["ig", "gbp", "aeo"] as const;

function redactPersistedValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPersistedValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      /^(error|message|error_message|errormessage)$/i.test(key) ? null : redactPersistedValue(nested),
    ]),
  );
}

function unavailablePayload<T extends { available: boolean }>(result: ProviderResult<T>): T {
  if (result.status === "measured") return result.data;
  return { available: false } as T;
}

function normalizeProviderModule(
  key: (typeof INDEPENDENT_PROVIDERS)[number] | "trust",
  result: ProviderResult<unknown>,
  current: ScoreResult["modules"][keyof ScoreResult["modules"]],
): ScoreResult["modules"][keyof ScoreResult["modules"]] {
  if (result.status === "measured" && current.status === "measured" && current.score !== null) {
    // Carry the collector's real confidence and capture time onto the module.
    // The pure scorer cannot know which provider answered, so it emits a flat
    // "medium" for every measured module; the collector does know — gbp-collector
    // reports "high" for Google Places New and "medium" for the SerpApi fallback.
    // Discarding that made the confidence legend on the report decorative, showing
    // the same word whether the evidence was first-party-quality or a fallback.
    return { ...current, confidence: result.confidence, evidenceCollectedAt: result.collectedAt };
  }
  return {
    ...current,
    status: result.status === "measured" ? "failed" : result.status,
    score: null,
    confidence: "none",
    evidenceCollectedAt: null,
    limitationCode: result.status === "measured" ? current.limitationCode ?? key.toUpperCase() + "_NO_USABLE_EVIDENCE" : result.limitationCode,
  };
}

export function normalizeModuleResults(
  result: ScoreResult,
  collection: ScanProviderCollection,
): ScoreResult["modules"] {
  const modules = { ...result.modules };
  modules.ig = normalizeProviderModule("ig", collection.ig, modules.ig);
  modules.gbp = normalizeProviderModule("gbp", collection.gbp, modules.gbp);
  modules.aeo = normalizeProviderModule("aeo", collection.aeo, modules.aeo);
  if (collection.trust) modules.trust = normalizeProviderModule("trust", collection.trust, modules.trust);
  return modules;
}

function toAuditPayload(job: ClaimedScanJob, collection: ScanProviderCollection): AuditPayload {
  return {
    business_name: job.business_name,
    industry: job.industry ?? "",
    district: job.district ?? "",
    ig: unavailablePayload(collection.ig),
    gbp: unavailablePayload(collection.gbp),
    aeo: unavailablePayload(collection.aeo),
  };
}

function failureCategory(error: unknown): ScanFailure["category"] {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("claim")) return "CLAIM_FAILED";
  if (message.includes("score")) return "SCORING_FAILED";
  if (message.includes("persist") || message.includes("supabase")) return "PERSIST_FAILED";
  if (message.includes("provider") || message.includes("collect")) return "COLLECTION_FAILED";
  return "PROCESSOR_FAILED";
}

/**
 * Build an idempotent scan processor. A caller owns all I/O dependencies so
 * unit tests can prove the claim boundary without invoking provider APIs.
 */
export function createScanProcessor(deps: ScanProcessorDependencies) {
  return async function processScan(jobId: string): Promise<ScanProcessResult> {
    let claimed = false;
    try {
      const job = await deps.claimJob(jobId);
      if (!job) return { status: "already_claimed" };
      claimed = true;

      const setStage = async (stage: ScanStage) => {
        if (deps.setStage) await deps.setStage(job.id, stage);
      };

      await setStage("collecting");
      const collection = await deps.collect(job, setStage);
      await setStage("scoring");

      const scored = deps.score(toAuditPayload(job, collection));
      const moduleResults = normalizeModuleResults(scored, collection);
      const measuredProviders = INDEPENDENT_PROVIDERS.filter(
        (key) => moduleResults[key].status === "measured" && moduleResults[key].score !== null,
      ).length;
      const allRequestedMeasured = INDEPENDENT_PROVIDERS.every(
        (key) => moduleResults[key].status === "measured" && moduleResults[key].score !== null,
      );
      const status: "done" | "partial" | "failed" =
        scored.overall !== null && measuredProviders >= 2
          ? allRequestedMeasured
            ? "done"
            : "partial"
          : "failed";

      await setStage("persisting");
      await deps.persist({
        jobId: job.id,
        status,
        overall: status === "failed" ? null : scored.overall,
        coverage: scored.coverage,
        scoringVersion: scored.scoringVersion,
        moduleResults,
        findings: redactPersistedValue(scored.findings) as ScoreResult["findings"],
        rawData: redactPersistedValue(collection.raw) as ScanProviderCollection["raw"],
      });

      if (deps.persistEvidence && collection.evidence?.length) {
        try {
          await deps.persistEvidence(job.id, collection.evidence);
        } catch {
          console.error("[scan/process] optional evidence persistence failed", {
            jobId: job.id,
            category: "evidence_persistence_failed",
            candidateCount: collection.evidence.length,
          });
        }
      }

      if (deps.recordTerminal) {
        try {
          void deps.recordTerminal({ jobId: job.id, status, coverage: scored.coverage }).catch(() => {
            console.error("[analytics] event_record_failed", { category: "transition_record_failed" });
          });
        } catch {
          console.error("[analytics] event_record_failed", { category: "transition_record_failed" });
        }
      }

      return status === "failed" ? { status, failurePersistence: "persisted" } : { status };
    } catch (error) {
      if (!claimed) {
        return { status: "failed", failurePersistence: "not_claimed" };
      }

      const correlationId = randomUUID();
      const failure: ScanFailure = {
        jobId,
        category: failureCategory(error),
        correlationId,
      };
      let failurePersisted = false;
      try {
        // Only safe category/correlation metadata is sent to durable storage;
        // provider messages can contain URLs, keys, or response bodies.
        failurePersisted = await deps.fail(failure);
      } catch {
        console.error("[scan/process] failed to persist terminal failure", {
          jobId,
          correlationId,
          category: failure.category,
        });
      }
      if (failurePersisted && deps.recordTerminal) {
        try {
          void deps.recordTerminal({ jobId, status: "failed", coverage: 0 }).catch(() => {
            console.error("[analytics] event_record_failed", { category: "transition_record_failed" });
          });
        } catch {
          console.error("[analytics] event_record_failed", { category: "transition_record_failed" });
        }
      }
      return failurePersisted
        ? { status: "failed", correlationId, failurePersistence: "persisted" }
        : { status: "failed", failurePersistence: "not_persisted" };
    }
  };
}

const IG_MATCH_PROVENANCE = new Set<IgMatchProvenance>(["manual_typed", "picker_confirmed", "gbp_cross_referenced"]);

export function asClaimedJob(value: unknown): ClaimedScanJob | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const candidate = row as Record<string, unknown>;
  if (typeof candidate.id !== "string" || typeof candidate.business_name !== "string") return null;
  const snapshot = candidate.input_snapshot && typeof candidate.input_snapshot === "object"
    ? candidate.input_snapshot as Record<string, unknown>
    : {};
  const alternateNames = Array.isArray(snapshot.alternateNames)
    ? snapshot.alternateNames.filter((name): name is string => typeof name === "string" && name.trim().length > 0)
    : [];
  return {
    id: candidate.id,
    business_name: candidate.business_name,
    ig_handle: typeof candidate.ig_handle === "string" ? candidate.ig_handle : null,
    ig_match_provenance: typeof snapshot.instagramMatchProvenance === "string"
      && IG_MATCH_PROVENANCE.has(snapshot.instagramMatchProvenance as IgMatchProvenance)
      ? snapshot.instagramMatchProvenance as IgMatchProvenance
      : null,
    website_url: typeof candidate.website_url === "string" ? candidate.website_url : null,
    industry: typeof candidate.industry === "string" ? candidate.industry : null,
    district: typeof candidate.district === "string" ? candidate.district : null,
    region: typeof candidate.region === "string" ? candidate.region : null,
    merchant_evidence: {
      placeId: typeof candidate.place_id === "string"
        ? candidate.place_id
        : typeof snapshot.placeId === "string" ? snapshot.placeId : null,
      dataId: typeof snapshot.dataId === "string" ? snapshot.dataId : null,
      dataCid: typeof snapshot.dataCid === "string" ? snapshot.dataCid : null,
      mapsUrl: typeof snapshot.mapsUrl === "string" ? snapshot.mapsUrl : null,
      address: typeof snapshot.address === "string" ? snapshot.address : null,
      alternateNames,
    },
  };
}
