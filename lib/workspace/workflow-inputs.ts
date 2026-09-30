import type { WorkflowDefinition } from "./templates";

/**
 * True when an owner-supplied value counts as provided. Only `undefined`, `null`
 * and a string that is empty after trimming are absent. Any other value
 * (`true`, `0`, an array) is a real answer, so a whitespace-only fact can never
 * reach the model as if it were filled.
 */
export function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

/**
 * The inputs a run cannot proceed without: confirmed facts and evidence that are
 * neither provided nor already answered by the scan. Preferences are never
 * blocking because they have a safe default. The result keeps the workflow's
 * `inputs` order.
 */
export function missingConfirmedInputs(
  workflow: Pick<WorkflowDefinition, "inputs">,
  provided: Readonly<Record<string, unknown>>,
  satisfied: ReadonlySet<string>,
): string[] {
  return workflow.inputs
    .filter((input) => input.kind !== "preference")
    .filter((input) => !satisfied.has(input.key) && !isPresent(provided[input.key]))
    .map((input) => input.key);
}

/**
 * Inputs whose only authority is a server check, never an owner-typed or
 * persisted value: the approved-asset rule answers `asset_or_text_only`. An
 * evidence-kind input (the scanned reviews) is server-satisfied the same way.
 */
export const SERVER_SATISFIED_INPUT_KEYS: ReadonlySet<string> = new Set(["asset_or_text_only"]);

/**
 * The gate every surface applies before a model call: {@link missingConfirmedInputs}
 * over `provided` with the server-satisfied keys removed, so a persisted
 * `asset_or_text_only` marker or a typed `reviews_without_response` can never
 * stand in for the asset-rights check or the scanned reviews. Only `satisfied`
 * (the server's own answer) can clear them.
 */
export function gateBlockingInputs(
  workflow: Pick<WorkflowDefinition, "inputs">,
  provided: Readonly<Record<string, unknown>>,
  satisfied: ReadonlySet<string>,
): string[] {
  const evidenceKeys = new Set(workflow.inputs.filter((input) => input.kind === "evidence").map((input) => input.key));
  const filtered = Object.fromEntries(
    Object.entries(provided).filter(([key]) => !SERVER_SATISFIED_INPUT_KEYS.has(key) && !evidenceKeys.has(key)),
  );
  return missingConfirmedInputs(workflow, filtered, satisfied);
}
