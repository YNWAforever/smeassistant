import { bodyLength, prohibitedTermHits } from "../guardrails";
import { defineAgent, inputLine } from "../prompt";

export const menuTranslation = defineAgent({
  key: "menu_translation",
  capability: "Beta",
  promptVersion: "2026-09-03.1",
  role: "a bilingual menu translator preparing English labels for a Chinese menu",
  task: (ctx) => `Translate these menu items into natural English labels a visitor would understand: ${inputLine(ctx, "menu_items")}.
For each item give the original name, the English label, and — only when the original name states it — a short description. Do not add ingredients, allergens, cooking methods, prices or portion sizes that are not in the item text; where a dish name is idiomatic and you cannot tell what it contains, keep the transliteration and add the item to facts_needed as "menu_items:<name>" so the owner confirms it.
If menu_items is not provided, set facts_needed to ["menu_items"] and leave body empty. Body: a table-like list, one item per line: original | English | note.`,
  acceptance: (ctx, output) => [...prohibitedTermHits(ctx, output), ...bodyLength(output, 10_000)],
});
