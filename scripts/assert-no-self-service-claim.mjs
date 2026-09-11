// Guardrail 15: OWNER_SELF_SERVICE_CLAIM is a scan-hijack primitive (email-match
// self-service ownership) and must never be enabled -- lib/workspace/claim-scan.ts
// already reads it as a strict `=== "true"` check, defaulting closed, but that is
// only the runtime behavior. This is the separate build/deploy-startup half of
// P1.2's requirement: fail the gate outright if the variable is ever set to any
// truthy-looking value in the environment this check runs in, rather than relying
// solely on the runtime code path to keep it off.
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
