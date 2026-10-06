import { expect, it, vi } from "vitest";
import { deliverMail } from "./deliver";
import { MAIL_TEMPLATES_VERSION } from "./availability";
import type { MailOutboxRepository, ClaimedRow } from "@/lib/repositories/mail-outbox";
import type { MailMessage } from "./transport";
const now = new Date("2026-10-07T00:00:00Z");
const env = { APPLICATION_MAIL_APPROVED: MAIL_TEMPLATES_VERSION, RESEND_API_KEY: "fixture", REPORT_EMAIL_FROM: "fixture@example.test", APP_ORIGIN: "https://fixture.example.test", MAIL_UNSUBSCRIBE_SECRET: "s".repeat(32) };
it.each([0, 40_000])("one shared deadline includes %s ms already spent and claims one item just in time (T-11)", async spent => {
  let elapsed = spent;
  const budget = { remainingMs: () => Math.max(0,55_000-elapsed), signal: new AbortController().signal };
  const queued = Array.from({ length: 10 }, (_, i) => ({ id: `row-${i}`, workspace_id: "workspace", user_id: "member", job_id: "job", locale: "en", kind: "rescan_complete", attempts: 1, lease_token: `lease-${i}`, created_at: now, payload: {} } as ClaimedRow));
  const claimDue = vi.fn(async (_now: Date, limit: number) => queued.splice(0,limit));
  const finish = vi.fn(async () => true);
  const repo = { claimDue, finish, sendFacts: vi.fn(async () => ({ accepted: true, kindAllowed: true, optedIn: true, address: "fixture@example.test" })) } as unknown as MailOutboxRepository;
  const send = vi.fn(async (_message: MailMessage, context?: { budget?: typeof budget }) => { elapsed += Math.min(10_000,context?.budget?.remainingMs() ?? 10_000); return { status: "accepted_by_provider" as const, providerMessageId: "fixture-message" }; });
  const summary = await deliverMail({ repo, transport: { send }, env, now: () => now, budget } as Parameters<typeof deliverMail>[0]);
  expect(elapsed).toBeLessThanOrEqual(55_000);
  expect(claimDue.mock.calls.every(call => call[1] === 1)).toBe(true);
  expect(send).toHaveBeenCalledTimes(spent ? 2 : 6);
  expect(queued).toHaveLength(spent ? 8 : 4);
  expect(summary).toMatchObject({ sent: spent ? 2 : 6, deferred: true, dead: 0, retried: 0 });
  expect(finish).toHaveBeenCalledTimes(spent ? 2 : 6); // Confirmed outcomes may settle in the bounded reserve.
});
