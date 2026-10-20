# UX redesign changelog

Each phase has a full report in `docs/ux/`.

## Phase 3: scan and report (2026-10-20)

- **Report rebuilt** in reading order:
  - score with coverage, and a change shown only for comparable scans
  - "Do this first"
  - one card per source
  - key numbers, evidence photos, then every finding
- **"Do this first" is much higher on a phone:** 2,114 px from the top on an unlocked report instead of 4,977.
- **Findings** can be filtered by priority and source. Each one says why it matters, what to do next, and which source, date and limitation it comes from.
- **Undated evidence** shows the scan date, else "Date not recorded".
- **Save, share, print** on unlocked reports:
  - Save to my workspace leads to the Google-verified claim.
  - Copy link shares the public preview.
  - Print / save as PDF prints the whole report without site chrome.
- **Public preview** now shows each source's coverage and limitation openly instead of in a closed panel.
- **Scanning page** shows one row per source with its current step, and rows no longer jump when the status changes.
- **Unlock page:** the one required consent is set apart from the optional ones.
- **Scan wizard** split into a state hook and one file per step, with no visual change.

## Phase 2: public site (2026-10-20)

- **Kinnso OS brand** in the header, footer, page titles and Open Graph images, with a simpler nav (How it works · Pricing · Methodology) and one Free scan button.
- **Landing page** cut from 13 sections to 7:
  - One value line, the business field, an explicit market and one Start free scan button.
  - An 8-second illustration with no numbers or real business.
  - Then how it works, what we check, a Demo-labelled sample report, Free and Growth pricing, a five-question FAQ and a trust strip.
  - About 5,200 px tall on a phone instead of 15,500, with no photos.
- **Methodology and Trust** rebuilt with the shared visuals. The comparison table and how the work is prepared moved to Methodology, without agent names.
- **Honesty:** the hero no longer promises more customers (G-8), and the landing no longer claims a response-rate rise that the demo data contradicts (G-11).
- **CSS:** 36 KB of dead legacy rules removed, with no visual change elsewhere.

## Phase 1B: visual explanation and motion (2026-10-20)

- **Motion:** CSS presets with the still state as the default, plus small hooks (1.1 KB gzipped). Reduced motion shows every final state at once.
- **Visuals (`components/visual/`, 9.1 KB gzipped in total):**
  - score dial, coverage meter, trend chip and sparkline
  - impact/effort matrix and before/after compare
  - loop stepper, approval flow and scan progress
  - evidence preview, the "?" explainer and empty-state illustrations
  - feedback moments
  - a CSS page fade
- **Guardrails built in:** nothing compares scans that aren't comparable; unknown values are never 0; the matrix is labelled Recommended and before/after Attributed.
- **Checks:** zero axe violations and zero layout shift on the gallery in three locales, at two widths, in light and dark.
- **Not on pages yet:** they're wired in Phases 2–4.

## Phase 1: design system (2026-10-19)

- **Tokens and stylesheet structure**
  - One token file (`app/styles/tokens.css`).
  - Eight ordered cascade layers.
  - Pre-redesign CSS moved to `app/styles/legacy/`, with 541 unused rules removed.
- **Kinnso orange brand, AA contrast:** zero axe violations across 31 page states, two widths and three locales.
- **Workspace dark mode**
  - Light by default.
  - Light / Dark / Match device switch in the top bar; the choice is stored.
  - Public pages always light.
- **Typography**
  - 12 px type floor.
  - Chinese line height and line breaking.
  - Per-locale system font stacks.
  - 44 px touch targets on touch screens.
- **Component kit:** `components/kinnso/`, with guardrails built into the props.
- **Internal gallery:** `/[locale]/dev/design-system`, not served in production.
- **Dependencies removed:** `next-themes` and the Inter and Geist font packages; text uses system fonts only.

## Guardrail fixes (PR #94, before Phase 1)

- Unknown values are no longer shown as 0 on the share card, measurements, Home or Insights.
- The change ledger is gated on comparability.
- The trend glyph is flat when there is no comparable change.
- The landing sample is labelled Attributed.

## Phase 0: audit (2026-10-19)

- `docs/ux/audit.md`, `docs/ux/target-ia.md`, and 279 screenshots. These are on the `claude/optimistic-meitner-r5ntsa` branch.
