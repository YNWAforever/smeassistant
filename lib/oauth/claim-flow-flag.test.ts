import { describe, expect, it, vi } from "vitest";
import { claimViaOAuthEnabled } from "./claim-flow-flag";

describe("claimViaOAuthEnabled", () => {
  it("is disabled by default", () => {
    vi.stubEnv("WORKSPACE_CLAIM_VIA_OAUTH_ENABLED", "");
    expect(claimViaOAuthEnabled()).toBe(false);
    vi.unstubAllEnvs();
  });

  it("is enabled only by the exact string true", () => {
    vi.stubEnv("WORKSPACE_CLAIM_VIA_OAUTH_ENABLED", "true");
    expect(claimViaOAuthEnabled()).toBe(true);
    vi.stubEnv("WORKSPACE_CLAIM_VIA_OAUTH_ENABLED", "TRUE");
    expect(claimViaOAuthEnabled()).toBe(false);
    vi.unstubAllEnvs();
  });
});
