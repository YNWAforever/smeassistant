// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en/owner/kam-man-house/settings/notifications",
  useSearchParams: () => new URLSearchParams(),
}));

import { NotificationsView } from "@/components/workspace/notifications-view";
import { t } from "@/lib/i18n";
import type { NotificationsModel } from "@/lib/workspace/queries-pages";

/**
 * P3.5c task 8: the workspace "Allow" card became an owner-only gate
 * (global-constraints.md departure 2) and a new "My emails" card lets any
 * member set their own two switches. Both cards must tell the truth about
 * whether mail is actually open (docs/superpowers/specs/2026-09-27-mail-
 * outbox-design.md §6).
 */
function model(overrides: Partial<NotificationsModel> = {}): NotificationsModel {
  return {
    inApp: [],
    email: { rescanComplete: true, regressionAlert: true, monthlyDigest: true },
    role: "owner",
    mailState: "closed",
    myEmails: { rescanComplete: false, regressionAlert: false },
    myAddress: "owner@example.com",
    ...overrides,
  };
}

function render(m: NotificationsModel) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <NotificationsView locale="en" workspaceId="ws-1" timezone="Asia/Hong_Kong" model={m} />,
  );
  return root;
}

function cardFor(root: HTMLElement, heading: string): Element | null {
  const h2 = Array.from(root.querySelectorAll("h2")).find((el) => el.textContent === heading);
  return h2?.closest(".section-card") ?? null;
}

describe("NotificationsView", () => {
  const ADDRESS = "owner@example.com";
  const openNote = t("en", "mail.openNote", { address: ADDRESS });

  // Final-review fix 2: one note per effective state, and the "we'll email
  // you" note only when the state is "open".
  it.each([
    ["closed", t("en", "mail.closedNote")],
    ["paused", t("en", "mail.pausedNote")],
    ["no_address", t("en", "mail.noAddress")],
    ["not_allowlisted", t("en", "mail.limitedNote")],
    ["none_on", t("en", "mail.offNote", { address: ADDRESS })],
    ["blocked", t("en", "mail.gateNote")],
    ["open", openNote],
  ] as const)("renders the %s note on both mail cards", (mailState, note) => {
    const root = render(model({ mailState, myAddress: mailState === "no_address" ? null : ADDRESS }));
    const occurrences = (root.textContent ?? "").split(note).length - 1;
    expect(occurrences).toBe(2);
    expect(root.textContent).not.toContain("{address}");
    if (mailState !== "open") expect(root.textContent).not.toContain(openNote);
  });

  it("renders mail.openNote only for the open state", () => {
    const states = ["closed", "paused", "no_address", "not_allowlisted", "none_on", "blocked", "open"] as const;
    const showing = states.filter((mailState) => (render(model({ mailState })).textContent ?? "").includes(openNote));
    expect(showing).toEqual(["open"]);
  });

  it("marks each of my switches that is on while the workspace gate for it is off", () => {
    const root = render(model({
      mailState: "open",
      email: { rescanComplete: false, regressionAlert: true, monthlyDigest: true },
      myEmails: { rescanComplete: true, regressionAlert: true },
    }));
    const card = cardFor(root, t("en", "mail.myEmailsTitle"));
    const blocked = t("en", "mail.kindBlocked");
    const rows = card ? Array.from(card.querySelectorAll("label")) : [];
    const rescan = rows.find((row) => row.textContent?.includes(t("en", "mail.rescanComplete")));
    const regression = rows.find((row) => row.textContent?.includes(t("en", "mail.regressionAlert")));
    expect(rescan?.textContent).toContain(blocked);
    expect(regression?.textContent).not.toContain(blocked);
    expect((root.textContent ?? "").split(blocked).length - 1).toBe(1);
  });

  it("does not mark a switch that is off, even when its workspace gate is off", () => {
    const root = render(model({
      mailState: "none_on",
      email: { rescanComplete: false, regressionAlert: false, monthlyDigest: true },
      myEmails: { rescanComplete: false, regressionAlert: false },
    }));
    expect(root.textContent).not.toContain(t("en", "mail.kindBlocked"));
  });

  it("disables the workspace Allow switches and shows the owner-only note for a non-owner", () => {
    const root = render(model({ role: "manager" }));
    expect(root.textContent).toContain(t("en", "mail.ownerOnly"));
    const card = cardFor(root, t("en", "mail.allowTitle"));
    const switches = card ? Array.from(card.querySelectorAll('button[role="switch"]')) : [];
    expect(switches.length).toBeGreaterThan(0);
    for (const el of switches) expect(el.hasAttribute("disabled")).toBe(true);
  });

  it("lets the owner use the workspace Allow switches, with no owner-only note", () => {
    const root = render(model({ role: "owner" }));
    expect(root.textContent).not.toContain(t("en", "mail.ownerOnly"));
    const card = cardFor(root, t("en", "mail.allowTitle"));
    const switches = card ? Array.from(card.querySelectorAll('button[role="switch"]')) : [];
    expect(switches.length).toBeGreaterThan(0);
    for (const el of switches) expect(el.hasAttribute("disabled")).toBe(false);
  });

  it("labels the monthly digest switch Planned", () => {
    const root = render(model());
    expect(root.textContent).toContain(t("en", "mail.monthlyDigest"));
    expect(t("en", "mail.monthlyDigest")).toContain("Planned");
  });

  it("always lets any member (even a viewer) use their own My emails switches", () => {
    const root = render(model({ role: "viewer" }));
    const card = cardFor(root, t("en", "mail.myEmailsTitle"));
    const switches = card ? Array.from(card.querySelectorAll('button[role="switch"]')) : [];
    expect(switches.length).toBeGreaterThan(0);
    for (const el of switches) expect(el.hasAttribute("disabled")).toBe(false);
  });
});
