import { beforeEach, expect, it, vi } from "vitest";
import type { VerifiedIdentity } from "./contracts";

const db = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn() }));
vi.mock("../db/transaction", () => ({ withTransaction: db.transaction }));
import { resolveApplicationUser } from "./users";

const owner: VerifiedIdentity = { provider: "neon", subject: "original-owner-subject", email: "owner@fixture.test", verified: true };
const identities = new Map<string, string>();
const users = new Map<string, string>();
beforeEach(() => {
  vi.resetAllMocks(); identities.clear(); users.clear();
  identities.set("original-owner-subject", "existing-owner");
  users.set("existing-owner", owner.email);
  db.transaction.mockImplementation(async run => run({ query: db.query }));
  db.query.mockImplementation(async (sql: string, args: string[]) => {
    if (sql.startsWith("SELECT pg_advisory")) return { rows: [] };
    if (sql.startsWith("SELECT user_id FROM auth_identities")) return { rows: identities.has(args[1]) ? [{ user_id: identities.get(args[1]) }] : [] };
    if (sql.startsWith("INSERT INTO app_users")) { users.set("new-user", args[0]); return { rows: [{ id: "new-user" }] }; }
    if (sql.startsWith("INSERT INTO auth_identities")) { identities.set(args[1], args[2]); return { rows: [] }; }
    if (sql.startsWith("UPDATE app_users")) { users.set(args[1], args[0]); return { rows: [] }; }
    throw new Error("unexpected_identity_query");
  });
});

it("keeps a new verified provider subject separate even when its email matches the existing workspace owner", async () => {
  const result = await resolveApplicationUser({ ...owner, subject: "different-subject" });
  expect(result.id).toBe("new-user");
  expect(identities.get("original-owner-subject")).toBe("existing-owner");
  expect(identities.get("different-subject")).toBe("new-user");
  expect(users.get("existing-owner")).toBe("owner@fixture.test");
});

it("keeps an existing provider subject's app-user id when its verified email changes", async () => {
  const result = await resolveApplicationUser({ ...owner, email: "new-address@fixture.test" });
  expect(result).toEqual({ id: "existing-owner", email: "new-address@fixture.test", verified: true });
  expect(users.size).toBe(1);
  expect(users.get("existing-owner")).toBe("new-address@fixture.test");
});

it.each([
  { ...owner, verified: false },
  { ...owner, verified: "true" },
  { ...owner, subject: "" },
  { ...owner, subject: " " },
  { ...owner, provider: "browser" },
  { ...owner, email: "invalid" },
])("rejects an unverified or malformed identity before any app-user or membership work %#", async identity => {
  await expect(resolveApplicationUser(identity as VerifiedIdentity)).rejects.toThrow("identity_invalid");
  expect(db.transaction).not.toHaveBeenCalled();
  expect(users.size).toBe(1);
  expect(identities.size).toBe(1);
});
