# Hosted acceptance (read-only) — 2026-10-09

Production `smeassistant.vercel.app` on `9e34b4f` (`dpl_irCSx2do1Eqw5YFbJJK7YiBPQq9v`), database at migration 14. Checked in the owner's Chrome session (role: owner of `nadagogo`) by reading pages only — no form was submitted, nothing was generated, approved, exported, rescanned or sent. Production logs were checked for the same window: only the long-standing pg SSL-mode warning, no functional errors.

| Area | Page | Result |
|---|---|---|
| Sign-in | `/zh-HK/owner/select-workspace` | pass — owner card for Nadagogo; shows **0 locations** (see F-19) |
| Home | `/zh-HK`, `/zh-TW`, `/en` `/owner/nadagogo` | renders (F-16 fixed); headline over-promises on an empty workspace (F-19) |
| Daily work | `/owner/nadagogo/actions` | pass — tabs all 0, filters render, empty state shown |
| Daily work | `/owner/nadagogo/create`, `/insights`, `/calendar`, `/assets`, `/activity` | pass — empty states, no errors |
| Settings | `/settings/integrations`, `/team`, `/billing`, `/brand`, `/notifications` | pass — Google not connected; one owner member; free plan 0 / 3 for 2026-10; subscription "contact Fimmick" |
| Onboarding | `/zh-HK/owner/onboarding` | renders; with no claim it only offers "start with a scan" and does not recognise the existing workspace (F-19) |
| Public report | `/zh-HK/r/3cuOKFmHdiYf00BOs27E_NO1` | pass — **T-14 hosted-verified**: limitations localised ("未提供 Instagram 帳號", "信任指標未能量度"); score/coverage shown |
| Unlock | `/zh-HK/unlock/3cuOKFmHdiYf00BOs27E_NO1` | pass — three separate consents; not submitted |
| Onboarding claim slug | `/zh-HK/owner/onboarding?claim=3cuOKFmHdiYf00BOs27E_NO1` (signed out) | pass — **T-03 first hop**: redirect to sign-in keeps the full `_` slug in `returnTo` |

## F-19 (new, P2) — an unlinked workspace looks ready

Nadagogo has no location, snapshot or action: its only audit event is a brand update (2026-10-03); the claim completion that creates the location never recorded anything. The home still said "下一個曝光提升機會已準備好 · 證據和草稿已備妥" and "AI 能見度團隊已完成分析", and nothing told the owner how to link the business. Fixed on `fix/f19-empty-workspace-home`: with no location, or one location without a snapshot, the headline, subtitle and AI-team strip say the workspace is waiting for its first scan, and a banner explains how to link the business (free scan → claim from the report, or ask Fimmick) with a link to `/scan`. A scanned location with nothing open gets a quiet headline; the existing headline stays when an action is open.

Linking Nadagogo itself is a data/ownership step (guardrail 15: Google verification or staff assignment), not a code change.

## Not run (side effects; need explicit approval or test identities)

Real scan (paid providers), AI generation (paid model), approve/export (counts deliveries), mark applied, rescan, team invite (sends email), Google connect (OAuth), and every manager/viewer/stranger boundary check (no test identities).
