import { describe, expect, it } from "vitest";

import type { MailAvailability } from "./availability";
import {
  decideRecipient,
  HOLD_REASONS,
  MAIL_KINDS,
  mailKindsForScan,
  retryDelayMinutes,
} from "./decide";

const OPEN: MailAvailability = { open: true };
const CLOSED: MailAvailability = { open: false, reason: "mail_unapproved" };

describe("mailKindsForScan", () => {
  it("is empty for a failed scan", () => {
    expect(mailKindsForScan({ status: "failed" }, { comparable: true, regressed_findings: ["x"] })).toEqual([]);
  });

  it("is empty for a done scan with no diff", () => {
    expect(mailKindsForScan({ status: "done" }, null)).toEqual([]);
  });

  it("is rescan_complete only for a partial scan with an incomparable diff that still lists regressions", () => {
    // comparable=false means the delta itself is withheld, so regression_alert
    // never fires even though regressed_findings is non-empty.
    expect(
      mailKindsForScan({ status: "partial" }, { comparable: false, regressed_findings: ["gbp.rating_low"] }),
    ).toEqual(["rescan_complete"]);
  });

  it("is rescan_complete only for a comparable diff with zero regressions", () => {
    expect(mailKindsForScan({ status: "done" }, { comparable: true, regressed_findings: [] })).toEqual([
      "rescan_complete",
    ]);
  });

  it("is both kinds for a comparable diff with at least one regression", () => {
    expect(
      mailKindsForScan({ status: "done" }, { comparable: true, regressed_findings: ["gbp.rating_low"] }),
    ).toEqual(["rescan_complete", "regression_alert"]);
  });
});

describe("decideRecipient", () => {
  const allGood = {
    accepted: true,
    kindAllowed: true,
    optedIn: true,
    address: "owner@example.com",
  };

  it("holds mail_unapproved when mail is closed, ahead of every other reason", () => {
    expect(
      decideRecipient(
        { accepted: false, kindAllowed: false, optedIn: false, address: null },
        { availability: CLOSED, allowlist: null },
      ),
    ).toEqual({ state: "held", reason: "mail_unapproved" });
  });

  it("holds not_member ahead of kind_disabled and opted_out when mail is open", () => {
    expect(
      decideRecipient(
        { accepted: false, kindAllowed: false, optedIn: false, address: "owner@example.com" },
        { availability: OPEN, allowlist: null },
      ),
    ).toEqual({ state: "held", reason: "not_member" });
  });

  it("holds kind_disabled ahead of opted_out and no_address when accepted", () => {
    expect(
      decideRecipient(
        { accepted: true, kindAllowed: false, optedIn: false, address: null },
        { availability: OPEN, allowlist: null },
      ),
    ).toEqual({ state: "held", reason: "kind_disabled" });
  });

  it("holds opted_out ahead of no_address when the kind is allowed", () => {
    expect(
      decideRecipient(
        { accepted: true, kindAllowed: true, optedIn: false, address: null },
        { availability: OPEN, allowlist: null },
      ),
    ).toEqual({ state: "held", reason: "opted_out" });
  });

  it("holds no_address ahead of not_allowlisted when opted in but no address on file", () => {
    expect(
      decideRecipient(
        { accepted: true, kindAllowed: true, optedIn: true, address: null },
        { availability: OPEN, allowlist: new Set(["someone@else.com"]) },
      ),
    ).toEqual({ state: "held", reason: "no_address" });
  });

  it("holds not_allowlisted when every other fact is satisfied but the allowlist excludes the address", () => {
    expect(
      decideRecipient(allGood, { availability: OPEN, allowlist: new Set(["someone@else.com"]) }),
    ).toEqual({ state: "held", reason: "not_allowlisted" });
  });

  it("compares the allowlist case- and whitespace-insensitively", () => {
    expect(
      decideRecipient(
        { ...allGood, address: "  Owner@Example.COM  " },
        { availability: OPEN, allowlist: new Set(["owner@example.com"]) },
      ),
    ).toEqual({ state: "queued" });
  });

  it("queues when every fact is satisfied and there is no allowlist", () => {
    expect(decideRecipient(allGood, { availability: OPEN, allowlist: null })).toEqual({ state: "queued" });
  });
});

describe("retryDelayMinutes", () => {
  it.each([
    [1, 5],
    [2, 15],
    [3, 60],
    [4, 240],
    [5, null],
    [6, null],
  ])("attempt %i -> %s", (attempt, expected) => {
    expect(retryDelayMinutes(attempt)).toBe(expected);
  });
});

describe("exported vocabularies", () => {
  it("MAIL_KINDS matches the schema's kind check constraint", () => {
    expect(MAIL_KINDS).toEqual(["rescan_complete", "regression_alert"]);
  });

  it("HOLD_REASONS matches the schema's hold_reason check constraint", () => {
    expect(HOLD_REASONS).toEqual([
      "mail_unapproved",
      "kind_disabled",
      "opted_out",
      "no_address",
      "not_allowlisted",
      "not_member",
    ]);
  });
});
