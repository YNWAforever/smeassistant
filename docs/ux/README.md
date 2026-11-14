# Kinnso OS UX redesign

The redesign of the SME scanner workspace as **Kinnso OS** (decided 2026-10-19). This folder holds the phase reports, the changelog and the screenshots they cite.

## Reports

| Phase | Scope | Report |
|---|---|---|
| 0 | Audit, target information architecture | `audit.md` and `target-ia.md` on the `claude/optimistic-meitner-r5ntsa` branch |
| 1 | Design system: tokens, cascade layers, components, workspace dark mode | [PHASE-1-REPORT.md](PHASE-1-REPORT.md) |
| 1B | Visual explanation and motion | [PHASE-1B-REPORT.md](PHASE-1B-REPORT.md) |
| 2 | Public site | [PHASE-2-REPORT.md](PHASE-2-REPORT.md) |
| 3 | Scan and report | [PHASE-3-REPORT.md](PHASE-3-REPORT.md) |
| 4 | Workspace shell and navigation | [PHASE-4-REPORT.md](PHASE-4-REPORT.md) |
| 5 | Onboarding and states | [PHASE-5-REPORT.md](PHASE-5-REPORT.md) |
| 6 | Quality: accessibility, performance, copy, acceptance | [PHASE-6-REPORT.md](PHASE-6-REPORT.md) |
| 7 | Repo hygiene and finishing | [PHASE-7-REPORT.md](PHASE-7-REPORT.md) |
| 8 | Workspace screens off the legacy stylesheet | [PHASE-8-REPORT.md](PHASE-8-REPORT.md) |
| 9 | Tidy the workspace screen files | [PHASE-9-REPORT.md](PHASE-9-REPORT.md) |
| 10 | Shared classes and public pages off the legacy stylesheet | [PHASE-10-REPORT.md](PHASE-10-REPORT.md) |
| 11 | Legacy layer removed | [PHASE-11-REPORT.md](PHASE-11-REPORT.md) |
| 12 | Owner IA v2: one next step, one Kinnso chat | [PHASE-12-OWNER-IA-REPORT.md](PHASE-12-OWNER-IA-REPORT.md) |
| 13 | Owner journey continuity and evidence | [PHASE-13-OWNER-JOURNEY.md](PHASE-13-OWNER-JOURNEY.md) |
| 14 | Streaming recovery, keyboard focus and history reading position | [PHASE-14-STREAMING-ACCESSIBILITY.md](PHASE-14-STREAMING-ACCESSIBILITY.md) |
| 15 | Shared Studio turn deadline and durable finalization | [PHASE-15-STUDIO-DEADLINE.md](PHASE-15-STUDIO-DEADLINE.md) |
| 16 | Session reliability | [PHASE-16-SESSION-RELIABILITY.md](PHASE-16-SESSION-RELIABILITY.md) |
| 17 | Manual accessibility validation — planned, not tested | [PHASE-17-ACCESSIBILITY-VALIDATION.md](PHASE-17-ACCESSIBILITY-VALIDATION.md) |
| 18 | Controlled streaming resilience | [PHASE-18-STREAMING-RESILIENCE-PLAN.md](PHASE-18-STREAMING-RESILIENCE-PLAN.md) |

[CHANGELOG.md](CHANGELOG.md) summarises every phase in plain language.

Each report starts with that phase's decisions. The decisions that hold across the whole redesign are also in the CLAUDE.md decisions log.

## Where things live

| What | Where |
|---|---|
| Design tokens (colour, type, spacing, radius, motion) | `app/styles/tokens.css` |
| Stylesheets, in cascade-layer order | `app/globals.css` imports `theme, tokens, base, components, utilities, legacy, pages, i18n, a11y` |
| Workspace screen styles (moved out of legacy) | `app/styles/screens/`, in the `screens` sub-layer of `pages` |
| Pixel check for style changes (manual) | `test/visual/` |
| Component kit | `components/kinnso/` |
| Visuals and motion (score dial, coverage, charts, steps, illustrations) | `components/visual/` |
| Page states (error, loading, empty, role notices) | `components/states/` |
| All user-facing text | `lib/copy.ts` and the `lib/copy-*.ts` dictionaries, in en, zh-HK and zh-TW |
| Design-system gallery (development only) | `/[locale]/dev/design-system` |

## Captures

The `phase-*/` folders hold the screenshots each report links to. They are evidence for review, not test fixtures.
