# Inventory (generated 2026-10-19 from `697ef29`)

Line counts by `wc -l`. ⚠ = over 400 lines. Tests excluded.

## Routes — app/[locale] pages and layouts

| Route file | Lines |
|---|---|
| `app/[locale]/demo-workspace/page.tsx` | 22 |
| `app/[locale]/layout.tsx` | 30 |
| `app/[locale]/legal/privacy/page.tsx` | 39 |
| `app/[locale]/legal/terms/page.tsx` | 39 |
| `app/[locale]/methodology/page.tsx` | 15 |
| `app/[locale]/ops/access-requests/[requestId]/page.tsx` | 78 |
| `app/[locale]/ops/access-requests/page.tsx` | 64 |
| `app/[locale]/ops/failures/page.tsx` | 153 |
| `app/[locale]/owner/[workspaceSlug]/actions/[actionId]/page.tsx` | 111 |
| `app/[locale]/owner/[workspaceSlug]/actions/page.tsx` | 56 |
| `app/[locale]/owner/[workspaceSlug]/activity/page.tsx` | 40 |
| `app/[locale]/owner/[workspaceSlug]/assets/page.tsx` | 31 |
| `app/[locale]/owner/[workspaceSlug]/calendar/page.tsx` | 17 |
| `app/[locale]/owner/[workspaceSlug]/create/page.tsx` | 46 |
| `app/[locale]/owner/[workspaceSlug]/insights/page.tsx` | 17 |
| `app/[locale]/owner/[workspaceSlug]/layout.tsx` | 39 |
| `app/[locale]/owner/[workspaceSlug]/more/page.tsx` | 16 |
| `app/[locale]/owner/[workspaceSlug]/offers/page.tsx` | 68 |
| `app/[locale]/owner/[workspaceSlug]/packs/[packId]/page.tsx` | 76 |
| `app/[locale]/owner/[workspaceSlug]/page.tsx` | 76 |
| `app/[locale]/owner/[workspaceSlug]/settings/billing/page.tsx` | 37 |
| `app/[locale]/owner/[workspaceSlug]/settings/brand/page.tsx` | 22 |
| `app/[locale]/owner/[workspaceSlug]/settings/integrations/page.tsx` | 19 |
| `app/[locale]/owner/[workspaceSlug]/settings/notifications/page.tsx` | 17 |
| `app/[locale]/owner/[workspaceSlug]/settings/team/page.tsx` | 24 |
| `app/[locale]/owner/onboarding/page.tsx` | 204 |
| `app/[locale]/owner/select-workspace/page.tsx` | 68 |
| `app/[locale]/owner/sign-in/complete/page.tsx` | 27 |
| `app/[locale]/owner/sign-in/page.tsx` | 36 |
| `app/[locale]/page.tsx` | 24 |
| `app/[locale]/pricing/page.tsx` | 28 |
| `app/[locale]/r/[slug]/opengraph-image.tsx` | 76 |
| `app/[locale]/r/[slug]/page.tsx` | 47 |
| `app/[locale]/r/[slug]/recover/page.tsx` | 25 |
| `app/[locale]/sample-report/page.tsx` | 18 |
| `app/[locale]/scan/page.tsx` | 41 |
| `app/[locale]/scanning/[jobId]/page.tsx` | 25 |
| `app/[locale]/start/[slug]/page.tsx` | 61 |
| `app/[locale]/trust/page.tsx` | 15 |
| `app/[locale]/unlock/[slug]/page.tsx` | 40 |
| `app/[locale]/unsubscribe/page.tsx` | 41 |

## Routes — app/auth

- `app/auth/callback/route.ts`

## Routes — app/api (route handlers, names only)

- `/api/access-requests`
- `/api/actions/[actionId]/applied`
- `/api/actions/[actionId]/owner-check`
- `/api/actions/[actionId]`
- `/api/actions/[actionId]/run`
- `/api/actions/[actionId]/versions`
- `/api/actions`
- `/api/assistant/run`
- `/api/assistant/suggestions`
- `/api/auth/[...path]`
- `/api/business/ig-search`
- `/api/business/search`
- `/api/cron/dispatch`
- `/api/deliveries/[deliveryId]/reconcile`
- `/api/deliveries/[deliveryId]/reply`
- `/api/internal/workspace-scan-completion`
- `/api/mail/unsubscribe`
- `/api/oauth/google/callback`
- `/api/oauth/google/claim/callback`
- `/api/oauth/google/claim/start`
- `/api/oauth/google/start`
- `/api/offers/[offerId]/archive`
- `/api/offers/[offerId]/confirm`
- `/api/offers/[offerId]/promotions`
- `/api/offers/[offerId]`
- `/api/ops/access-requests/[requestId]`
- `/api/ops/failures/scans/[jobId]/release`
- `/api/owner/magic-link`
- `/api/owner/sign-in/complete`
- `/api/packs/[packId]`
- `/api/report-access/recover`
- `/api/report-access/redeem`
- `/api/report-access/sign-out`
- `/api/report-access/unlock`
- `/api/scan/process`
- `/api/scan/start`
- `/api/scan/status`
- `/api/start/[slug]/preview`
- `/api/unlock`
- `/api/versions/[versionId]/approve`
- `/api/versions/[versionId]/export`
- `/api/versions/[versionId]/publish`
- `/api/versions/[versionId]/publish/targets`
- `/api/versions/[versionId]/reject`
- `/api/versions/[versionId]/request-changes`
- `/api/webhooks/stripe`
- `/api/workspace-invites/magic-link`
- `/api/workspaces/[workspaceId]/actions/bulk`
- `/api/workspaces/[workspaceId]/actions`
- `/api/workspaces/[workspaceId]/assets/[assetId]/preview`
- `/api/workspaces/[workspaceId]/assets/[assetId]`
- `/api/workspaces/[workspaceId]/assets`
- `/api/workspaces/[workspaceId]/billing-portal`
- `/api/workspaces/[workspaceId]/brand`
- `/api/workspaces/[workspaceId]/checkout-link`
- `/api/workspaces/[workspaceId]/fix-pack-drafts/[runId]`
- `/api/workspaces/[workspaceId]/fix-pack-drafts`
- `/api/workspaces/[workspaceId]/google-connection`
- `/api/workspaces/[workspaceId]/instagram-handle`
- `/api/workspaces/[workspaceId]/members/[memberId]/resend`
- `/api/workspaces/[workspaceId]/members/[memberId]`
- `/api/workspaces/[workspaceId]/members`
- `/api/workspaces/[workspaceId]/my-mail-preferences`
- `/api/workspaces/[workspaceId]/notification-preferences`
- `/api/workspaces/[workspaceId]/notifications`
- `/api/workspaces/[workspaceId]/offers`
- `/api/workspaces/[workspaceId]/packs`
- `/api/workspaces/[workspaceId]/rescan`
- `/api/workspaces/[workspaceId]/usage`
- `/api/workspaces/claim`

## components

| File | Lines |
|---|---|
| `hydration-marker.tsx` | 20 |
| `landing-page.tsx` | 655 ⚠ |
| `legal-document.tsx` | 58 |
| `locale-data-provider.tsx` | 17 |
| `motion-director.tsx` | 80 |
| `onboarding-page.tsx` | 336 |
| `product-ui.tsx` | 319 |
| `public-chrome.tsx` | 83 |
| `public-demo-workspace.tsx` | 85 |
| `public-pages.tsx` | 203 |
| `report-view.tsx` | 360 |
| `scan-page.tsx` | 759 ⚠ |
| `scan-stuck-card.tsx` | 30 |
| `scanning-page.tsx` | 450 ⚠ |
| `select-workspace-page.tsx` | 107 |
| `sign-in-page.tsx` | 18 |
| `unlock-page.tsx` | 240 |
| `workspace-shell.tsx` | 224 |

## components/workspace

| File | Lines |
|---|---|
| `access-request-form.tsx` | 109 |
| `access-request-status.tsx` | 42 |
| `action-detail-client.tsx` | 1041 ⚠ |
| `action-detail-view.tsx` | 40 |
| `action-filters.tsx` | 66 |
| `actions-list-view.tsx` | 123 |
| `activity-view.tsx` | 92 |
| `asset-preview.tsx` | 19 |
| `assets-client.tsx` | 99 |
| `assets-view.tsx` | 65 |
| `billing-actions.tsx` | 43 |
| `billing-view.tsx` | 116 |
| `brand-client.tsx` | 339 |
| `brand-view.tsx` | 23 |
| `bulk-action-dialog.tsx` | 81 |
| `calendar-view.tsx` | 46 |
| `create-view.tsx` | 210 |
| `evidence-gallery.tsx` | 54 |
| `fix-pack-card.tsx` | 121 |
| `gbp-publish-card.tsx` | 364 |
| `home-brief.tsx` | 287 |
| `insights-view.tsx` | 140 |
| `integrations-client.tsx` | 148 |
| `integrations-view.tsx` | 94 |
| `location-select.tsx` | 54 |
| `more-view.tsx` | 40 |
| `needs-attention-card.tsx` | 23 |
| `notifications-client.tsx` | 201 |
| `notifications-view.tsx` | 66 |
| `offer-promotion-panel.tsx` | 150 |
| `offers-view.tsx` | 391 |
| `owner-review-check-panel.tsx` | 186 |
| `pack-card.tsx` | 194 |
| `pack-items.tsx` | 121 |
| `pack-test-fixtures.ts` | 66 |
| `pack-view.tsx` | 104 |
| `problem-item.tsx` | 61 |
| `problems-list.tsx` | 15 |
| `rescan-button.tsx` | 169 |
| `team-client.tsx` | 215 |
| `team-view.tsx` | 91 |

## components/pocket-assistant

| File | Lines |
|---|---|
| `artifact-preview.tsx` | 24 |
| `assistant-launcher.tsx` | 60 |
| `assistant-sheet.tsx` | 448 ⚠ |
| `evidence-card.tsx` | 41 |
| `run-status.tsx` | 14 |

## components/report

| File | Lines |
|---|---|
| `dashboard-metrics.tsx` | 68 |
| `dashboard-priorities.tsx` | 23 |
| `dashboard-summary.tsx` | 77 |
| `dashboard.module.css` | 60 |
| `evidence-gallery.module.css` | 21 |
| `evidence-gallery.tsx` | 95 |
| `recover-redeem.tsx` | 52 |
| `recovery-form.tsx` | 96 |
| `scan-comparison.tsx` | 51 |
| `scan-metrics.tsx` | 73 |

## components/auth

| File | Lines |
|---|---|
| `sign-in-completion.tsx` | 109 |
| `sign-in-copy.ts` | 217 |
| `sign-in-flow.tsx` | 229 |
| `sign-in.module.css` | 27 |

## components/preview

| File | Lines |
|---|---|
| `preview-draft-form.tsx` | 195 |

## components/mail

| File | Lines |
|---|---|
| `unsubscribe-client.tsx` | 68 |

## components/ops

| File | Lines |
|---|---|
| `access-request-decision.tsx` | 78 |
| `ops-nav.tsx` | 18 |
| `release-button.tsx` | 46 |

## components/ui

| File | Lines |
|---|---|
| `accordion.tsx` | 66 |
| `alert-dialog.tsx` | 196 |
| `alert.tsx` | 66 |
| `aspect-ratio.tsx` | 11 |
| `attachment.tsx` | 204 |
| `avatar.tsx` | 109 |
| `badge.tsx` | 48 |
| `breadcrumb.tsx` | 109 |
| `bubble.tsx` | 125 |
| `button-group.tsx` | 83 |
| `button.tsx` | 64 |
| `card.tsx` | 92 |
| `checkbox.tsx` | 32 |
| `collapsible.tsx` | 33 |
| `context-menu.tsx` | 252 |
| `dialog.tsx` | 158 |
| `direction.tsx` | 22 |
| `dropdown-menu.tsx` | 257 |
| `empty.tsx` | 104 |
| `field.tsx` | 248 |
| `hover-card.tsx` | 44 |
| `input-group.tsx` | 170 |
| `input.tsx` | 21 |
| `item.tsx` | 193 |
| `kbd.tsx` | 28 |
| `label.tsx` | 24 |
| `marker.tsx` | 69 |
| `menubar.tsx` | 276 |
| `message.tsx` | 92 |
| `native-select.tsx` | 62 |
| `navigation-menu.tsx` | 168 |
| `pagination.tsx` | 127 |
| `popover.tsx` | 89 |
| `progress.tsx` | 32 |
| `radio-group.tsx` | 45 |
| `scroll-area.tsx` | 58 |
| `select.tsx` | 190 |
| `separator.tsx` | 28 |
| `sheet.tsx` | 148 |
| `sidebar.tsx` | 723 ⚠ |
| `skeleton.tsx` | 13 |
| `slider.tsx` | 63 |
| `sonner.tsx` | 40 |
| `spinner.tsx` | 16 |
| `switch.tsx` | 35 |
| `table.tsx` | 116 |
| `tabs.tsx` | 91 |
| `textarea.tsx` | 18 |
| `toggle-group.tsx` | 83 |
| `toggle.tsx` | 47 |
| `tooltip.tsx` | 57 |

## Stylesheets

| File | Lines |
|---|---|
| `app/editorial.css` | 2193 |
| `app/globals.css` | 93 |
| `app/polish.css` | 1520 |
| `app/ramp-refresh.css` | 3225 |
| `app/responsive.css` | 63 |
| `vendor/shadcn-tailwind-4.13.0.css` | 629 |

## Copy modules

| File | Lines |
|---|---|
| `lib/copy.ts` | 522 ⚠ |
| `lib/copy-dictionaries.ts` | 1270 ⚠ |
| `lib/copy-workspace.ts` | 1067 ⚠ |
| `lib/messages/en.json` | 541 ⚠ |
| `components/auth/sign-in-copy.ts` | 217 |
