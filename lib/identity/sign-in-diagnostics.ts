export type AuthStage =
  | "verifier_exchange"
  | "fresh_session"
  | "identity_mapping"
  | "invitation_binding"
  | "workspace_lookup"
  | "claim_resolution";

export type AuthDiagnostic = {
  event: "owner_sign_in_failed";
  stage: AuthStage;
  correlationId: string;
};

export function authDiagnostic(stage: AuthStage, correlationId: string): AuthDiagnostic {
  return { event: "owner_sign_in_failed", stage, correlationId };
}
