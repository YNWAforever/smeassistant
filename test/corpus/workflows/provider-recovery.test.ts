import { expect, it } from "vitest";
import { cannedLlm, loadCorpus, runCorpusCase } from "./harness";

it.each(["hk", "tw"])("%s refuses a second inference when a timeout leaves provider usage unknown", async (market) => {
  const base = loadCorpus().find((c) => c.id === `audit-gbp_post-${market}-normal`)!;
  const outputs = [{ throws: "Synthetic provider timeout" }, ...base.cannedOutputs];
  const run = await runCorpusCase({ ...base, cannedOutputs: outputs }, cannedLlm(outputs));
  expect(run.llmCalls).toBe(1);
  expect(run.result).toMatchObject({ state: "failed" });
  expect(run.result.versionId).toBeUndefined();
  expect(run.finishInput.reason).toBe("action_run_failed");
  expect(run.finishInput.output).toBeNull();
  expect(run.finishInput.costUsd).toBeNull();
});
