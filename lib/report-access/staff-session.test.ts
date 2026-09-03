import { describe, expect, it } from "vitest";
import { loadStaffSessionUser } from "./staff-session";

describe("loadStaffSessionUser", () => {
  it("resolves to null because this app has no staff console", async () => {
    await expect(loadStaffSessionUser()).resolves.toBeNull();
  });
});
