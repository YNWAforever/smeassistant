import { mailAvailability } from "./availability";

type Env = Record<string, string | undefined>;

/** Exactly "true" opens a flag -- no trimming, no case folding, mirroring the other feature flags. */
function isTrue(value: string | undefined): boolean {
  return value === "true";
}

/** Workspace invitation mail (docs/superpowers/specs/2026-10-05-invitation-and-recovery-mail-design.md). */
export function invitationMailEnabled(env: Env = process.env): boolean {
  return isTrue(env.INVITATION_MAIL_ENABLED);
}

export function reportRecoveryEnabled(env: Env = process.env): boolean {
  return isTrue(env.REPORT_RECOVERY_ENABLED);
}

/** Recovery needs the flag *and* an approved, fully configured mail provider. */
export function recoveryAvailable(env: Env = process.env): boolean {
  return reportRecoveryEnabled(env) && mailAvailability(env).open;
}
