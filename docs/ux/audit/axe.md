# axe-core results

axe-core 4.10.3 via Playwright, tags wcag2a/2aa/21a/21aa/22aa, at 390 and 1440 px in zh-HK, zh-TW and en, run against the local fixture server on 2026-10-19. "Nodes" is summed over the six runs per page.

## Summary

| Rule | Impact | Nodes | Pages |
|---|---|---|---|
| `color-contrast` | serious | 105 | 31: action-detail, actions, activity, assets, billing, brand, calendar, create, demo-workspace, insights, integrations, landing, methodology, more, notifications, offers, onboarding, pricing, report-full, report-locked, sample-report, scan, scanning, select-workspace, sign-in, team, today, trust, unlock, viewer-action-detail, viewer-brand |
| `scrollable-region-focusable` | serious | 3 | 1: landing |

## Sample selectors

### `color-contrast` — Elements must meet minimum color contrast ratio thresholds

- `em`
- `a[aria-label="SME Scanner by Fimmick · 主頁"] > span:nth-child(2) > small`
- `.workspace-topbar-context > span`
- `a[aria-label="SME Scanner by Fimmick · home"] > span:nth-child(2) > small`
- `.plan-test-note`

### `scrollable-region-focusable` — Scrollable region must have keyboard access

- `.overflow-x-auto`

## Per page (violations per run, 390 / 1440 px, zh-HK · zh-TW · en)

| Page | zh-HK 390 | zh-HK 1440 | zh-TW 390 | zh-TW 1440 | en 390 | en 1440 |
|---|---|---|---|---|---|---|
| landing | 2 | 2 | 2 | 2 | 2 | 2 |
| demo-workspace | 0 | 1 | 0 | 1 | 0 | 1 |
| activity | 0 | 1 | 0 | 1 | 0 | 1 |
| sign-in | 0 | 1 | 0 | 1 | 0 | 1 |
| more | 0 | 1 | 0 | 1 | 0 | 1 |
| scan | 0 | 1 | 0 | 1 | 0 | 1 |
| select-workspace | 0 | 1 | 0 | 1 | 0 | 1 |
| scanning | 0 | 1 | 0 | 1 | 0 | 1 |
| offers | 0 | 1 | 0 | 1 | 0 | 1 |
| onboarding | 0 | 1 | 0 | 1 | 0 | 1 |
| report-locked | 0 | 1 | 0 | 1 | 0 | 1 |
| brand | 0 | 1 | 0 | 1 | 0 | 1 |
| today | 0 | 1 | 0 | 1 | 0 | 1 |
| report-full | 0 | 1 | 0 | 1 | 0 | 1 |
| integrations | 0 | 1 | 0 | 1 | 0 | 1 |
| actions | 0 | 1 | 0 | 1 | 0 | 1 |
| unlock | 0 | 1 | 0 | 1 | 0 | 1 |
| team | 0 | 1 | 0 | 1 | 0 | 1 |
| pricing | 1 | 2 | 1 | 2 | 1 | 2 |
| action-detail | 0 | 1 | 0 | 1 | 0 | 1 |
| billing | 0 | 1 | 0 | 1 | 0 | 1 |
| methodology | 0 | 1 | 0 | 1 | 0 | 1 |
| create | 0 | 1 | 0 | 1 | 0 | 1 |
| notifications | 0 | 1 | 0 | 1 | 0 | 1 |
| trust | 0 | 1 | 0 | 1 | 0 | 1 |
| viewer-action-detail | 0 | 1 | 0 | 1 | 0 | 1 |
| insights | 0 | 1 | 0 | 1 | 0 | 1 |
| sample-report | 0 | 1 | 0 | 1 | 0 | 1 |
| assets | 0 | 1 | 0 | 1 | 0 | 1 |
| viewer-brand | 0 | 1 | 0 | 1 | 0 | 1 |
| calendar | 0 | 1 | 0 | 1 | 0 | 1 |
