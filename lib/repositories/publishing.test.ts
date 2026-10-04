import { describe, expect, it, vi } from "vitest";

// Every test injects a fake executor; the default database is never reached.
vi.mock("@/lib/db/client", () => ({
  getPool: () => {
    throw new Error("default_database_forbidden");
  },
}));

import { scannedReviewKey } from "@/lib/workspace/evidence-inputs";
import { PublishError, publishingRepository } from "./publishing";

const VERSION = "44444444-4444-4444-8444-444444444444";
const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const ACTION = "33333333-3333-4333-8333-333333333333";
const LOCATION = "22222222-2222-4222-8222-222222222222";
const JOB = "55555555-5555-4555-8555-555555555555";

/** Columns 0014 adds; a pre-0014-safe query names none of them. */
const COLUMNS_0014 = /target_ref|provider_receipt|failure_reason|verified_at|first_published_at/;

type Handler = (sql: string, values: unknown[]) => { rows: unknown[] } | Promise<{ rows: unknown[] }>;

type Executor = NonNullable<Parameters<typeof publishingRepository>[0]>;

function executor(handler: Handler) {
  const query = vi.fn(async (sql: string, values: unknown[] = []) => handler(sql, values));
  return { query } as unknown as Executor & { query: typeof query };
}

function uniqueViolation(constraint: string) {
  return Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505", constraint });
}

const beginInput = { versionId: VERSION, actorId: "user-1", targetRef: "accounts/1/locations/2/reviews/r", idempotencyKey: "abcdefghijklmnop" };

describe("publishingRepository: racing begins (23505 from the partial unique indexes)", () => {
  it("maps deliveries_active_publish_version_key to PublishError already_publishing", async () => {
    const db = executor(() => {
      throw uniqueViolation("deliveries_active_publish_version_key");
    });
    const error = await publishingRepository(db).begin(beginInput).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PublishError);
    expect(error).toMatchObject({ code: "already_publishing", deliveryId: null });
  });

  it("maps deliveries_active_publish_target_key to PublishError target_busy", async () => {
    const db = executor(() => {
      throw uniqueViolation("deliveries_active_publish_target_key");
    });
    const error = await publishingRepository(db).begin(beginInput).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PublishError);
    expect(error).toMatchObject({ code: "target_busy" });
  });

  it("rethrows any other unique violation unchanged", async () => {
    const other = uniqueViolation("deliveries_idempotency_key_key");
    const db = executor(() => {
      throw other;
    });
    await expect(publishingRepository(db).begin(beginInput)).rejects.toBe(other);
  });
});

describe("publishingRepository.publishSubject", () => {
  it("returns the version's workspace, action, location, place, template, number, approval and body from pre-0014 columns", async () => {
    const db = executor((sql) => {
      expect(sql).not.toMatch(COLUMNS_0014);
      return {
        rows: [
          {
            workspace_id: WORKSPACE,
            action_id: ACTION,
            location_id: LOCATION,
            place_id: "place-1",
            template_key: "review-response",
            version_no: 3,
            approval_state: "approved",
            body: "Thank you",
          },
        ],
      };
    });
    expect(await publishingRepository(db).publishSubject(VERSION)).toEqual({
      workspaceId: WORKSPACE,
      actionId: ACTION,
      locationId: LOCATION,
      placeId: "place-1",
      templateKey: "review-response",
      versionNo: 3,
      approvalState: "approved",
      body: "Thank you",
    });
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0]?.[1]).toEqual([VERSION]);
  });

  it("returns null for an unknown version", async () => {
    const db = executor(() => ({ rows: [] }));
    expect(await publishingRepository(db).publishSubject(VERSION)).toBeNull();
  });
});

describe("publishingRepository.candidateReviewTexts", () => {
  const review = (text: string, time: string) => ({ rating: 2, text, time });
  const raw = {
    gbp: {
      reviews: [review("Older review about noodles", "2026-08-01T00:00:00Z"), review("Newest review about service", "2026-09-01T00:00:00Z")],
    },
  };

  function db(providedInputs: unknown, rawData: unknown = raw) {
    return executor((sql, values) => {
      expect(sql).not.toMatch(COLUMNS_0014);
      if (/raw_data/.test(sql)) {
        expect(values).toEqual([JOB, WORKSPACE]);
        return { rows: rawData === undefined ? [] : [{ raw_data: rawData }] };
      }
      expect(values).toEqual([VERSION]);
      return { rows: [{ workspace_id: WORKSPACE, job_id: JOB, provided_inputs: providedInputs }] };
    });
  }

  it("returns the sampled review texts of the action's evidence job, newest first", async () => {
    expect(await publishingRepository(db({})).candidateReviewTexts(VERSION)).toEqual([
      "Newest review about service",
      "Older review about noodles",
    ]);
  });

  it("narrows to the owner's selected reviews", async () => {
    const older = { rating: 2, text: "Older review about noodles", time: "2026-08-01T00:00:00Z" };
    expect(
      await publishingRepository(db({ selected_reviews: [scannedReviewKey(older)] })).candidateReviewTexts(VERSION),
    ).toEqual(["Older review about noodles"]);
  });

  it("returns [] when the action has no evidence snapshot, the version is unknown, or anything fails", async () => {
    const none = executor(() => ({ rows: [] }));
    expect(await publishingRepository(none).candidateReviewTexts(VERSION)).toEqual([]);
    const failing = executor(() => {
      throw new Error("boom");
    });
    expect(await publishingRepository(failing).candidateReviewTexts(VERSION)).toEqual([]);
    expect(await publishingRepository(db({}, null)).candidateReviewTexts(VERSION)).toEqual([]);
  });
});
