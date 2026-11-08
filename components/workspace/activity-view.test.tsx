// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { ActivityView } from "@/components/workspace/activity-view";
import type { AuditEventRow } from "@/lib/workspace/queries-pages";

afterEach(cleanup);

function row(over: Partial<AuditEventRow>): AuditEventRow {
  return {
    id: 1, workspace_id: "w", location_id: null, actor_type: "user", actor_id: "u", event: "brand.updated",
    entity_type: null, entity_id: null, payload: null, created_at: "2026-10-10T13:06:00Z", ...over,
  };
}

function cells(locale: "en" | "zh-HK" | "zh-TW", events: AuditEventRow[]) {
  render(<ActivityView locale={locale} timezone="Asia/Hong_Kong" events={events} />);
  return screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell").map((c) => c.textContent ?? ""));
}

describe("ActivityView labels (F-22)", () => {
  it.each([
    ["en", "Operator"],
    ["zh-HK", "營運人員"],
    ["zh-TW", "營運人員"],
  ] as const)("shows an operator assignment as done by an operator, not a member (%s)", (locale, operator) => {
    const [[, actor]] = cells(locale, [row({ event: "workspace.assigned", payload: { slug: "nadagogo-2" } })]);
    expect(actor).toBe(operator);
  });

  it("keeps an owner's own event attributed to a member", () => {
    const [[, actor]] = cells("en", [row({ event: "brand.updated" })]);
    expect(actor).toBe("Member");
  });

  it.each([
    ["en", "Scan"],
    ["zh-HK", "掃描"],
  ] as const)("labels the entity instead of printing its raw type (%s)", (locale, label) => {
    const [[, , , detail]] = cells(locale, [row({ event: "workspace.claimed", entity_type: "audit_job", payload: { locale } })]);
    expect(detail).toBe(label);
    expect(detail).not.toContain("audit_job");
  });

  it("shows nothing rather than an unknown raw entity type", () => {
    const [[, , , detail]] = cells("en", [row({ event: "brand.updated", entity_type: "some_internal_table" })]);
    expect(detail).toBe("");
  });

  it.each([
    ["pack.started", "已開始入門套組", "入門套裝"],
    ["asset.uploaded", "照片已上傳", "上載"],
    ["mail.attempted", "已嘗試發送電子郵件", "電郵"],
  ])("uses Taiwan wording for zh-TW (%s)", (event, tw, hkOnly) => {
    const [[, , label]] = cells("zh-TW", [row({ event })]);
    expect(label).toBe(tw);
    expect(label).not.toContain(hkOnly);
  });

  it("keeps Hong Kong wording for zh-HK", () => {
    const [[, , label]] = cells("zh-HK", [row({ event: "pack.started" })]);
    expect(label).toBe("已開始入門套裝");
  });
});


describe("ActivityView detail column", () => {
  it("never prints the request fingerprint, row ids or raw payload keys", () => {
    const [[, , , detail]] = cells("en", [row({ event: "asset.uploaded", payload: { locale: "en", ip_hash: "3fa9c0ffee", job_id: "6f1c2a8e-0000-4000-8000-000000000000", bytes: 52340, filename: "steamed-fish.jpg", content_type: "image/jpeg" } })]);
    expect(detail).toBe("steamed-fish.jpg");
  });

  it.each([
    ["en", "Version 2 · Exported"],
    ["zh-HK", "第 2 版 · 匯出"],
  ] as const)("words a delivery's version and mode (%s)", (locale, expected) => {
    const [[, , , detail]] = cells(locale, [row({ event: "delivery.exported", payload: { locale, version_no: 2, mode: "export" } })]);
    expect(detail).toBe(expected);
  });

  it("falls back to the entity label when no readable field exists", () => {
    const [[, , , detail]] = cells("en", [row({ event: "workspace.claimed", entity_type: "audit_job", payload: { locale: "en", ip_hash: "abc" } })]);
    expect(detail).toBe("Scan");
  });
});
