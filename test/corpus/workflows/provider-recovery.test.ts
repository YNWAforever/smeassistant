import { expect, it } from "vitest";
import { cannedLlm, loadCorpus, runCorpusCase } from "./harness";

it.each(["hk", "tw"])("%s retries a rejected provider call once within the existing generation budget", async (market) => {
  const base = loadCorpus().find((c) => c.id === `audit-gbp_post-${market}-normal`)!;
  const outputs = [{ throws: "Synthetic provider timeout" }, ...base.cannedOutputs];
  const run = await runCorpusCase({ ...base, cannedOutputs: outputs }, cannedLlm(outputs));
  expect(run.llmCalls).toBe(2);
  expect(run.result).toMatchObject({ state: "succeeded", versionId: "v-corpus" });
  expect(run.finishInput.reason).toBeUndefined();
});
