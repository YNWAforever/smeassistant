# OWNER-EXPERIENCE-BLUEPRINT — SME Scanner Visibility Workspace

**Companion to `AUDIT-REPORT.md`** · Baseline: `main @ 8f4c5b4` (the commit the production alias serves) · 2026-09-09

Everything here is a **proposal**. Nothing in this document has been implemented. Where a recommendation depends on a business decision rather than a code change, it says so.

---

## 1. Positioning recommendation

### 1.1 The naming problem, stated from the owner's side

An owner meets three product names before they have received anything: **SME Scanner** (the public brand and the scan), **Visibility Workspace** (the authenticated area), and **Pocket Assistant / Visibility Operator** (the assistant, which carries two names in the codebase itself). On top of that the landing page introduces four named characters — 能見度偵察, 優先次序教練, 行動與品質工作室, 審批與成效. That is seven proper nouns to learn before the first useful output.

The owner does not need any of them. A restaurant owner in Hong Kong wants to know: *will more customers find me, what should I fix first, and will you write it for me?*

### 1.2 Recommendation

**Adopt "SME Assistant" as the single owner-facing umbrella name, and demote the layer names to plain nouns.** This is a positioning recommendation only — it is **not** authorization to rename packages, routes, database objects, the Vercel project or the `@sme-scanner/*` integrations, all of which should stay exactly as they are.

| Layer | Today (owner-facing) | Proposed owner-facing | Internal name (unchanged) |
|---|---|---|---|
| Umbrella | *(none — "SME Scanner by Fimmick")* | **SME Assistant**（Fimmick 出品） | — |
| Public discovery | SME Scanner | **免費能見度檢查** | SME Scanner / scan-engine |
| Authenticated area | Visibility Workspace / 增長工作台 | **我的工作台** | Visibility Workspace |
| Contextual assistant | Pocket Assistant / Visibility Operator / 隨身增長助理 | **助理** — a function, never a character | Visibility Operator |
| The four specialists | 四位 AI 專員, each named | Keep the *section*, drop the personas: describe four **steps** | `lib/agents/*` |

The four-specialist section should stay, because it does real persuasive work — it explains that this is a sequence with a human checkpoint, not a chatbot. But it should describe what happens, not introduce staff. An owner who has to remember "Priority Coach" has been given homework.

One name that should **not** change: keep 掃描 ("scan") prominent. It is concrete, sets the right expectation (we read public evidence), and names the thing the product is genuinely good at.

### 1.3 What must survive the rename

The three product layers stay exactly as they are architecturally. The scanner remains the primary acquisition and diagnosis capability; the workspace remains the only place approvals and deliveries happen; and the assistant remains contextual — it explains evidence, suggests the next step and prepares work, and it must continue to be incapable of approving or publishing anything (which the code currently guarantees: the assistant receives a read-only repository at `lib/repositories/artifacts.ts:135`).

---

## 2. Route map: existing, proposed, intentionally restricted

### 2.1 Public routes

| Route | Status | Change proposed |
|---|---|---|
| `/{locale}` | Existing | Revised hero, outcome-led entries, visible sign-in (§3, §7) |
| `/{locale}/scan` | Existing | Keep. Fix coverage preview wording; answer "no website / no Google listing" inline |
| `/{locale}/scanning/[jobId]` | Existing | **Fix F-14** (raw 0–1 coverage shown as a percent); **fix F-36** (all collectors shown "measured" on partial); add elapsed-time and stalled states (**F-18**) |
| `/{locale}/r/[slug]` | Existing | **Add the join entry point** (§4.1) — the single highest-value change in this document; render `?claim=<reason>` outcomes (**F-05**) |
| `/{locale}/unlock/[slug]` | Existing | Add "繼續認領此商戶" as the post-unlock next step; stop promising a delivery channel the system cannot use (**F-25**) |
| `/{locale}/pricing` | Existing | Correct the allowance and seat claims to match enforcement (**F-16**) |
| `/{locale}/sample-report`, `/demo-workspace` | Existing | Keep. Demo labelling is already correct — do not weaken it |
| `/{locale}/methodology`, `/trust`, `/legal/*` | Existing | Keep. Remove the recovery-link row from Trust until that route exists |
| `/{locale}/owner/sign-in` (+ `/complete`) | Existing | Keep PR #12's guided flow. Surface the returning-owner path at all widths (**F-28**) |
| `/{locale}/start/[jobId]` | **Proposed** | Provisional draft space (§5). Requires a completed scan; claims nothing |

### 2.2 Authenticated routes

All exist and are membership-gated; this proposal reuses them rather than restructuring: `/{locale}/owner/[workspaceSlug]/` + `{'' | actions | actions/[id] | create | insights | assets | calendar | activity | more | settings/{brand,integrations,team,notifications,billing}}`, plus `/owner/onboarding` and `/owner/select-workspace`.

The candidate mobile structure **今日 / 待辦 / 製作 / 成效 / 更多** maps onto what already exists, so adopt it as labels only — no new routes:

| Proposed tab | Existing route | Backed by real capability? |
|---|---|---|
| 今日 | `/owner/[slug]` | Yes — `getHomeBrief` already returns what changed, one priority action, drafts awaiting approval, next scan date |
| 待辦 | `/owner/[slug]/actions` | Yes — derived actions with priority factors; urgent count already badges the nav |
| 製作 | `/owner/[slug]/create` | Yes — template picker across 11 agents |
| 成效 | `/owner/[slug]/insights` | **Partly** — score series and measurements are real, but comparison depends on rescan, which is paid-gated and has no scheduler (**F-18**, **F-19**) |
| 更多 | `/owner/[slug]/more` | Yes — already links assets, calendar, activity, brand, integrations, team, notifications, billing |

**Do not force this navigation change before the join door opens.** The current navigation is not what is stopping owners.

### 2.3 Intentionally restricted — keep restricted

Direct publishing to Google Business or Instagram (`google_business_publish`, `instagram_publish`), external scan dispatch beyond Vercel, and email-match self-service claim (`OWNER_SELF_SERVICE_CLAIM`). Export/copy remains the only delivery in v1. Add a deploy-time guard that refuses to boot when `OWNER_SELF_SERVICE_CLAIM` is set (**F-37**), so guardrail 15 is enforced by the build rather than by memory.

---

## 3. Homepage: what it must answer, and proposed copy

Six questions belong above or near the fold. Today three are answered well (who it is for, what the loop is, what it costs); "what useful output will I receive?" is answered only through a demo panel, and "what should I do now if I already have an account?" is answered invisibly on mobile.

### 3.1 Proposed zh-HK hero

```
Eyebrow   用得到的能見度改善，由一次免費檢查開始

H1        顧客搜尋時找不到你？
          我們找出原因，再幫你寫好要改的內容。

Lead      免費檢查你的 Google、地圖、AI 搜尋及 Instagram 公開資料，
          列出最值得先處理的三件事。你批准之後，才會產出可用的內容。

Trust     毋須登入開始 · 只讀取公開資料 · 任何內容送出前由你批准

CTA 1     [ 免費檢查我的生意 ]        → /{locale}/scan
CTA 2     [ 看看報告長甚麼樣 ]        → /{locale}/sample-report
Tertiary  已經有工作台？店主登入 →     /{locale}/owner/sign-in
```

Two deliberate changes. The current H1 states a benefit but not a problem; leading with the owner's actual symptom — *customers can't find me* — is more likely to earn the scan. And the returning-owner link becomes visible tertiary text in the hero, because at mobile width it is currently invisible (**F-28**).

### 3.2 Three outcome-led use cases

Each is backed by a Live capability that exists today (see `AGENT-TOOL-CAPABILITY-MATRIX.md`). No card promises anything unimplemented.

```
卡 1 — 回覆積壓的評論
     「發現 7 則評論未有回覆」
     我們讀取你 Google 檔案上的公開評論，草擬符合你語氣的回覆。
     你可以逐則修改、批准，再複製貼上發佈。
     [ 檢查我的評論狀況 ]      → /scan?intent=reviews

卡 2 — 補上顧客最常問的答案
     「網站未有常見問題結構化資料」
     我們根據檢查結果寫出常見問題內容，以及可直接貼上的 JSON-LD，
     讓 Google 與 AI 搜尋更容易引用你的答案。
     [ 檢查我的網站 ]          → /scan?intent=faq

卡 3 — 修好 Google 檔案的基本資料
     「營業時間、分類或簡介不完整」
     我們列出具體要改甚麼、改成甚麼，你批准後匯出照做即可。
     [ 檢查我的 Google 檔案 ]  → /scan?intent=profile
```

Each card routes into the **existing scan**, carrying an `intent` that pre-selects the matching objective and, after the claim, pre-selects the matching template. This is the outcome-led route the product direction asks for, at the cost of one query parameter rather than a second product.

### 3.3 The work loop, in one line each

```
1. 檢查       讀取公開證據，列出可核實的缺口（不會憑空給分）
2. 排序       按影響、急切性與證據強度，選出最值得先做的一件
3. 草擬       AI 依你的品牌資料與已核實事實寫出草稿
4. 你批准     未經你批准，甚麼都不會發出
5. 匯出       複製或下載，由你發佈（我們不會代你發佈）
6. 重新檢查   下次檢查用同樣標準比較，證明有沒有改善
```

Step 5's parenthesis matters and should not be softened: export is not publishing, and the code enforces exactly that.

### 3.4 Pricing and limits

Current pricing copy contradicts the code (**F-16**): it promises 12 monthly deliveries, 36 pooled and 2 seats; enforcement is 3 for `lite`, unlimited for `paid`, and no seat limit exists anywhere. **This is a business decision, not a bug to patch quietly in copy.** Two coherent options:

- **Option A (recommended — copy follows code):** free scan = 1 scan and 3 approved deliveries; Growth = unlimited approved deliveries at HK$888/月. Simplest to explain, already what the code does, and removes the mid-period upgrade trap entirely. Requires only deleting the seat claim.
- **Option B (code follows copy):** implement 12/36 monthly allowances and a seat limit. More engineering, and it makes **F-20** (allowance frozen at row creation) a live customer-facing problem on the first mid-month upgrade.

Whichever is chosen, keep the delivery definition verbatim — it is one of the clearest things on the site:

> 只有指定版本獲你批准並首次成功匯出，才計 1 次交付。查看證據、排序、重新檢查、生成、修改、退回或執行失敗，都不會扣減。

---

## 4. Joining: the flow that has to change

This is the core of the blueprint. Today the report is a terminus; it must become a door.

### 4.1 Report → join (fixes F-01, F-05, F-27)

Add a persistent block to the report, below the priorities:

```
┌─ 這是你的生意嗎？ ─────────────────────────────────┐
│ 認領之後，你可以把這些發現變成可批准的草稿，          │
│ 並在下次檢查時比較改善。                              │
│                                                       │
│ [ 認領這個商戶 ] → /{locale}/owner/sign-in?claim={slug}
│                                                       │
│ 認領需要證明擁有權：我們會請 Google 確認你管理這個    │
│ 商戶檔案。我們不會單靠電郵地址把商戶交給任何人。       │
└───────────────────────────────────────────────────┘
```

That single `href` is the missing link the entire ownership journey depends on. The same block belongs on the unlock success path, and it makes the sign-in page's existing instruction ("return to that report to sign in and claim it") true instead of circular.

### 4.2 Choose one ownership path you will actually operate

Ownership must stay proven, never self-declared — guardrail 15 is right and must not be relaxed. But today **both** proof routes are unavailable in production (**F-02**, **F-03**). Pick one:

- **Path A — turn the Google claim on.** Set `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED=true` with both callback URIs registered byte-exact. Fastest: the code is written and unit-tested. It serves only owners whose scan matched a Google place and who manage that profile.
- **Path B — build assisted assignment for real.** Replace the copy-only step with a genuine request: a short form writing a `workspace_access_requests` row with contact details, an acknowledgement to the owner, a notification to Fimmick, and a status the owner can see when they return. This is the honest answer for manual-entry and no-GBP owners (**F-06**), and it is what the current text already promises.

**Recommendation: both, in that order.** Path A unblocks the majority quickly; Path B is the only thing that serves the rest, and it is currently a written promise with nothing behind it.

### 4.3 Onboarding, field by field

Every field must justify itself *now*. Step 4 currently asks for brand voice and approved claims and then discards them (`parseClaimBody` ignores both, `ensureBrand` inserts only a default row) — that is worse than not asking.

| Step | Ask | Why now | Change |
|---|---|---|---|
| 1 Confirm | *(nothing — show the scanned business)* | Confirms we found the right shop | Keep. Add a visible "不是這間？" escape |
| 2 Prove ownership | Google consent **or** assisted-assignment request | The one thing that must precede a workspace | Replace the dead-end copy with a working control (§4.2) |
| 3 Connect | Instagram handle *(optional)* | Improves the next scan's coverage | Keep, keep skippable, say what it buys |
| 4 Set up | Workspace name, primary location | Needed to create the workspace | Keep |
| 4b Brand | Voice, approved claims | **Only ask if it will be stored** | Either persist them (a small change to `parseClaimBody`/`ensureBrand`) or move them to first draft, where they are actually consumed |

Do not add fields. Market, timezone and locale are already derived from the scan and shown read-only — correct, and interface language must continue never to change market or currency.

**Safe resume.** Onboarding state is React-only, so a refresh drops to step 1. Because attachment and membership *are* persisted and `completeWorkspaceClaim` is idempotent, resuming is a presentation fix: derive the starting step from server state (job attached? workspace owned? location exists?) rather than from client memory.

---

## 5. Problem-first entry, scoped safely

A problem-first entrance must sit *alongside* the scanner and must never become a bypass. The design that satisfies both:

**`/{locale}/start/[jobId]` — a provisional draft space.**

- Reached only after a completed scan, from an outcome card or the report.
- Uses **only owner-supplied text** (paste a review, a menu item, an offer). It reads no scan evidence, attaches no `audit_jobs` row, and touches no Google or Instagram account.
- Produces **one** unsaved preview draft, watermarked 未認領草稿 · 未儲存, with no version number, no approval control and no export.
- To keep, edit, approve or export anything, the owner must claim the business — the call to action is the claim link from §4.1.
- Server-side it must not create `actions`, `action_runs` or `output_versions` rows, must be rate-limited per job and per IP with `failClosed: true`, and must be exempt from delivery counting by construction.

This lets an urgent-task owner taste the output quality — the strongest argument for claiming — without weakening proof of ownership or exposing protected data. It is a **proposed** capability; nothing like it exists today.

---

## 6. Key screens

For each: primary decision, content order, main action, data source, and the states that must exist.

### 6.1 Report (`/{locale}/r/[slug]`) — existing, revised

*Primary decision:* is this worth acting on, and is this my business?
*Order:* verdict + coverage → three priorities with evidence → **claim block (new)** → evidence passport → comparison (when authorised) → contact.
*Source:* `audit_jobs`, `audit_findings`, `scan_snapshots`; access decided by `authorizeReport`.

```
BEFORE                                 AFTER
┌───────────────────────────┐          ┌───────────────────────────┐
│ 62/100   覆蓋率 78%        │          │ 62/100   覆蓋率 78%        │
│ 部分證據                   │          │ 部分證據                   │
├───────────────────────────┤          ├───────────────────────────┤
│ 三項優先行動 (locked)      │          │ 三項優先行動               │
├───────────────────────────┤          ├───────────────────────────┤
│ 解鎖完整報告 →             │          │ 這是你的生意嗎？  ★NEW     │
├───────────────────────────┤          │ [ 認領這個商戶 ]           │
│ 證據存摺                   │          │ 需要 Google 確認擁有權      │
├───────────────────────────┤          ├───────────────────────────┤
│ 聯絡 Fimmick               │          │ 證據存摺 / 比較 / 聯絡      │
└───────────────────────────┘          └───────────────────────────┘
   ↑ journey ends here                    ↑ journey continues
```

*States:* public preview · unlocked viewer · **claim-outcome banner (new — renders `?claim=place_not_managed|declined|already_claimed|…`)** · failed scan · comparison unavailable with reason.

### 6.2 Scanning (`/{locale}/scanning/[jobId]`) — existing, corrected

*Primary decision:* should I wait?
*Main action:* none until terminal, then 查看報告.
*States that must exist and mostly don't:* queued · collecting (per-module **true** state, not all-measured) · scoring · done · partial with **correctly formatted** coverage · failed with a real reason · **taking longer than expected** (new — after ~3 minutes, say so and offer to return later) · **stalled** (new — after the lease window, offer to resume).

### 6.3 Owner home (`/{locale}/owner/[slug]`) — existing, keep

Already the right shape: what changed → the one action worth doing → proof → decision queue → integration health. Two additions: show **time and inputs needed** on the priority card (the template table already carries `minutes` and `requiredInputs`), and scope the drafts-awaiting-approval count to the selected location rather than the whole workspace.

### 6.4 Action detail — existing, two fixes

Keep the layout. Fix the two false-success behaviours: the assistant sheet must await the server before showing "new version created" (**F-21**), and the Create page must not toast success when the inline run failed (**F-22**). Both are small client changes with disproportionate trust value — a draft that looks saved and isn't is the worst failure mode in an approval product.

---

## 7. Mobile, error and recovery behaviour

**Mobile.** Sign-in must be reachable without opening a menu at every width — returning-owner-on-a-phone is a stated priority scenario and is currently the least discoverable path in the product (**F-28**). Raise the 40 px controls to 44 px and translate the navigation sheet's "Close" (**F-38**). Add a mobile Playwright project so the scan wizard, unlock, sign-in, onboarding and workspace pages get the 375 px coverage that report pages already have.

**Errors owners can actually hit.** Each exists as a code path today; most currently show nothing or something misleading.

| Situation | Today | Proposed |
|---|---|---|
| Google account doesn't manage the business | Silent redirect to the public report (**F-05**) | Banner naming the account used, stating it isn't listed as a manager, offering another account or assisted assignment |
| Expired or reused sign-in link | "That sign-in link has expired or was already used" | Keep — this is good. Add one-tap re-request preserving the claim |
| Link opened on a different device | Same as expired (challenge cookie missing) | Say so specifically: 請在收到連結的同一部裝置開啟 |
| Signed in, no workspace | PR #12's `no_access` state | Good. Add the claim link when a slug is known |
| Email not eligible for a link | "Check your inbox" — nothing arrives (**F-01**, **F-04**) | Keep anti-enumeration, but offer the report-only owner the claim route on the same screen |
| Scan exceeds the function limit | Polls forever (**F-18**) | Honest waiting state, then a resume action |
| Provider timeout / IG unavailable | Whole scan may be `failed` (**F-17**) | Degrade to `partial` with lowered coverage — exactly what the product promises |
| Allowance exhausted | 409 + upgrade link | Keep — this is well done |

**Recovery must preserve context without widening it.** Recovery restores the owner's own locale, market, return destination and claim slug, and never widens access. The viewer grant stays bound to a single job; a second unlock currently overwrites the first, which is worth fixing but not at the cost of scope.
