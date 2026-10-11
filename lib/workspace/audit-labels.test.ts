import { describe, expect, it } from "vitest";

import { AUDIT_EVENT_LABELS, auditEventLabel } from "./audit-labels";

describe("auditEventLabel", () => {
  it("answers in the reader's locale, with Taiwan wording where it differs", () => {
    expect(auditEventLabel("pack.started", "en")).toBe("Starter pack started");
    expect(auditEventLabel("pack.started", "zh-HK")).toBe("已開始入門套裝");
    expect(auditEventLabel("pack.started", "zh-TW")).toBe("已開始入門套組");
  });

  it("falls back to the shared Chinese label when Taiwan wording is the same", () => {
    expect(auditEventLabel("version.approved", "zh-TW")).toBe(AUDIT_EVENT_LABELS["version.approved"].zh);
  });

  it("shows an unknown event as its raw name", () => {
    expect(auditEventLabel("something.new", "zh-TW")).toBe("something.new");
  });
});
