import type { WorkflowDefinition } from "./templates";

/**
 * True when an owner-supplied value counts as provided. `undefined`, `null`, a
 * string that is empty after trimming, an empty array and an empty plain object
 * are absent, so a whitespace-only fact or a POST /run with `menu_items: []` can
 * never reach the model as if it were filled. Any other value (`true`, `0`, a
 * non-empty array or object) is a real answer.
 */
export function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) return Object.keys(value).length > 0;
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
 * persisted value: the approved-asset rule answers `asset_or_text_only`, and
 * `offerSatisfied` (lib/workspace/runs.ts) answers `offer_id` from the action's
 * `offer_id` COLUMN -- a confirmed, unexpired offer usable at the action's
 * location -- so a typed or persisted `provided_inputs.offer_id` never counts.
 * Evidence-kind inputs are deliberately NOT here: spec §2 counts an evidence key
 * present in `provided` as answered, and the review_reply prompt uses
 * owner-typed `reviews_without_response` (labelled owner-supplied) only when the
 * scan retained no unanswered review.
 */
export const SERVER_SATISFIED_INPUT_KEYS: ReadonlySet<string> = new Set(["asset_or_text_only", "offer_id"]);

/**
 * The gate every surface applies before a model call: {@link missingConfirmedInputs}
 * over `provided` with the server-satisfied keys removed, so a persisted
 * `asset_or_text_only` marker can never stand in for the asset-rights check,
 * nor a persisted `offer_id` for the offer check.
 * Only `satisfied` (the server's own answer) can clear it. Every other key,
 * including an evidence key such as owner-typed `reviews_without_response`, is
 * answered by a present `provided` value or by `satisfied`.
 */
export function gateBlockingInputs(
  workflow: Pick<WorkflowDefinition, "inputs">,
  provided: Readonly<Record<string, unknown>>,
  satisfied: ReadonlySet<string>,
): string[] {
  const filtered = Object.fromEntries(Object.entries(provided).filter(([key]) => !SERVER_SATISFIED_INPUT_KEYS.has(key)));
  return missingConfirmedInputs(workflow, filtered, satisfied);
}
