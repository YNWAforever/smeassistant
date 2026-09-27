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
    mailOpen: false,
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
  it("shows the closed note on both mail cards, never the open note, while mail is closed", () => {
    const root = render(model({ mailOpen: false }));
    const closedNote = t("en", "mail.closedNote");
    const occurrences = (root.textContent ?? "").split(closedNote).length - 1;
    expect(occurrences).toBe(2);
    expect(root.textContent).not.toContain(t("en", "mail.openNote", { address: "owner@example.com" }));
  });

  it("shows the open note with the address on both mail cards while mail is open", () => {
    const root = render(model({ mailOpen: true, myAddress: "owner@example.com" }));
    const openNote = t("en", "mail.openNote", { address: "owner@example.com" });
    const occurrences = (root.textContent ?? "").split(openNote).length - 1;
    expect(occurrences).toBe(2);
    expect(root.textContent).not.toContain(t("en", "mail.closedNote"));
  });

  // Review finding: myAddress must come from app_users.email (what the
  // outbox actually sends to), which can genuinely be unresolved for a
  // member even while mail is open -- the page must never name an address
  // in that case.
  it("shows mail.noAddress, never mail.openNote, when mail is open but no address is on file", () => {
    const root = render(model({ mailOpen: true, myAddress: null }));
    expect(root.textContent).toContain(t("en", "mail.noAddress"));
    expect(root.textContent).not.toContain("{address}");
    for (const address of ["owner@example.com", "member@example.com"]) {
      expect(root.textContent).not.toContain(t("en", "mail.openNote", { address }));
    }
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
