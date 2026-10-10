import { describe, expect, it } from "vitest";

import { MAIL_TEMPLATES_VERSION } from "./availability";
import { invitationMailEnabled, recoveryAvailable, reportRecoveryEnabled } from "./feature-flags";

describe.each([
  ["INVITATION_MAIL_ENABLED", invitationMailEnabled],
  ["REPORT_RECOVERY_ENABLED", reportRecoveryEnabled],
] as const)("%s", (key, flag) => {
  it("is true only for the exact string true", () => {
    expect(flag({ [key]: "true" })).toBe(true);
  });

  it.each([undefined, "", "TRUE", "1", " true"])("is false for %j", (value) => {
    expect(flag({ [key]: value })).toBe(false);
  });
});

describe("recoveryAvailable", () => {
  it("is false when the flag is on but mail is not approved", () => {
    expect(recoveryAvailable({ REPORT_RECOVERY_ENABLED: "true" })).toBe(false);
  });

  it("is false when mail is open but the flag is off", () => {
    expect(recoveryAvailable(openEnv())).toBe(false);
  });

  it("is true when the flag is on and mail is open", () => {
    expect(recoveryAvailable({ ...openEnv(), REPORT_RECOVERY_ENABLED: "true" })).toBe(true);
  });
});

function openEnv(): Record<string, string> {
  return {
    APPLICATION_MAIL_APPROVED: MAIL_TEMPLATES_VERSION,
    RESEND_API_KEY: "re_fixture",
    REPORT_EMAIL_FROM: "notify@example.com",
    APP_ORIGIN: "https://example.com",
    MAIL_UNSUBSCRIBE_SECRET: "a".repeat(32),
  };
}
