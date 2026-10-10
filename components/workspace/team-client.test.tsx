// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const resendInvitation = vi.hoisted(() => vi.fn());
vi.mock("@/lib/workspace/client", () => ({ inviteMember: vi.fn(), removeMember: vi.fn(), updateMember: vi.fn(), resendInvitation }));

import { ResendInvitationButton } from "@/components/workspace/team-client";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function click(locale: "en" | "zh-HK" | "zh-TW", name: string, status: string) {
  resendInvitation.mockResolvedValue({ ok: true, data: { invitation: { status }, invitedAt: "x" } });
  const r = render(<ResendInvitationButton locale={locale} workspaceId="w" memberId="m" />);
  fireEvent.click(r.getByRole("button", { name }));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
}

describe("ResendInvitationButton toast", () => {
  it("claims a send only when the provider accepted it", async () => {
    await click("en", "Resend invitation", "accepted_by_provider");
    expect(toast.success).toHaveBeenCalledWith("Invitation sent again.");
    expect(toast.info).not.toHaveBeenCalled();
  });
  it.each([["en", "Resend invitation", "Invitation renewed. The email was not sent."], ["zh-HK", "重新發送邀請", "邀請已更新，但未發出電郵。"], ["zh-TW", "重新寄送邀請", "邀請已更新，但未寄出電子郵件。"]] as const)("says the email was not sent otherwise (%s)", async (locale, name, text) => {
    await click(locale, name, "not_configured");
    expect(toast.info).toHaveBeenCalledWith(text);
    expect(toast.success).not.toHaveBeenCalled();
  });
});
