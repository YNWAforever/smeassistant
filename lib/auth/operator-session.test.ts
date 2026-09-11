import { afterEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const poolQuery = vi.fn();
vi.mock("@/lib/auth", () => ({ getUser: () => getUser() }));
vi.mock("@/lib/db/client", () => ({ getPool: () => ({ query: poolQuery }) }));

import { resolveOperator } from "./operator";

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

function signedIn(email = "ada.wong@fimmick.com") {
  getUser.mockResolvedValue({ id: "session-user", email, verified: true });
}

describe("resolveOperator", () => {
  it("returns the operator with the app_users id the FK needs", async () => {
    vi.stubEnv("OPERATOR_EMAILS", "ada.wong@fimmick.com");
    signedIn();
    poolQuery.mockResolvedValue({ rows: [{ id: "app-user-1" }], rowCount: 1 });
    expect(await resolveOperator()).toEqual({ userId: "app-user-1", email: "ada.wong@fimmick.com" });
  });

  it("refuses when there is no session", async () => {
    vi.stubEnv("OPERATOR_EMAILS", "ada.wong@fimmick.com");
    getUser.mockResolvedValue(null);
    expect(await resolveOperator()).toBeNull();
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it("refuses a signed-in user who is not on the allowlist", async () => {
    vi.stubEnv("OPERATOR_EMAILS", "ada.wong@fimmick.com");
    signedIn("merchant@example.test");
    expect(await resolveOperator()).toBeNull();
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it("refuses everyone when the allowlist is unset", async () => {
    vi.stubEnv("OPERATOR_EMAILS", "");
    signedIn();
    expect(await resolveOperator()).toBeNull();
    expect(poolQuery).not.toHaveBeenCalled();
  });

  // resolved_by_staff_user_id is an FK to app_users(id): an allowlisted address
  // with no row cannot be recorded as the decider, so it is not an operator.
  it("refuses when the address has no app_users row", async () => {
    vi.stubEnv("OPERATOR_EMAILS", "ada.wong@fimmick.com");
    signedIn();
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await resolveOperator()).toBeNull();
  });
});
