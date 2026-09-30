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
