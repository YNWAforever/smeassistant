// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en/owner/kam-man-house/settings/team",
  useSearchParams: () => new URLSearchParams(),
}));

import { TeamView } from "@/components/workspace/team-view";
import type { TeamMember, TeamModel } from "@/lib/workspace/team";

afterEach(cleanup);

const owner: TeamMember = { id: "m-1", email: "o@example.test", role: "owner", userId: "u1", acceptedAt: "2026-08-01T00:00:00Z", invitedAt: null, locationScope: null };
const joined: TeamMember = { id: "m-2", email: "j@example.test", role: "manager", userId: "u2", acceptedAt: "2026-09-02T00:00:00Z", invitedAt: "2026-09-01T00:00:00Z", locationScope: null };
const pending = (extra: Partial<TeamMember> = {}): TeamMember => ({ id: "m-3", email: "p@example.test", role: "viewer", userId: null, acceptedAt: null, invitedAt: "2026-09-03T00:00:00Z", locationScope: null, ...extra });

const model = (members: TeamMember[]): TeamModel => ({ members, locations: [] });
const view = (locale: "en" | "zh-HK" | "zh-TW", m: TeamModel, o: { invitationMail: boolean; role?: "owner" | "manager" | "viewer" }) =>
  render(<TeamView locale={locale} workspaceId="ws-1" role={o.role ?? "owner"} timezone="Asia/Hong_Kong" model={m} invitationMail={o.invitationMail} />);

describe("TeamView invitation status", () => {
  it("renders identically to a model without invitation fields, with no Resend button, when the flag is off", () => {
    const withFields = view("en", model([owner, pending({ invitation: { status: "failed", error: null }, expired: true })]), { invitationMail: false });
    const html = withFields.container.innerHTML;
    expect(withFields.queryByRole("button", { name: /resend/i })).toBeNull();
    cleanup();
    const without = view("en", model([owner, pending()]), { invitationMail: false });
    expect(html).toBe(without.container.innerHTML);
  });

  const cases: Array<[string, TeamMember["invitation"], string, string, string]> = [
    ["accepted_by_provider", { status: "accepted_by_provider", error: null }, "Invitation emailed", "已發出邀請電郵", "已寄出邀請信"],
    ["mail_closed", { status: "not_configured", error: "mail_closed" }, "Email not sent: email isn't set up yet", "未發出電郵：電郵功能尚未設定", "未寄出：電子郵件功能尚未設定"],
    ["not_allowlisted", { status: "not_configured", error: "not_allowlisted" }, "Email not sent: recipient isn't on the test list", "未發出電郵：收件人不在測試名單", "未寄出：收件人不在測試名單"],
    ["failed", { status: "failed", error: "provider_error" }, "Email failed", "電郵發送失敗", "寄送失敗"],
  ];
  it.each(cases)("shows the %s status in en, zh-HK and zh-TW", (_name, invitation, en, hk, tw) => {
    for (const [locale, text] of [["en", en], ["zh-HK", hk], ["zh-TW", tw]] as const) {
      const r = view(locale, model([owner, pending({ invitation, expired: false })]), { invitationMail: true });
      expect(r.container.textContent).toContain(text);
      cleanup();
    }
  });

  it("shows Expired and a Resend button for an expired pending invite", () => {
    const r = view("zh-HK", model([owner, pending({ invitation: null, expired: true })]), { invitationMail: true });
    expect(r.container.textContent).toContain("已過期");
    expect(r.getByRole("button", { name: "重新發送邀請" })).toBeTruthy();
    cleanup();
    const tw = view("zh-TW", model([owner, pending({ invitation: null, expired: true })]), { invitationMail: true });
    expect(tw.getByRole("button", { name: "重新寄送邀請" })).toBeTruthy();
  });

  it("offers Resend to the owner for pending members only, never accepted ones or non-owners", () => {
    const r = view("en", model([owner, joined, pending({ invitation: null, expired: false })]), { invitationMail: true });
    expect(r.getAllByRole("button", { name: "Resend invitation" })).toHaveLength(1);
    cleanup();
    const viewer = view("en", model([owner, joined, pending({ invitation: null, expired: false })]), { invitationMail: true, role: "viewer" });
    expect(viewer.queryByRole("button", { name: "Resend invitation" })).toBeNull();
  });
});
