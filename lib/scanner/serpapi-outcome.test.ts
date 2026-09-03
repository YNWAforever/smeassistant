import { describe, expect, it } from "vitest";
import { serpApiHttpFailure } from "./serpapi-outcome";

describe("serpApiHttpFailure", () => {
  it("maps 401 to an auth failure", () => {
    expect(serpApiHttpFailure(401)).toEqual({ outcome: "PROVIDER_AUTH_ERROR", category: "auth" });
  });

  it("maps 403 to a permission failure", () => {
    expect(serpApiHttpFailure(403)).toEqual({ outcome: "PROVIDER_PERMISSION_ERROR", category: "permission" });
  });

  it("maps 429 to a quota failure", () => {
    expect(serpApiHttpFailure(429)).toEqual({ outcome: "PROVIDER_QUOTA_ERROR", category: "quota" });
  });

  it("maps 5xx to a server failure", () => {
    expect(serpApiHttpFailure(503)).toEqual({ outcome: "PROVIDER_ERROR", category: "server" });
  });

  it("maps other non-2xx statuses to a generic failure", () => {
    expect(serpApiHttpFailure(418)).toEqual({ outcome: "PROVIDER_ERROR", category: "other" });
  });

  it("returns null for 2xx", () => {
    expect(serpApiHttpFailure(200)).toBeNull();
    expect(serpApiHttpFailure(204)).toBeNull();
  });
});
