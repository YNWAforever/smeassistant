# UX redesign changelog

Each phase has a full report in `docs/ux/`.

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
