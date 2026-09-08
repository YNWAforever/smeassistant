import { expect, it } from "vitest";
import { authDiagnostic } from "./sign-in-diagnostics";

it("emits only the fixed stage and opaque correlation identifier", () => {
  expect(authDiagnostic("identity_mapping", "00000000-0000-4000-8000-000000000001"))
    .toEqual({
      event: "owner_sign_in_failed",
      stage: "identity_mapping",
      correlationId: "00000000-0000-4000-8000-000000000001",
    });
});
