import { afterEach, describe, expect, it, vi } from "vitest";

import { MAIL_TEMPLATES_VERSION } from "./availability";
import { invitationDedupeKey, sendInvitation } from "./invitation";
import type { MailTransport } from "./transport";

const OPEN_ENV = {
  APPLICATION_MAIL_APPROVED: MAIL_TEMPLATES_VERSION,
  RESEND_API_KEY: "re_fixture",
  REPORT_EMAIL_FROM: "notify@example.com",
  APP_ORIGIN: "https://example.com",
  MAIL_UNSUBSCRIBE_SECRET: "a".repeat(32),
};

const member = { id: "m-1", email: "new@x.test", role: "viewer" as const, invitedAt: "2026-10-10T01:02:03.000Z" };
const origin = "https://example.com";

function setup(opts: { existing?: boolean; insertRejects?: boolean; send?: MailTransport["send"] } = {}) {
  const query = vi.fn(async (...args: unknown[]) => {
    const sql = args[0] as string;
    if (/^\s*SELECT/i.test(sql)) {
      return opts.existing
        ? { rows: [{ payload: { status: "accepted_by_provider", provider_message_id: "p0" }, created_at: "2026-10-10" }] }
        : { rows: [] };
    }
    if (opts.insertRejects) throw new Error("db down for new@x.test");
    return { rows: [{ id: "1" }] };
  });
  const send = vi.fn<MailTransport["send"]>(opts.send ?? (async () => ({ status: "accepted_by_provider" as const, providerMessageId: "p1" })));
  const input = {
    db: { query } as never,
    transport: { send },
    env: OPEN_ENV,
    member,
    workspaceId: "w-1",
    workspaceName: "Kam Man House",
    locale: "en" as const,
    origin,
  };
  return { query, send, input };
}

describe("sendInvitation", () => {
  afterEach(() => vi.restoreAllMocks());

  it("builds the dedupe key from member id and invite time", () => {
    expect(invitationDedupeKey("m-1", member.invitedAt)).toBe(`invite:m-1:${Date.parse(member.invitedAt)}`);
  });

  it("returns an existing attempt without sending or inserting", async () => {
    const { query, send, input } = setup({ existing: true });
    await expect(sendInvitation(input)).resolves.toEqual({ status: "accepted_by_provider" });
    expect(send).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => /INSERT/i.test(sql as string))).toBe(false);
  });

  it("sends once and records the attempt against the member", async () => {
    const { query, send, input } = setup();
    await expect(sendInvitation(input)).resolves.toEqual({ status: "accepted_by_provider" });
    expect(send).toHaveBeenCalledTimes(1);
    const sent = send.mock.calls[0]![0];
    expect(sent.to).toBe("new@x.test");
    expect(sent.dedupeKey).toBe(invitationDedupeKey(member.id, member.invitedAt));
    expect(sent.text).toContain(`${origin}/en/owner/sign-in?method=email`);
    const insert = query.mock.calls.find(([sql]) => /INSERT/i.test(sql as string));
    expect(insert?.[1]).toEqual([`mail:${sent.dedupeKey}`, "w-1", "workspace_member", "m-1", expect.any(String)]);
  });

  it("reports failed when the transport throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { input } = setup({ send: async () => { throw new Error("boom"); } });
    await expect(sendInvitation(input)).resolves.toEqual({ status: "failed" });
  });

  it("still returns the send status when the ledger write fails, logging only a category", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { input } = setup({ insertRejects: true });
    await expect(sendInvitation(input)).resolves.toEqual({ status: "accepted_by_provider" });
    expect(err).toHaveBeenCalledWith(expect.any(String), { category: "mail_ledger_failed" });
    expect(JSON.stringify(err.mock.calls)).not.toContain("new@x.test");
  });
});
