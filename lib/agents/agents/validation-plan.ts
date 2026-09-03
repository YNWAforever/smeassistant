import { bodyLength, prohibitedTermHits } from "../guardrails";
import { defineAgent } from "../prompt";

/**
 * Not tied to a template: it explains how the workspace will *measure* an
 * action once it is delivered (which metric, over which window, from which
 * snapshot), so the owner never reads an unmeasured change as proof.
 */
export const validationPlan = defineAgent({
  key: "validation_plan",
  capability: "Live",
  promptVersion: "2026-09-03.1",
  role: "a measurement analyst writing the validation plan for one recommended action",
  task: () => `Write a short validation plan for the action in the evidence. Name the single metric from the snapshot metrics that this action should move, the current observed value, the direction of change that would count as success, the comparison window (the next comparable monthly scan; say so explicitly), and what would make the comparison invalid (coverage loss, scoring version change, module unavailable).
Never predict a number or promise an outcome; every "before" value must come from the evidence and be labelled Observed. Body: the plan in five short labelled lines — Metric:, Before:, Success:, Window:, Invalid if:.`,
  acceptance: (ctx, output) => [...prohibitedTermHits(ctx, output), ...bodyLength(output, 2000)],
});
