# Hosted acceptance — linked workspace (2026-10-10)

Production `smeassistant.vercel.app` on `9976c5c` redeployed with `OPERATOR_EMAILS` and `ASSISTED_ASSIGNMENT_ENABLED=true` (DEC-06 temporary internal-test activation, `BUSINESS-AND-HOSTED-DECISIONS.md`). Database: production branch `br-wandering-field-azdc91yj`, journal 1–15, all public objects owned by `smeassistant_migrator`.

## Flow run by the owner

| Step | Result |
|---|---|
| Free scan of Nadagogo (Wan Chai izakaya), report `/zh-HK/r/rwGNE2DDRVpEPKQ1suqeGXaU` | `partial`, coverage 0.6, overall 90. Google Business Profile measured (SerpApi); Instagram failed (RapidAPI 429 ×3); several SerpApi organic queries timed out. |
| Unlock with the requester email | lead recorded (the magic-link route reached the provider, which it only does for a lead) |
| Sign-in | Google sign-in worked but landed on `/owner/select-workspace` without the claim (F-20). Email magic link was rejected by the provider (F-21). Opening `/zh-HK/owner/onboarding?claim=…` directly showed the access-request form. |
| Access request → operator approval (`/zh-HK/ops/access-requests`) | approved; workspace `nadagogo-2` created, job attached |
| Onboarding completion | 1 location, 1 snapshot, 3 actions; events workspace.assigned → integration.updated → snapshot.created → action.derived → workspace.claimed |

The requester account turned out to own the old test workspace `nadagogo` too; it was not changed (0 locations, same job count, only its brand.updated event). The requester now sees two workspaces named Nadagogo; `nadagogo-2` is the linked one.

## Read-only page checks (Chrome, requester session)

| Page | Result |
|---|---|
| `/zh-HK/owner/nadagogo-2` | pass — headline "下一個曝光提升機會已準備好" with an open action (F-19 rule), score 90 / 60% coverage, "not comparable", three open decisions |
| `/en/owner/nadagogo-2` | pass — same content in English |
| `/zh-HK/owner/nadagogo-2/actions` | pass — "本地搜尋簡報" with observed evidence, priority factors (impact +15, readiness +10, severity +8), 20 minutes, inputs complete |
| `/zh-HK/owner/nadagogo-2/insights` | pass — one scan, no trend drawn, coverage 60% with unmeasured sources not counted as zero; Google rating 4.6, AI citations 1, website 11/15; ai_mode 1/1, ai_overview 0/1, organic 0/1 |
| `/zh-HK/owner/nadagogo-2/activity` | pass with a copy note (F-22) |
| `/zh-TW/owner/nadagogo-2/settings/integrations` | pass — Google not connected (requires connection), Instagram @nadagogo.hk "failed" (honest: 429 at scan time), website 11/15 measured |
| `/zh-HK/owner/select-workspace` | pass — approved request status, both workspaces listed |
| Browser console | no errors |

## Not run

AI generation (paid model), approve/export, mark applied, rescan, team invite, Google connect, and every manager/viewer/stranger boundary check. Those still need per-item approval and test identities.

## After this check

Per DEC-06, `ASSISTED_ASSIGNMENT_ENABLED` goes back off in production (owner action); `OPERATOR_EMAILS` may stay.
