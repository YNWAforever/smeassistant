import { Pool } from "pg";
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { resolveApplicationUser } from "../../lib/identity/users";
import { membershipRepository as members } from "../../lib/repositories/membership";
import { invitationDedupeKey } from "../../lib/mail/invitation";
import { recordMailAttempt } from "../../lib/mail/ledger";
const ports = vi.hoisted(() => ({ pool: undefined as Pool | undefined }));
vi.mock("../../lib/db/client", () => ({ getPool: () => ports.pool }));
const identity = () => ({ provider: "neon" as const, subject: "member", email: "member@example.test", verified: true as const });
describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon invitation expiry", () => {
 let fixture: NeonDatabaseFixture;
 let owner: Pool;
 let runtime: Pool;
 const savedFlag = process.env.INVITATION_MAIL_ENABLED;
 beforeAll(async () => {
  fixture = await startNeonDatabaseFixture("test");
  owner = new Pool({ connectionString: fixture.databaseUrl });
  await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
  await applyMigrations(owner);
  const url = new URL(fixture.databaseUrl); url.username = "fixture_runtime"; url.password = "fixture-only";
  runtime = new Pool({ connectionString: url.href, max: 10 }); ports.pool = runtime;
 });
 beforeEach(async () => { await runtime.query("DELETE FROM audit_events; DELETE FROM audit_jobs; DELETE FROM workspaces; DELETE FROM app_users"); });
 afterEach(() => { if (savedFlag === undefined) delete process.env.INVITATION_MAIL_ENABLED; else process.env.INVITATION_MAIL_ENABLED = savedFlag; });
 afterAll(async () => { await Promise.all([owner?.end(), runtime?.end()]); fixture?.stop(); });
 const workspace = async () => (await runtime.query("INSERT INTO workspaces(slug,business_name) VALUES('shop','Shop Ltd') RETURNING id")).rows[0].id as string;
 const invite = async (ws: string, age: string) => (await runtime.query(`INSERT INTO workspace_members(workspace_id,email,role,invited_at) VALUES($1,'member@example.test','viewer',now() - interval '${age}') RETURNING id`, [ws])).rows[0].id as string;

 it("flag on: a 15-day-old invitation is dead for all three queries", async () => {
  process.env.INVITATION_MAIL_ENABLED = "true";
  const user = await resolveApplicationUser(identity()); const ws = await workspace(); await invite(ws, "15 days");
  expect(await members.hasPendingInvitation(user.email)).toBe(false);
  expect(await members.hasSignInMembership(user.email)).toBe(false);
  expect(await members.bindPending(user)).toBeNull();
  expect(await members.listAccepted(user.id)).toEqual([]);
 });
 it("flag off: a 15-day-old invitation behaves as before", async () => {
  delete process.env.INVITATION_MAIL_ENABLED;
  const user = await resolveApplicationUser(identity()); const ws = await workspace(); await invite(ws, "15 days");
  expect(await members.hasPendingInvitation(user.email)).toBe(true);
  expect(await members.hasSignInMembership(user.email)).toBe(true);
  expect(await members.bindPending(user)).toBe(ws);
 });
 it("flag on: a 13-day-old invitation still binds", async () => {
  process.env.INVITATION_MAIL_ENABLED = "true";
  const user = await resolveApplicationUser(identity()); const ws = await workspace(); await invite(ws, "13 days");
  expect(await members.hasPendingInvitation(user.email)).toBe(true);
  expect(await members.hasSignInMembership(user.email)).toBe(true);
  expect(await members.bindPending(user)).toBe(ws);
 });
 it.each(["true", undefined])("an accepted member is unaffected (flag %s)", async flag => {
  if (flag) process.env.INVITATION_MAIL_ENABLED = flag; else delete process.env.INVITATION_MAIL_ENABLED;
  const user = await resolveApplicationUser(identity()); const ws = await workspace();
  await runtime.query("INSERT INTO workspace_members(workspace_id,user_id,email,role,invited_at,accepted_at) VALUES($1,$2,$3,'viewer',now() - interval '40 days',now())", [ws, user.id, user.email]);
  expect(await members.hasSignInMembership(user.email)).toBe(true);
  expect((await members.listAccepted(user.id)).length).toBe(1);
  const id = (await members.team(ws))[0].id;
  expect(await members.refreshInvitation(ws, id)).toBeNull();
  expect(await members.invitationContext(id)).toBeNull();
 });
 it("invitationContext and refreshInvitation return the pending invitation and renew it", async () => {
  const ws = await workspace(); const id = await invite(ws, "15 days");
  const before = await members.invitationContext(id);
  expect(before).toMatchObject({ email: "member@example.test", role: "viewer", workspaceName: "Shop Ltd" });
  const refreshed = await members.refreshInvitation(ws, id);
  expect(refreshed).toMatchObject({ email: "member@example.test", role: "viewer", workspaceName: "Shop Ltd" });
  expect(refreshed!.invitedAt).not.toBe(before!.invitedAt);
  process.env.INVITATION_MAIL_ENABLED = "true";
  expect(await members.hasPendingInvitation("member@example.test")).toBe(true);
  expect(await members.refreshInvitation(ws, "00000000-0000-4000-8000-000000000000")).toBeNull();
 });
 it("an owner row never yields an invitation context", async () => {
  const ws = await workspace();
  const id = (await runtime.query("INSERT INTO workspace_members(workspace_id,email,role) VALUES($1,'o@example.test','owner') RETURNING id", [ws])).rows[0].id as string;
  expect(await members.invitationContext(id)).toBeNull();
  expect(await members.refreshInvitation(ws, id)).toBeNull();
 });
 it("the mail ledger dedupes per invitedAt and records again after a resend", async () => {
  const ws = await workspace(); const id = await invite(ws, "1 day");
  const first = (await members.invitationContext(id))!;
  const result = { status: "accepted_by_provider" as const, providerMessageId: "p1" };
  const key = invitationDedupeKey(id, first.invitedAt);
  expect((await recordMailAttempt(runtime, { dedupeKey: key, workspaceId: ws, result })).recorded).toBe(true);
  expect((await recordMailAttempt(runtime, { dedupeKey: key, workspaceId: ws, result })).recorded).toBe(false);
  const second = (await members.refreshInvitation(ws, id))!;
  const key2 = invitationDedupeKey(id, second.invitedAt);
  expect(key2).not.toBe(key);
  expect((await recordMailAttempt(runtime, { dedupeKey: key2, workspaceId: ws, result })).recorded).toBe(true);
 });
});
