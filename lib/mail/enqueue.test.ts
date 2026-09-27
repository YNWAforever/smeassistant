import { describe, expect, it } from "vitest";

import type { MailOutboxRepository, OutboxInsert } from "@/lib/repositories/mail-outbox";
import type { RecipientFacts } from "./decide";
import { MAIL_TEMPLATES_VERSION } from "./availability";
import { enqueueScanMail, type EnqueueScanMailInput } from "./enqueue";

type FakeRecipient = { userId: string; facts: RecipientFacts; locale: "en" | "zh-HK" | "zh-TW" | null };

const VALID_SECRET = "a".repeat(32);
const OPEN_ENV = {
  APPLICATION_MAIL_APPROVED: MAIL_TEMPLATES_VERSION,
  RESEND_API_KEY: "re_fixture",
  REPORT_EMAIL_FROM: "notify@example.com",
  APP_ORIGIN: "http://localhost",
  MAIL_UNSUBSCRIBE_SECRET: VALID_SECRET,
};
const CLOSED_ENV = {};

function fakeRepo(recipientsByKind: Partial<Record<"rescan_complete" | "regression_alert", FakeRecipient[]>>) {
  const inserted: OutboxInsert[] = [];
  const repo: Pick<MailOutboxRepository, "recipients" | "insert"> = {
    async recipients(_workspaceId, kind) {
      return recipientsByKind[kind] ?? [];
    },
    async insert(rows) {
      inserted.push(...rows);
      return rows.length;
    },
  };
  return { repo, inserted };
}

const GOOD_FACTS: RecipientFacts = { accepted: true, kindAllowed: true, optedIn: true, address: "member@example.test" };

const BASE_INPUT: EnqueueScanMailInput = {
  workspaceId: "ws-1",
  jobId: "job-1",
  status: "done",
  businessName: "Kam Man House",
  market: "hk",
  workspacePath: "/owner/kam-man-house",
  diff: { comparable: true, regressed_findings: [] },
};

describe("enqueueScanMail", () => {
  it("inserts nothing for a failed scan", async () => {
    const { repo, inserted } = fakeRepo({ rescan_complete: [{ userId: "u1", facts: GOOD_FACTS, locale: "en" }] });
    const count = await enqueueScanMail(repo, { ...BASE_INPUT, status: "failed" }, OPEN_ENV);
    expect(count).toBe(0);
    expect(inserted).toHaveLength(0);
  });

  it("holds every member mail_unapproved (storing no address) when mail is closed, regardless of their own facts", async () => {
    const { repo, inserted } = fakeRepo({
      rescan_complete: [{ userId: "u1", facts: GOOD_FACTS, locale: "en" }],
    });
    await enqueueScanMail(repo, BASE_INPUT, CLOSED_ENV);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ state: "held", hold_reason: "mail_unapproved", to_address: null });
  });

  it("holds kind_disabled when mail is open but the workspace kind toggle is off", async () => {
    const facts: RecipientFacts = { ...GOOD_FACTS, kindAllowed: false };
    const { repo, inserted } = fakeRepo({ rescan_complete: [{ userId: "u1", facts, locale: "en" }] });
    await enqueueScanMail(repo, BASE_INPUT, OPEN_ENV);
    expect(inserted[0]).toMatchObject({ state: "held", hold_reason: "kind_disabled", to_address: null });
  });

  it("holds no_address and writes to_address null when the member has no address on file", async () => {
    const facts: RecipientFacts = { ...GOOD_FACTS, address: null };
    const { repo, inserted } = fakeRepo({ rescan_complete: [{ userId: "u1", facts, locale: "en" }] });
    await enqueueScanMail(repo, BASE_INPUT, OPEN_ENV);
    expect(inserted[0]).toMatchObject({ state: "held", hold_reason: "no_address", to_address: null });
  });

  it("stores no address on a held row that had one -- only a queued row carries to_address", async () => {
    const optedOut: RecipientFacts = { ...GOOD_FACTS, optedIn: false };
    const { repo, inserted } = fakeRepo({
      rescan_complete: [
        { userId: "u1", facts: GOOD_FACTS, locale: "en" },
        { userId: "u2", facts: optedOut, locale: "en" },
      ],
    });
    await enqueueScanMail(repo, BASE_INPUT, OPEN_ENV);
    expect(inserted.find((r) => r.user_id === "u1")).toMatchObject({ state: "queued", to_address: "member@example.test" });
    expect(inserted.find((r) => r.user_id === "u2")).toMatchObject({ state: "held", hold_reason: "opted_out", to_address: null });
  });

  it("queues an allowlisted address and holds not_allowlisted for one excluded", async () => {
    const allowed: RecipientFacts = { ...GOOD_FACTS, address: "allowed@example.test" };
    const excluded: RecipientFacts = { ...GOOD_FACTS, address: "excluded@example.test" };
    const { repo, inserted } = fakeRepo({
      rescan_complete: [
        { userId: "u1", facts: allowed, locale: "en" },
        { userId: "u2", facts: excluded, locale: "en" },
      ],
    });
    await enqueueScanMail(repo, BASE_INPUT, { ...OPEN_ENV, MAIL_RECIPIENT_ALLOWLIST: "allowed@example.test" });
    expect(inserted.find((r) => r.user_id === "u1")).toMatchObject({ state: "queued", to_address: "allowed@example.test" });
    expect(inserted.find((r) => r.user_id === "u2")).toMatchObject({ state: "held", hold_reason: "not_allowlisted", to_address: null });
  });

  it("falls back to the market default locale when the member has none set", async () => {
    const { repo: hkRepo, inserted: hkInserted } = fakeRepo({
      rescan_complete: [{ userId: "u1", facts: GOOD_FACTS, locale: null }],
    });
    await enqueueScanMail(hkRepo, { ...BASE_INPUT, market: "hk" }, OPEN_ENV);
    expect(hkInserted[0]).toMatchObject({ locale: "zh-HK" });

    const { repo: twRepo, inserted: twInserted } = fakeRepo({
      rescan_complete: [{ userId: "u1", facts: GOOD_FACTS, locale: null }],
    });
    await enqueueScanMail(twRepo, { ...BASE_INPUT, market: "tw" }, OPEN_ENV);
    expect(twInserted[0]).toMatchObject({ locale: "zh-TW" });
  });

  it("keeps a member's own locale over the market fallback", async () => {
    const { repo, inserted } = fakeRepo({
      rescan_complete: [{ userId: "u1", facts: GOOD_FACTS, locale: "en" }],
    });
    await enqueueScanMail(repo, { ...BASE_INPUT, market: "hk" }, OPEN_ENV);
    expect(inserted[0]).toMatchObject({ locale: "en" });
  });

  it("carries the regressed finding count only on the regression_alert row, and businessName/workspacePath on both", async () => {
    const { repo, inserted } = fakeRepo({
      rescan_complete: [{ userId: "u1", facts: GOOD_FACTS, locale: "en" }],
      regression_alert: [{ userId: "u1", facts: GOOD_FACTS, locale: "en" }],
    });
    await enqueueScanMail(
      repo,
      { ...BASE_INPUT, diff: { comparable: true, regressed_findings: ["gbp.rating_low", "ig.follower_count_low"] } },
      OPEN_ENV,
    );
    const rescan = inserted.find((r) => r.kind === "rescan_complete");
    const regression = inserted.find((r) => r.kind === "regression_alert");
    expect(rescan?.payload).toEqual({ businessName: "Kam Man House", regressedCount: null, workspacePath: "/owner/kam-man-house" });
    expect(regression?.payload).toEqual({ businessName: "Kam Man House", regressedCount: 2, workspacePath: "/owner/kam-man-house" });
  });

  it("computes the same row ids across two separate calls (idempotent completion retry)", async () => {
    const recipients = { rescan_complete: [{ userId: "u1", facts: GOOD_FACTS, locale: "en" } as FakeRecipient] };
    const { repo: repoA, inserted: insertedA } = fakeRepo(recipients);
    const { repo: repoB, inserted: insertedB } = fakeRepo(recipients);
    await enqueueScanMail(repoA, BASE_INPUT, OPEN_ENV);
    await enqueueScanMail(repoB, BASE_INPUT, OPEN_ENV);
    expect(insertedA[0].id).toBe(insertedB[0].id);
    expect(insertedA[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returns the total inserted row count across kinds", async () => {
    const { repo } = fakeRepo({
      rescan_complete: [
        { userId: "u1", facts: GOOD_FACTS, locale: "en" },
        { userId: "u2", facts: GOOD_FACTS, locale: "en" },
      ],
      regression_alert: [{ userId: "u1", facts: GOOD_FACTS, locale: "en" }],
    });
    const count = await enqueueScanMail(
      repo,
      { ...BASE_INPUT, diff: { comparable: true, regressed_findings: ["gbp.rating_low"] } },
      OPEN_ENV,
    );
    expect(count).toBe(3);
  });
});
