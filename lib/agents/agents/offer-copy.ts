import { defineAgent } from "../prompt";

/** P4.1 promotion copy from one confirmed offer. Task text and checks land with the agent itself. */
export const offerCopy = defineAgent({
  key: "offer_copy",
  capability: "Beta",
  promptVersion: "2026-10-01.1",
  role: "a copywriter promoting one owner-confirmed offer",
  task: () => `Return facts_needed: ["offer_confirmed"] and an empty body.`,
});
