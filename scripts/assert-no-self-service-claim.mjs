// Guardrail 15: reject stale deployment configuration for the retired,
// insecure email/grant ownership path. Runtime code never enables that path;
// keep this gate so configuration drift is caught before deployment too.
const value = process.env.OWNER_SELF_SERVICE_CLAIM;
if (value !== undefined && value.trim() !== "" && value.trim().toLowerCase() !== "false") {
  console.error(
    "OWNER_SELF_SERVICE_CLAIM is set (" + JSON.stringify(value) + "). " +
    "This flag must never be enabled -- see CLAUDE.md guardrail 15 and lib/workspace/claim-scan.ts. " +
    "Unset it or set it to \"false\" before building or deploying.",
  );
  process.exitCode = 1;
} else {
  console.log("OWNER_SELF_SERVICE_CLAIM is not enabled.");
}
