import { bodyLength, prohibitedTermHits } from "../guardrails";
import { defineAgent, inputLine } from "../prompt";

export const websiteBasics = defineAgent({
  key: "website_basics",
  capability: "Live",
  promptVersion: "2026-09-12.1",
  role: "a web copywriter fixing a small business website's title, meta description and main heading",
  task: (ctx) => `evidence.snapshot.website_checks.results lists every check with what was observed on the page today: \`title\` and \`meta_description_50_160\` report a character count (or "missing"), \`single_h1\` reports how many H1 elements were found, and \`https\` reports the host. Use those observations; they are the only record of the current page you have, and you have not seen its wording.
Write: (1) a page title of at most 60 characters naming the business, what it does and the district; (2) a meta description of 120–155 characters that describes the business plainly and uses the approved claim "${inputLine(ctx, "approved_claim")}" only if it fits naturally; (3) one H1 that states what the business is in plain words.
Body: three labelled lines — Title:, Description:, H1: — each followed on the same line by " (now: <what the check observed>)" quoting the observation verbatim, then a one-paragraph note of what to change on the page.
acceptance_criteria: one entry per line you wrote, naming the check it should make pass (title, meta_description_50_160, single_h1), so the next scan can confirm each one separately.
Do not describe the current wording, and do not claim the page already says anything: the checks report counts, not text. Do not invent services, prices or awards; use only brand facts.`,
  acceptance: (ctx, output) => {
    const warnings = [...prohibitedTermHits(ctx, output), ...bodyLength(output, 3000)];
    // The Title line now ends with the " (now: 57 chars)" annotation the task
    // asks for. That is commentary about the current page, not title text --
    // counting it would flag a compliant title as over-long.
    const titleLine = /Title:\s*(.+)/i.exec(output.body)?.[1]?.trim();
    const title = titleLine?.replace(/\s*\(now:[^)]*\)\s*$/i, "").trim();
    if (title && title.length > 60) warnings.push("title_over_60_chars");
    return warnings;
  },
});
