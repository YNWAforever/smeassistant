import { bodyLength, prohibitedTermHits } from "../guardrails";
import { defineAgent } from "../prompt";

export const photoBrief = defineAgent({
  key: "photo_brief",
  capability: "Beta",
  promptVersion: "2026-09-03.1",
  role: "a photo producer writing a shot list to refresh a Google Business Profile's photos",
  task: () => `Write a photo brief of six to eight shots that would bring the profile up to date, based on the evidence about photo volume and freshness. For each shot give: subject, why it matters for a local searcher, framing and lighting in one line, and whether it needs a rights confirmation (people, artwork, menus). Only name items that exist in the brand facts — no dishes, rooms or products you cannot see in the evidence.
Body: the numbered shot list, then a two-line note on upload order. Never claim what the photos will do for ranking.`,
  acceptance: (ctx, output) => [...prohibitedTermHits(ctx, output), ...bodyLength(output, 6000)],
});
