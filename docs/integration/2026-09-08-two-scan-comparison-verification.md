# Two-scan comparison verification

Verified on 2026-09-08 from runtime commit `49f5272fe553b64902553c24facb5a39fcf36f45` plus the Task 5 test-only diff. The acceptance environment used its owned Docker PostgreSQL fixture and local Next.js server with fixture scan sources. It did not create a scan, call a provider, send email, use a shared database, or deploy.

## Executed evidence

- `corepack pnpm exec vitest run lib/report/comparison/derive.test.ts components/report/scan-comparison.test.tsx`: 2 files, 22 tests passed. Component coverage includes localized available values, unchanged rows and observation dates, IG-only neutral sample coverage, partial/unavailable explanations, distinct safe contexts, and public/locked omission.
- `corepack pnpm exec playwright test --config playwright.acceptance.config.ts e2e/acceptance/report-scan-comparison.spec.ts`: 1 selected Chromium test passed in 51.5 seconds, with no hidden skips.
- The browser fixture inserted a current scan, an earlier scan at the same location, and a third scan at another location into `environment.db`. Private query and summary sentinels stayed in stored private fields.
- Before unlock, the actual share route omitted comparison panel content and all private sentinels from HTML and an explicit `RSC: 1` response.
- After granting only the current report through the existing local unlock endpoint, the current private evidence survived and rendered. Earlier and different-location IDs, sentinels, and the earlier comparison date remained absent from HTML and RSC. The comparison panel rendered the localized `no_accessible_pair` state.
- The real route was checked in en, zh-HK, and zh-TW at widths 375 and 1440. Each viewport had no horizontal document overflow. Six screenshots are stored under `.superpowers/sdd/comparison/screenshots/`.

## Reachability limitation

The default share route does not inject the membership resolver required to authorize an earlier report independently. A current-report grant is job-bound and does not authorize the earlier scan, so a successful pair is not reachable through that route. The available, unchanged, IG-only, and partial states are verified with the real `ScanComparisonPanel` and safe derived props in component tests. No injectable browser-only comparison surface exists in the owned harness, so there is no successful-pair browser screenshot. This remains a release limitation rather than a passed browser case; no production fixture route or authentication widening was added.

The unavailable real-route panel contains no disclosure. Keyboard activation of successful-pair evidence disclosures therefore remains part of the same browser reachability gap; component rendering verifies the native `details`/`summary` structure and exact evidence content.