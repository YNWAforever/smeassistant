import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClaimedRow, MailOutboxRepository } from "@/lib/repositories/mail-outbox";

import { MAIL_TEMPLATES_VERSION } from "./availability";
import type { RecipientFacts } from "./decide";
import { deliverMail } from "./deliver";
import type { MailSendResult, MailTransport } from "./transport";

vi.mock("./templates", () => ({
  renderScanMail: vi.fn(() => ({ subject: "Subject", text: "Text body", html: "<p>Html body</p>" })),
}));
vi.mock("./unsubscribe-token", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./unsubscribe-token")>();
  return { ...actual, signUnsubscribeToken: vi.fn(() => "TOKEN123") };
});

import { renderScanMail } from "./templates";
import { signUnsubscribeToken } from "./unsubscribe-token";

const NOW = new Date("2026-09-27T12:00:00Z");

const OPEN_ENV = {
  APPLICATION_MAIL_APPROVED: MAIL_TEMPLATES_VERSION,
  RESEND_API_KEY: "re_fixture",
  REPORT_EMAIL_FROM: "notify@example.test",
  APP_ORIGIN: "https://app.example.test",
  MAIL_UNSUBSCRIBE_SECRET: "s".repeat(32),
};

function claimedRow(overrides: Partial<ClaimedRow> = {}): ClaimedRow {
  return {
    id: "row-1",
    workspace_id: "ws-1",
    user_id: "user-1",
    job_id: "job-1",
    kind: "rescan_complete",
    to_address: "stale@example.test",
    locale: "en",
    state: "sending",
    hold_reason: null,
    payload: { businessName: "Kam Man House", regressedCount: null, workspacePath: "/owner/kam-man-house" },
    attempts: 1,
    lease_token: "lease-1",
    lease_until: new Date(NOW.getTime() + 5 * 60_000),
    next_attempt_at: NOW,
    created_at: NOW,
    ...overrides,
  } as ClaimedRow;
}

const QUEUEABLE_FACTS: RecipientFacts = { accepted: true, kindAllowed: true, optedIn: true, address: "member@example.test" };

interface FakeRepoOptions {
  rows?: ClaimedRow[];
  facts?: RecipientFacts[];
  finishResult?: boolean;
}

function fakeRepo(opts: FakeRepoOptions = {}) {
  const facts = opts.facts ?? [QUEUEABLE_FACTS];
  let factsCall = 0;
  const claimDue = vi.fn(async () => opts.rows ?? [claimedRow()]);
  const sendFacts = vi.fn(async () => facts[Math.min(factsCall++, facts.length - 1)]);
  const finish = vi.fn(async () => opts.finishResult ?? true);
  return { claimDue, sendFacts, finish } as unknown as MailOutboxRepository & {
    claimDue: typeof claimDue;
    sendFacts: typeof sendFacts;
    finish: typeof finish;
  };
}

function fakeTransport(result: MailSendResult): MailTransport & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(async () => result) };
}

describe("deliverMail", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(renderScanMail).mockClear();
    vi.mocked(signUnsubscribeToken).mockClear();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("skips claiming entirely and reports paused when MAIL_PAUSED is set", async () => {
    const repo = fakeRepo();
    const transport = fakeTransport({ status: "accepted_by_provider", providerMessageId: "msg_1" });

    const summary = await deliverMail({ repo, transport, env: { ...OPEN_ENV, MAIL_PAUSED: "true" }, now: () => NOW });

    expect(summary).toEqual({ sent: 0, retried: 0, held: 0, dead: 0, expired: 0, paused: true });
    expect(repo.claimDue).not.toHaveBeenCalled();
    expect(transport.send).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith("[pause] refused", { entry: "mail_send" });
  });

  it("expires a row older than 24h without ever reading facts or sending", async () => {
    const row = claimedRow({ created_at: new Date(NOW.getTime() - 25 * 60 * 60 * 1000) });
    const repo = fakeRepo({ rows: [row] });
    const transport = fakeTransport({ status: "accepted_by_provider", providerMessageId: "msg_1" });

    const summary = await deliverMail({ repo, transport, env: OPEN_ENV, now: () => NOW });

    expect(summary).toEqual({ sent: 0, retried: 0, held: 0, dead: 0, expired: 1, paused: false });
    expect(repo.sendFacts).not.toHaveBeenCalled();
    expect(transport.send).not.toHaveBeenCalled();
    expect(repo.finish).toHaveBeenCalledWith(row.id, row.lease_token, { state: "expired" });
  });

  it("holds a row whose member unsubscribed since enqueue (Review Focus 1)", async () => {
    const row = claimedRow();
    const repo = fakeRepo({ rows: [row], facts: [{ accepted: true, kindAllowed: true, optedIn: false, address: "member@example.test" }] });
    const transport = fakeTransport({ status: "accepted_by_provider", providerMessageId: "msg_1" });

    const summary = await deliverMail({ repo, transport, env: OPEN_ENV, now: () => NOW });

    expect(summary).toEqual({ sent: 0, retried: 0, held: 1, dead: 0, expired: 0, paused: false });
    expect(transport.send).not.toHaveBeenCalled();
    expect(repo.finish).toHaveBeenCalledWith(row.id, row.lease_token, { state: "held", reason: "opted_out" });
  });

  it("holds a row whose member was removed since enqueue (Review Focus 1)", async () => {
    const row = claimedRow();
    const repo = fakeRepo({ rows: [row], facts: [{ accepted: false, kindAllowed: false, optedIn: false, address: null }] });
    const transport = fakeTransport({ status: "accepted_by_provider", providerMessageId: "msg_1" });

    const summary = await deliverMail({ repo, transport, env: OPEN_ENV, now: () => NOW });

    expect(summary).toEqual({ sent: 0, retried: 0, held: 1, dead: 0, expired: 0, paused: false });
    expect(transport.send).not.toHaveBeenCalled();
    expect(repo.finish).toHaveBeenCalledWith(row.id, row.lease_token, { state: "held", reason: "not_member" });
  });

  it("sends a well-formed message: dedupeKey, unsubscribe headers, and rendered copy built from the current address and re-signed token", async () => {
    const row = claimedRow({ locale: "zh-HK" as ClaimedRow["locale"], payload: { businessName: "Kam Man House", regressedCount: 2, workspacePath: "/owner/kam-man-house" } });
    const repo = fakeRepo({ rows: [row] });
    const transport = fakeTransport({ status: "accepted_by_provider", providerMessageId: "msg_1" });

    await deliverMail({ repo, transport, env: OPEN_ENV, now: () => NOW });

    expect(signUnsubscribeToken).toHaveBeenCalledWith(
      { userId: row.user_id, workspaceId: row.workspace_id, kind: row.kind, expiresAt: NOW.getTime() + 90 * 24 * 60 * 60 * 1000 },
      OPEN_ENV.MAIL_UNSUBSCRIBE_SECRET,
    );
    expect(renderScanMail).toHaveBeenCalledWith(row.kind, "zh-HK", {
      businessName: "Kam Man House",
      regressedCount: 2,
      workspaceUrl: "https://app.example.test/owner/kam-man-house",
      unsubscribeUrl: "https://app.example.test/zh-HK/unsubscribe?token=TOKEN123",
    });
    const message = transport.send.mock.calls[0][0];
    expect(message.dedupeKey).toBe(row.id);
    expect(message.to).toBe("member@example.test");
    expect(message.subject).toBe("Subject");
    expect(message.text).toBe("Text body");
    expect(message.html).toBe("<p>Html body</p>");
    expect(message.headers).toEqual({
      "List-Unsubscribe": "<https://app.example.test/api/mail/unsubscribe?token=TOKEN123>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("falls back to the bare APP_ORIGIN for workspaceUrl when workspacePath is null", async () => {
    const row = claimedRow({ payload: { businessName: "Kam Man House", regressedCount: null, workspacePath: null } });
    const repo = fakeRepo({ rows: [row] });
    const transport = fakeTransport({ status: "accepted_by_provider", providerMessageId: "msg_1" });

    await deliverMail({ repo, transport, env: OPEN_ENV, now: () => NOW });

    expect(renderScanMail).toHaveBeenCalledWith(
      row.kind,
      "en",
      expect.objectContaining({ workspaceUrl: "https://app.example.test" }),
    );
  });

  it("finishes sent with the provider id and the freshly re-checked address, not the stale row address", async () => {
    const row = claimedRow({ to_address: "old-stale-address@example.test" });
    const repo = fakeRepo({ rows: [row] });
    const transport = fakeTransport({ status: "accepted_by_provider", providerMessageId: "msg_provider_1" });

    const summary = await deliverMail({ repo, transport, env: OPEN_ENV, now: () => NOW });

    expect(summary).toEqual({ sent: 1, retried: 0, held: 0, dead: 0, expired: 0, paused: false });
    expect(repo.finish).toHaveBeenCalledWith(row.id, row.lease_token, {
      state: "sent",
      providerMessageId: "msg_provider_1",
      toAddress: "member@example.test",
    });
  });

  it("holds mail_unapproved when the transport itself reports not_configured", async () => {
    const row = claimedRow();
    const repo = fakeRepo({ rows: [row] });
    const transport = fakeTransport({ status: "not_configured" });

    const summary = await deliverMail({ repo, transport, env: OPEN_ENV, now: () => NOW });

    expect(summary).toEqual({ sent: 0, retried: 0, held: 1, dead: 0, expired: 0, paused: false });
    expect(repo.finish).toHaveBeenCalledWith(row.id, row.lease_token, { state: "held", reason: "mail_unapproved" });
  });

  it.each([
    [1, 5],
    [2, 15],
    [3, 60],
    [4, 240],
  ])("retries a failed attempt %i with next_attempt_at = now + %i minutes", async (attempt, delayMinutes) => {
    const row = claimedRow({ attempts: attempt });
    const repo = fakeRepo({ rows: [row] });
    const transport = fakeTransport({ status: "failed", error: "provider_http_500" });

    const summary = await deliverMail({ repo, transport, env: OPEN_ENV, now: () => NOW });

    expect(summary).toEqual({ sent: 0, retried: 1, held: 0, dead: 0, expired: 0, paused: false });
    expect(repo.finish).toHaveBeenCalledWith(row.id, row.lease_token, {
      state: "retry",
      nextAttemptAt: new Date(NOW.getTime() + delayMinutes * 60_000),
      error: "provider_http_500",
    });
  });

  it("goes dead on the 5th failed attempt instead of retrying", async () => {
    const row = claimedRow({ attempts: 5 });
    const repo = fakeRepo({ rows: [row] });
    const transport = fakeTransport({ status: "failed", error: "provider_http_500" });

    const summary = await deliverMail({ repo, transport, env: OPEN_ENV, now: () => NOW });

    expect(summary).toEqual({ sent: 0, retried: 0, held: 0, dead: 1, expired: 0, paused: false });
    expect(repo.finish).toHaveBeenCalledWith(row.id, row.lease_token, { state: "dead", error: "provider_http_500" });
  });

  it("treats a queued transport status without a provider id as failed, never accepted", async () => {
    const row = claimedRow({ attempts: 1 });
    const repo = fakeRepo({ rows: [row] });
    const transport = fakeTransport({ status: "queued" });

    const summary = await deliverMail({ repo, transport, env: OPEN_ENV, now: () => NOW });

    expect(summary).toEqual({ sent: 0, retried: 1, held: 0, dead: 0, expired: 0, paused: false });
    expect(repo.finish).toHaveBeenCalledWith(row.id, row.lease_token, {
      state: "retry",
      nextAttemptAt: new Date(NOW.getTime() + 5 * 60_000),
      error: "provider_response_missing_id",
    });
  });

  it("treats a queued transport status carrying a provider id as accepted", async () => {
    const row = claimedRow();
    const repo = fakeRepo({ rows: [row] });
    const transport = fakeTransport({ status: "queued", providerMessageId: "msg_async_1" });

    const summary = await deliverMail({ repo, transport, env: OPEN_ENV, now: () => NOW });

    expect(summary).toEqual({ sent: 1, retried: 0, held: 0, dead: 0, expired: 0, paused: false });
    expect(repo.finish).toHaveBeenCalledWith(row.id, row.lease_token, {
      state: "sent",
      providerMessageId: "msg_async_1",
      toAddress: "member@example.test",
    });
  });

  it("counts a finish that returns false nowhere and logs mail_lease_lost by id only, never the address", async () => {
    const row = claimedRow();
    const repo = fakeRepo({ rows: [row], finishResult: false });
    const transport = fakeTransport({ status: "accepted_by_provider", providerMessageId: "msg_1" });

    const summary = await deliverMail({ repo, transport, env: OPEN_ENV, now: () => NOW });

    expect(summary).toEqual({ sent: 0, retried: 0, held: 0, dead: 0, expired: 0, paused: false });
    expect(warnSpy).toHaveBeenCalledWith("[mail] lease_lost", { category: "mail_lease_lost", id: row.id });
    for (const call of warnSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("member@example.test");
    }
  });

  it("processes every claimed row in the batch and totals the summary across them", async () => {
    const rows = [claimedRow({ id: "row-a" }), claimedRow({ id: "row-b" })];
    const repo = fakeRepo({
      rows,
      facts: [QUEUEABLE_FACTS, { accepted: true, kindAllowed: true, optedIn: false, address: "member@example.test" }],
    });
    const transport = fakeTransport({ status: "accepted_by_provider", providerMessageId: "msg_1" });

    const summary = await deliverMail({ repo, transport, env: OPEN_ENV, now: () => NOW });

    expect(summary).toEqual({ sent: 1, retried: 0, held: 1, dead: 0, expired: 0, paused: false });
  });

  it("signs the same unsubscribe expiry (and therefore an identical MailMessage) across two attempts at the same row, regardless of how much later the retry runs", async () => {
    // An hour before NOW (not the default `created_at: NOW`), so the
    // assertion actually distinguishes "derived from created_at" from
    // "derived from now" -- while staying well inside the 24h expiry window
    // for both of this test's two attempts.
    const row = claimedRow({ attempts: 1, created_at: new Date(NOW.getTime() - 60 * 60 * 1000) });
    const repo = fakeRepo({ rows: [row] });
    const transport = fakeTransport({ status: "failed", error: "provider_http_500" });

    // Attempt 1, then a retry an hour later -- a real Idempotency-Key replay
    // at the provider only returns the first attempt's result when the body
    // is byte-identical; a payload that drifts with `now` (e.g. a
    // send-time-derived unsubscribe expiry) would make Resend see the same
    // key with a different body and reject the retry with a 409 instead.
    await deliverMail({ repo, transport, env: OPEN_ENV, now: () => NOW });
    await deliverMail({ repo, transport, env: OPEN_ENV, now: () => new Date(NOW.getTime() + 60 * 60_000) });

    const expectedExpiresAt = row.created_at.getTime() + 90 * 24 * 60 * 60 * 1000;
    expect(signUnsubscribeToken).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ expiresAt: expectedExpiresAt }),
      OPEN_ENV.MAIL_UNSUBSCRIBE_SECRET,
    );
    expect(signUnsubscribeToken).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ expiresAt: expectedExpiresAt }),
      OPEN_ENV.MAIL_UNSUBSCRIBE_SECRET,
    );

    expect(transport.send).toHaveBeenCalledTimes(2);
    const [firstMessage] = transport.send.mock.calls[0];
    const [secondMessage] = transport.send.mock.calls[1];
    expect(secondMessage).toEqual(firstMessage);
  });

  it("normalises a trailing slash in APP_ORIGIN so no mailed URL or header ever doubles a slash", async () => {
    const row = claimedRow({ payload: { businessName: "Kam Man House", regressedCount: null, workspacePath: "/owner/kam-man-house" } });
    const repo = fakeRepo({ rows: [row] });
    const transport = fakeTransport({ status: "accepted_by_provider", providerMessageId: "msg_1" });

    await deliverMail({ repo, transport, env: { ...OPEN_ENV, APP_ORIGIN: "https://app.example.test/" }, now: () => NOW });

    const renderInput = vi.mocked(renderScanMail).mock.calls[0][2];
    expect(renderInput.workspaceUrl).toBe("https://app.example.test/owner/kam-man-house");
    expect(renderInput.unsubscribeUrl).toBe("https://app.example.test/en/unsubscribe?token=TOKEN123");
    const message = transport.send.mock.calls[0][0];
    expect(message.headers).toEqual({
      "List-Unsubscribe": "<https://app.example.test/api/mail/unsubscribe?token=TOKEN123>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    for (const url of [renderInput.workspaceUrl, renderInput.unsubscribeUrl, message.headers!["List-Unsubscribe"]]) {
      // A slash not immediately preceded by the scheme's trailing colon would
      // be a doubled slash left over from a trailing-slash APP_ORIGIN.
      expect(url).not.toMatch(/[^:]\/\//);
    }
  });

  it("isolates one row's exception: a later row still sends when an earlier row's sendFacts rejects, and the failed row is finished retry", async () => {
    const rowA = claimedRow({ id: "row-a", attempts: 1 });
    const rowB = claimedRow({ id: "row-b", attempts: 1 });
    const finish = vi.fn(async () => true);
    const sendFacts = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(QUEUEABLE_FACTS);
    const claimDue = vi.fn(async () => [rowA, rowB]);
    const repo = { claimDue, sendFacts, finish } as unknown as MailOutboxRepository;
    const transport = fakeTransport({ status: "accepted_by_provider", providerMessageId: "msg_1" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const summary = await deliverMail({ repo, transport, env: OPEN_ENV, now: () => NOW });

    expect(summary).toEqual({ sent: 1, retried: 1, held: 0, dead: 0, expired: 0, paused: false });
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledWith(rowA.id, rowA.lease_token, {
      state: "retry",
      nextAttemptAt: new Date(NOW.getTime() + 5 * 60_000),
      error: "deliver_exception",
    });
    expect(finish).toHaveBeenCalledWith(rowB.id, rowB.lease_token, {
      state: "sent",
      providerMessageId: "msg_1",
      toAddress: "member@example.test",
    });
    expect(errorSpy).toHaveBeenCalledWith("[mail] deliver_exception", { category: "mail_deliver_exception", id: rowA.id });
    errorSpy.mockRestore();
  });

  it("goes dead (rather than retry) when a row's exception happens on the 5th attempt", async () => {
    const row = claimedRow({ attempts: 5 });
    const finish = vi.fn(async () => true);
    const sendFacts = vi.fn().mockRejectedValue(new Error("boom"));
    const claimDue = vi.fn(async () => [row]);
    const repo = { claimDue, sendFacts, finish } as unknown as MailOutboxRepository;
    const transport = fakeTransport({ status: "accepted_by_provider", providerMessageId: "msg_1" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const summary = await deliverMail({ repo, transport, env: OPEN_ENV, now: () => NOW });

    expect(summary).toEqual({ sent: 0, retried: 0, held: 0, dead: 1, expired: 0, paused: false });
    expect(finish).toHaveBeenCalledWith(row.id, row.lease_token, { state: "dead", error: "deliver_exception" });
    errorSpy.mockRestore();
  });
});
