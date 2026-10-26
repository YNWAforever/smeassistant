# Kinnso OS owner workspace — inventory, problems, redesign

Audit only. No product UI was changed.

- **Baseline:** `main` @ `2a8dd8105c2ad4544ed40d5bc987cff548ff9335` — *Coach Today, three-step Action, and 有冇好啲 on Insights* (#109), on top of #108 (`8607cd8`, zh-HK shop language on Today / Insights).
- **Audience:** a Hong Kong shop owner. Default locale `zh-HK`. Interface language does not change market or currency.
- **Language rule this redesign must keep:** the owner sees 舖頭語言. Scores, coverage, fact types, state machines, and agent names stay under the disclosure labelled **點解咁講**. They are not deleted from the data model.
- **Do not undo:** the #108/#109 page faces (Today leads with one task; Action shows 改稿 → 確認 → 發出; Insights leads with 有冇好啲). Later phases finish those cuts. They do not put the old brief back on the first screen.

A reviewer can redesign from this file. Paths are from the repo root. Routes omit the `/{locale}` prefix; every owner URL is `/{en|zh-HK|zh-TW}/…`.

---

## 1. What the owner is supposed to finish

Three loops. Everything else is a side door.

| Loop | Shop job | Done when |
|---|---|---|
| **A. This week’s task** | Open Today, do the one thing, send the text the shop will actually use | An approved version is copied or posted, and Today no longer asks for that same decision |
| **B. Did it help** | Come back after the next look at the shop and hear whether it got better, or that there is nothing to compare yet | The owner can say “有 / 未 / 未可以比” without reading a score |
| **C. The shop itself** | Prove it is their shop, tell Kinnso what may be said, connect Google if needed, invite one person | Those facts exist, and drafts stop asking for them |

Guardrails that stay (do not “simplify” these away): evidence before a number; missing data is not zero; two scans compare only when the comparability rule passes; six fact types; approval locks one version; nothing auto-publishes; a delivery counts only after approval and a first export; locale ≠ market; demo data stays on demo pages; ownership is Google-verified or staff-assigned, never email match.

---

## 2. How to read the current product

Signed-in chrome is one shell. Five destinations, fixed in `components/workspace-shell.tsx` (`DESTINATIONS`). Layout gate: `app/[locale]/owner/[workspaceSlug]/layout.tsx` → `requireMembership` (signed out → sign-in; not a member → select-workspace). Demo workspaces also show `EnvironmentBar`.

**zh-HK nav (the words on the chrome):** 今日 · 行動 · 成效 · 商戶 · 設定 (`lib/copy-shell.ts` `shellZhHK.nav`).

**zh-HK page titles that #109 already changed:** Today h1 **而家最應做** (`lib/copy-dictionaries.ts` `home.title`). Insights h1 **有冇好啲** (`lib/copy-workspace-home.ts` `insights.leadTitle`). Action stepper **改稿 → 確認 → 發出** (`lib/copy-action.ts` `ownerSteps`).

The nav was not renamed with the pages. 行動, 成效, and 商戶 are still the Phase 4 names (`docs/ux/PHASE-4-REPORT.md`). Public header strings in the same dictionary are a third set: 今日重點 / 待辦與審批 / 製作內容 / 成效 / 更多 (`copy-dictionaries.ts` `nav`).

Old URLs 308 and keep the query (`lib/workspace/route-redirects.ts`, called from `proxy.ts`):

| Old suffix | Now |
|---|---|
| `/create` | `/actions/new` |
| `/calendar` | `/actions?view=due` |
| `/assets` | `/business/assets` |
| `/settings/brand` | `/business/profile` |
| `/settings/integrations` | `/business/integrations` |
| `/settings/billing` | `/settings/plan` |
| `/activity` | `/settings/activity` |
| `/more` | `/settings` |
| `/offers` | `/actions/new?mode=offer` only while `OFFER_PROMOTIONS_ENABLED`; otherwise still 404 |

`?location=<slug|all>` scopes almost every workspace page. Invalid or missing falls back to the primary location (`lib/workspace/shell.ts` `resolveLocationSlug`). `location=all` must not invent a combined score.

**Roles** (`lib/workspace/authorize-workspace.ts`): `owner` | `manager` | `viewer`. Server checks are the authority. Managers with a non-null `location_scope` edit only those locations. Viewers read. Brand save, team, billing, and integrations mutations are owner-only. The action page’s “preview as” select (`components/workspace/action-detail/detail-header.tsx`) changes the buttons on screen for an owner; it does not change the server role.

**Operators** are not in this shell. `app/[locale]/ops/failures` and `app/[locale]/ops/access-requests` use `requireOperator`, English copy, `noindex`, and are not linked from the shop.

**Flags that hide whole modes:** `OFFER_PROMOTIONS_ENABLED` (and never on a demo workspace), `WORK_PACKS_ENABLED`, `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED`, `ASSISTED_ASSIGNMENT_ENABLED` (ops decisions), action bulk-assign flag. Default shop with flags off never sees Offers or starter packs.

---

## 3. Inventory

Columns: route · shop job the screen claims · what is actually on it · main files.

### 3.1 Chrome (every signed-in page)

| Surface | Claims | Actually exposes | Files |
|---|---|---|---|
| Desktop sidebar | Five places + which shop and branch | Brand lockup, workspace switcher (name + current location → select-workspace), five links, urgent count on 行動, usage “核准後交付 n / allowance or ∞”, account (name, role) | `components/workspace-shell.tsx`, `lib/copy-shell.ts` |
| Mobile top bar | Where I am | Mark, shop name · location **as text** (not a switcher), 問 Kinnso, bell, theme (light/dark/system), locale, demo badge | same; `components/theme/workspace-theme.tsx` |
| Mobile bottom nav | The five places | 今日 行動 成效 商戶 設定. No usage, no account, no location control | same, `.mobile-bottom-nav` |
| Ask Kinnso | Explain this screen | Sheet on every destination. Surfaces: `home`, `actions`, `action`, `create`, `insights`, `assets` (and `rescan`, `workspace`, public `sample`/`report`). Live mode can draft. It must not approve or publish | `components/pocket-assistant/assistant-launcher.tsx`, `assistant-sheet.tsx`, `lib/pocket-assistant/contracts.ts` (`demoQuestionIds`), `POST /api/assistant/run`, `POST /api/assistant/suggestions` |
| Command palette | — | **Not mounted** in the owner shell. Design-system gallery only | `components/kinnso/command-palette.tsx` |

### 3.2 Before a workspace

| Route | Claims | Actually exposes | Files |
|---|---|---|---|
| `/owner/sign-in` | 店主登入 | Magic link. No Google sign-in. Preserves claim / return | `app/[locale]/owner/sign-in/page.tsx`, `POST /api/owner/magic-link`, `POST /api/owner/sign-in/complete` |
| `/owner/sign-in/complete` | Finish the link | Session landing | `app/[locale]/owner/sign-in/complete/page.tsx` |
| `/owner/onboarding` | Prove the shop, then see the first task | Steps: signed in → verify with Google **or** ask Fimmick to assign → check name / address / optional voice and approved facts. No claim slug: “先由一次掃描開始”. Access-request form when assignment is the path | `app/[locale]/owner/onboarding/page.tsx`, `components/onboarding-page.tsx`, `components/workspace/access-request-form.tsx`, `lib/copy-onboarding.ts`, `POST /api/workspaces/claim`, `GET /api/oauth/google/claim/start` + callback, `POST /api/access-requests` |
| `/owner/select-workspace` | Pick a shop | Cards still show **評分**, **覆蓋率**, urgent-action counts (`shell.select`). Empty state offers another scan. Sign out. Access-request status | `app/[locale]/owner/select-workspace/page.tsx`, `components/select-workspace-page.tsx` |

### 3.3 Today — loop A and B’s front door

**Route:** `/owner/[workspaceSlug]`  
**Files:** `app/[locale]/owner/[workspaceSlug]/(today)/page.tsx`, `components/workspace/home-brief.tsx`, `components/workspace/needs-attention-card.tsx`, `components/workspace/getting-started.tsx`, `lib/copy-workspace-home.ts`, `lib/copy-dictionaries.ts` (`home`, `ownerFocus`).

**Claims (zh-HK, on the face):** h1 而家最應做. One task title, one `coach-sentence` (the action summary), one button (開始處理 / 補返資料 / 審閱草稿 / 匯出已核准版本 / 查看連接 / 查看待辦). Quiet and no-scan variants exist.

**Also on the page, in this order:**

1. Location select.
2. Banner if the workspace has no location (link to public `/scan`).
3. The coach card. A second card can sit beside it: review follow-up (**點解咁講** is not the label — the card is “home review”) with version, applied/check status, and a newer-draft link (`homeReviewCopy`, `data-testid="home-review-followup"`).
4. **需要處理** — up to two failures (scan failed, draft failed, Google). Link “在活動紀錄查看所有問題”. Hidden when empty.
5. Disclosure **點解先做呢項？** — priority badge, effort, display phase, version, fact type, “點解而家做”, and an Ask Kinnso button “ask why this comes first”.
6. Disclosure **睇最近結果** — this is still the old operating brief: score dial, coverage “n measured / n unavailable”, withheld-score copy, proof delta, four month metrics (resolved / regressions / awaiting approval / completed), rescan cadence, rescan button (paid owner or manager only).
7. Disclosure **其他待辦同草稿** — links 查看所有待辦 and 準備新內容, the five-step getting-started list, and up to three open actions with phase and effort.
8. Disclosure **點解咁講** — approval note, “AI Visibility Team” strip (four internal steps), integration health, change ledger (regressed / resolved / decayed), evidence gallery, footnote about snapshots.

**Empty / edge:** no locations; no snapshot; `location=all` (no combined score); viewer (CTA becomes 查看); quiet week (rescan sentence even when the button is hidden for lite or viewers).

### 3.4 Actions — the queue

**Route:** `/owner/[workspaceSlug]/actions`  
**Files:** `app/.../actions/(queue)/page.tsx`, `components/workspace/actions-queue-frame.tsx`, `actions-list-view.tsx`, `action-filters.tsx`, `bulk-approve.tsx`, `bulk-action-dialog.tsx`, `calendar-view.tsx`, `fix-pack-card.tsx`.

**Claims:** eyebrow 有實證支持的工作清單. Title 行動. Lead: ranked from measured findings; open one to review, approve, deliver.

**Actually exposes:**

- Button 新增 (hidden for viewers) → `/actions/new`.
- **Seven tabs:** 全部, 需要資料, 草稿, 待審批, 已完成, 到期, **Fix Pack** (English in zh-HK).
- Search, channel (Google / Instagram / website / 搜尋與 AI), status (建議, 需要輸入, 準備就緒, 進行中, 已完成, 已略過, 已過期).
- Each card: priority, display phase, capability badge (Live / Beta / …), source, title, summary, fact type, evidence value, **why this priority with point maths** (`+15 · +8`), effort, assignee, due, missing-input count, last changed, Preview, CTA.
- Wide screens: `?open=<uuid>` side panel (same detail component) with Close and 開啟完整頁面.
- Bulk approve for `review-response` and `social-post` drafts with no missing facts and no guardrail warnings. Read-each checkbox, then one approve per version.
- Bulk assign when its flag is on.
- **到期** (`?view=due`): rescan cadence reminder (explicitly not an automatic scan) + actions with a due date. `components/workspace/calendar-view.tsx`.
- **Fix Pack** (`?view=fixpack`): Fimmick-prepared drafts, approve/reject each. `components/workspace/fix-pack-card.tsx`.

**APIs:** `GET /api/workspaces/[id]/actions`, `POST /api/workspaces/[id]/actions/bulk`, `GET/PATCH /api/workspaces/[id]/fix-pack-drafts` and `.../[runId]`.

### 3.5 Action detail — loop A’s workbench

**Route:** `/owner/[workspaceSlug]/actions/[actionId]` (`?version=` optional)  
**Files:** `app/.../actions/[actionId]/page.tsx`, `components/workspace/action-detail-client.tsx`, `action-detail/owner-steps.tsx`, `detail-header.tsx`, `draft-editor-card.tsx`, `approval-panel.tsx`, `sticky-approval-bar.tsx`, `evidence-tab.tsx`, `history-tab.tsx`, `workflow-tab.tsx`, `verification-result.tsx`, `gbp-publish-card.tsx`, `owner-review-check-panel.tsx`.

**Claims:** stepper 改稿 → 確認 → 發出. Workflow and the agent run sit in a closed disclosure labelled 點解咁講 (`ownerFocus.workflow` in zh-HK).

**Actually exposes, above and around that stepper:**

- Back to the queue. Owners: **preview as owner / manager / viewer**. Online/offline pill.
- Badges: priority, display phase or approval state, capability. Title, summary, location, effort, assignee, due, and a “next” sentence (inspect / fill inputs / save first / export / review version n / generate).
- Review-check panel when the action is in the applied/verified follow-up (decisions checked / not_found / later / retracted, three confirmations, reference, note).
- Stale-offer banner when offer mode is on.
- Tabs **草稿 / 證據 / 紀錄** (workflow tab was removed from the tab strip in #109).
- Draft column: workflow name as the h2 (often still 「常見問題及 JSON-LD 流程」, 「本地 SEO 簡報」), fact type, optional offer card, collapsed business facts, checklist steps, inputs, textarea, alt text, character count, guardrail block, generate, save, “mark applied”.
- Approval column: comment, **核准此版本** (confirm dialog), 要求修改, 拒絕, then a delivery card: export, copy, disabled direct-publish button, and `GbpPublishCard` when Google publish is actually enabled. Capability badge on the delivery card often reads Requires connection.
- Sticky bar: Save, and **Approve or Export in one tap** (no dialog). Sits above the mobile bottom nav (`useFocusClearOfBars` in the shell).
- Disclosure 點解咁講: provenance chain (scan → finding → action → inputs → run → version → approval → export → measurement) plus workflow copy that is still engineer language in zh-HK: 「可復原執行狀態」「獨立狀態機」「獨立生命週期摘要」 (`lib/copy-action-tabs.ts`).

**Checklist templates** (`gbp-profile-fix`, `ig-highlights`) skip the stepper entirely and show a state-machine definition list.

**Step index** (`owner-steps.tsx`): approved → 發出; saved clean draft → 確認; otherwise 改稿. Dirty text sends the owner back to 改稿 even if they are looking at the approval buttons.

**APIs the owner hits from this page:**

| Call | Job |
|---|---|
| `POST /api/actions/[id]/run` | Generate a draft |
| `POST /api/actions/[id]/versions` | Save a version |
| `PATCH /api/actions/[id]` | State, assignee, due, inputs |
| `POST /api/actions/[id]/applied` · `DELETE` | Owner says they used it / retracts |
| `POST /api/actions/[id]/owner-check` | Review follow-up record |
| `POST /api/versions/[id]/approve` | Lock one version |
| `POST /api/versions/[id]/request-changes` · `/reject` | Send back or reject |
| `POST /api/versions/[id]/export` | Copy or file export; first export counts |
| `POST /api/versions/[id]/publish` · `GET .../publish/targets` | Real publish only when a connector is on |
| `POST /api/deliveries/[id]/reconcile` · `/reply` | After a publish attempt |

### 3.6 New work — a second way to start

**Route:** `/owner/[workspaceSlug]/actions/new` (`?mode=goal|offer|pack`)  
**Files:** `app/.../actions/new/page.tsx`, `components/workspace/create-view.tsx`, `new/new-mode-tabs.tsx`, `new/offers-mode.tsx`, `pack-card.tsx`.

**Claims:** 新行動. Start from a goal, an offer, or a starter pack. Nothing publishes without approval.

**Goal mode (always on):** a catalog of agent templates. Lead three: review reply, FAQ, website basics. The rest (review request, photo pack, GBP post, social post, IG bio, local SEO brief, menu translation, …) sit below. Offer templates and checklists are excluded here. Creating one calls `POST /api/actions`. Evidence-led goals deep-link to the open action instead of duplicating it.

**Offer mode (flag):** confirm price, dates, terms, then promote. `POST /api/workspaces/[id]/offers`, `POST/PATCH /api/offers/[id]`, confirm, archive, promotions. Stale offers banner on the action.

**Pack mode (flag):** one starter pack for one location → `/owner/[slug]/packs/[packId]`. Pack page has no approve/export; those stay on each action. `GET/POST /api/workspaces/[id]/packs`, `GET/PATCH /api/packs/[id]`.

Viewers and out-of-scope managers see a read-only notice.

### 3.7 Insights — loop B

**Route:** `/owner/[workspaceSlug]/insights`  
**Files:** `app/.../insights/page.tsx`, `components/workspace/insights-view.tsx`.

**Claims:** h1 **有冇好啲**. One sentence: better / not yet / about the same / mixed counts / no earlier visit / cannot compare, with the comparability reason filled in. All-locations: “每間舖分開睇” and a card per location (可以比 / 未可以比) plus 開啟.

**No snapshot:** empty state 掃一次之後，先有結果睇, link back to Today.

**Under 點解咁講 (single location with a scan):** the previous Insights page in full — score delta, resolved/regressed counts, coverage %, score-and-coverage series (list + table, gaps marked, no line across gaps), per-metric before/after cards, AI surface presence rates with cited/total and a denominator note, change ledger (resolved / regressed / decayed), table of recently delivered work.

This matches the rule “formulas live under 點解咁講”. The problem is the disclosure is still an analytics dashboard, not a short honest note a shop owner can read.

### 3.8 商戶 — facts about the shop

Index: `/owner/[slug]/business` → `destination-index.tsx` + `app/.../business/page.tsx`. Lead: 我們對你商戶的了解，以及資料來源. Rows:

| Route | Claims | Actually | Who |
|---|---|---|---|
| `/business/profile` | 資料及事實 | Brand voice, languages **“Agent 可用於草稿的語言”**, approved claims, prohibited terms, revision history. Managers/viewers read-only | Owner saves. `components/workspace/brand-view.tsx`, `brand-client.tsx`. `PUT /api/workspaces/[id]/brand` |
| `/business/locations` | 地點 | Read-only list. Copy tells the owner to switch location **from the sidebar menu** (hidden on a phone). Row opens Today for that location. Cannot add or edit a location here | `app/.../business/locations/page.tsx` |
| `/business/assets` | 相片及餐牌，附使用權 | Grid, tabs 全部 / 已核准 / 需要覆核, upload, rights decision, alt text, preview. Drafts may use approved assets only | `assets-view.tsx`, `assets-client.tsx`. `POST/GET /api/workspaces/[id]/assets`, `.../[assetId]`, preview |
| `/business/integrations` | Google、Instagram、網站 | Google connect / re-authorise / disconnect (OAuth). Honest note: a lapsed connection does **not** stop public-evidence scans. Instagram handle form (Beta). Website check counts. Link to activity as “recovery log”. Locked row on the index for non-owners | `integrations-view.tsx`. `GET /api/oauth/google/start` + callback, `POST /api/workspaces/[id]/google-connection`, `POST .../instagram-handle` |

### 3.9 設定

Index: `/owner/[slug]/settings`. Lead: 誰可存取、你的方案，以及我們通知你甚麼.

| Route | Claims | Actually | Who |
|---|---|---|---|
| `/settings/team` | 團隊與權限 | Email invite, role owner/manager/viewer, location scope for managers, resend, remove. Table columns include billing yes/no and approve yes/no. Caption still sounds like the old prototype (“advanced consultant…”) | Owner mutates. `team-view.tsx`, `team-client.tsx`. `POST /api/workspaces/[id]/members`, `PATCH/DELETE .../members/[memberId]`, resend, `POST /api/workspace-invites/magic-link` |
| `/settings/plan` | 方案與用量 | Free vs 增長方案, approved-deliveries progress, Stripe checkout/portal when billing is open, otherwise “訂閱暫未開放 — 請聯絡 Fimmick”. Managers/viewers see limits only | `billing-view.tsx`, `billing-actions.tsx`. `POST .../checkout-link`, `POST .../billing-portal`, `GET .../usage`. Stripe webhook is not an owner click |
| `/settings/notifications` | 通知 | In-app list. Two mail layers: owner “allow these emails” (rescan, regression, monthly digest) and every member’s own switches. Eyebrow is the English word **Email**. Honest note when mail is closed, paused, not allowlisted, or has no address | `notifications-view.tsx`. `GET/PATCH /api/workspaces/[id]/notifications`, `.../notification-preferences`, `.../my-mail-preferences` |
| `/settings/activity` | 每個決定、匯出及掃描 | Append-only table (time, actor, event, safe detail). Also the full **問題與復原** list | `activity-view.tsx`, `problems-list.tsx` |
| Account row | Switch or sign out | Links to select-workspace. This is the **only** mobile path to switch shop or sign out (comment in `settings/page.tsx`) | — |

### 3.10 Assistant intents (so a redesign does not invent a second author)

From `lib/pocket-assistant/contracts.ts`: explain priority, explain change, explain limits, fallback plan, draft review reply, friendlier reply, compare priorities, explain insights, asset next step, rescan validation, generate social, generate FAQ, generate menu, explain missing inputs, where to continue, plus review revisions shorten / contact-only.

Live answers use this workspace’s snapshots. “Create a new version” is a separate call into the action version API. The sheet’s own copy still says “行動優先次序”, “建立成果”, “成效與限制” (`lib/copy-assistant.ts` zh-HK `surfaces`).

### 3.11 Operator console (not a shop screen)

| Route | Job | Notes |
|---|---|---|
| `/ops/failures` | Cross-workspace failure queue | English. Only operator control: release a stuck scan. `POST /api/ops/failures/scans/[jobId]/release` |
| `/ops/access-requests` | Pending “assign me this shop” | English. Approve/reject off until `ASSISTED_ASSIGNMENT_ENABLED`. `app/api/ops/access-requests/[requestId]` |

Do not merge this into the owner nav.

### 3.12 Owner-facing state words still in the UI

`lib/copy-workspace.ts` `phases` / `states` (zh-HK), shown as badges on Today’s other tasks, the queue, and the action header:

需要連接 · 需要輸入 · 生成中 · 草稿已備妥 · 要求修改 · 已核准 · 可匯出 · 已匯出 · 已套用（店主回報） · 等可以同上次比 · 掃完有結果 · 建議 · 發佈到 Google · 尚未確認 · 已發佈到 Google

Priority factors shown as points: 評分影響, 嚴重程度, 急切程度, 準備程度, 所需時間, 品牌風險, 證據可信度.

Templates a scan can open (`lib/workspace/templates.ts`): `review-response`, `review-request`, `gbp-profile-fix`, `gbp-photo-pack`, `gbp-post`, `social-post`, `ig-bio`, `ig-highlights`, `visibility-content`, `website-basics`, `local-seo-brief`, `menu-translation`, `google-reconnect`, plus offer templates when offers exist. Titles in `lib/copy-workspace.ts` `templates` are mostly shop language; several **workflow** subtitles are not (JSON-LD, 本地 SEO).

---

## 4. Problems, ranked

Severity is about the shop owner finishing loop A or B, not about visual polish.

### P0 — the shipped coach cut is a label on the old product

**P0-1. Action is not three steps.**  
The stepper is real (`owner-steps.tsx`) and the workflow tab is closed. The same screen still asks the owner to understand priority, capability, phase, a next-step box, three tabs, a draft column, an approval column (approve + request changes + reject + comment), export, copy, a dead publish button, sometimes Google publish, and a sticky bar that approves without the dialog. Checklist actions skip the stepper.  
**Pointers:** `components/workspace/action-detail-client.tsx`, `action-detail/detail-header.tsx`, `approval-panel.tsx`, `sticky-approval-bar.tsx`, `draft-editor-card.tsx`. Route `/owner/[slug]/actions/[actionId]`.

**P0-2. 「發出」 does not send anything, unless Google publish is separately on.**  
The third step’s real controls are download/export and copy. Direct publish is a disabled button (`approval-panel.tsx`, `ac.delivery.publishDirect`). A shop owner who taps 發出 and gets a file has not finished the loop, and the word over-claims. Copy must stay the honest end state until a connector exists (guardrail 6).

**P0-3. The queue is a second product, and Today partly repeats it.**  
Seven tabs, search, channel, status, point maths on every card, bulk approve, Fix Pack, due dates. Today’s **其他待辦** shows another three. The owner is invited to manage a system instead of finish one task.  
**Pointers:** `actions-queue-frame.tsx`, `actions-list-view.tsx` (priority factors ~line 69–78), `copy-shell.ts` `queue`, route `/actions`.

**P0-4. Today’s second disclosure puts the score back in the owner’s hand.**  
#109 moved the dial off the first card. **睇最近結果** still opens the score dial, coverage counts, a proof delta, and four month metrics. That is a competing beat with 而家最應做, and it is not under 點解咁講.  
**Pointer:** `components/workspace/home-brief.tsx` disclosure `owner-results-disclosure` (the block that starts at `focus.results`).

### P1 — load, jargon, dead ends, roles

**P1-1. Three vocabularies.**  
Nav 行動 / page 而家最應做 / public 待辦與審批. Nav 成效 / page 有冇好啲. Stepper 確認 / buttons 核准、要求修改、拒絕. Stepper 發出 / buttons 匯出、複製. Fix Pack untranslated. Brand field “Agent 可用於草稿的語言”. Assistant surfaces “行動優先次序”, “建立成果”. Select-workspace still says 評分 and 覆蓋率.  
**Pointers:** `lib/copy-shell.ts`, `lib/copy-dictionaries.ts` (`nav`, `home`, `ownerFocus`), `lib/copy-action.ts`, `lib/copy-assistant.ts`, `lib/copy-workspace.ts` `phases`.

**P1-2. 點解咁講 on Insights is the old dashboard.**  
The h1 sentence is right. Opening the disclosure shows visibility score, coverage, eligibility, presence rate, decayed/regressed. A shop owner who wants “why” gets a report. Keep the numbers; lead the disclosure with the same sentence in evidence (“上次 4.2，今次 4.4，來自 Google 評分”) and put the series table behind a second disclosure.  
**Pointer:** `components/workspace/insights-view.tsx` from the `insights-why` details.

**P1-3. 點解咁講 on the action is still a state machine.**  
Provenance is useful. The strings 「獨立狀態機」「獨立生命週期摘要」「可復原執行狀態」 are not shop language and are not “honesty”, they are implementation.  
**Pointer:** `lib/copy-action-tabs.ts` `actionTabsZhHK.workflow`.

**P1-4. New-action catalog competes with the one task.**  
`/actions/new` offers ~10 goals plus optional offer and pack modes. Scan-derived work already created the open action. A second starter path makes “what should I do” ambiguous. Lead-three is an improvement and still a menu.  
**Pointer:** `components/workspace/create-view.tsx` `LEAD_KEYS`, `app/.../actions/new/page.tsx`.

**P1-5. Facts the draft needs live two doors away.**  
Missing brand voice, claims, hours, or an approved photo blocks generation, then sends the owner to 商戶 › 資料 or 素材. Getting started (five steps) is buried under 其他待辦, so the first-run loop is not the first screen.  
**Pointers:** `draft-editor-card.tsx` link to `/business/profile`; `getting-started.tsx`; `home-brief.tsx` `owner-tasks-disclosure`.

**P1-6. Two approval gestures.**  
Panel approve opens a dialog. Sticky bar calls `approveDraft()` immediately. Same version, different commitment.  
**Pointers:** `approval-panel.tsx`, `sticky-approval-bar.tsx`.

**P1-7. Review follow-up is a second Today card with its own state machine.**  
Checked / not found / later / retracted, plus “newer draft”, can sit next to 而家最應做. The shop job (“你貼咗未？”) is right; the UI is a parallel product.  
**Pointers:** `home-brief.tsx` `home-review-followup`; `owner-review-check-panel.tsx`; `POST /api/actions/[id]/owner-check`.

**P1-8. Failures use operator language on the shop’s home.**  
需要處理 is the right slot (scan failed, Google). The next lines say 重新授權, 參考編號, 評分失敗, 收集公開證據. The “more” link goes to the audit table.  
**Pointers:** `needs-attention-card.tsx`, `lib/messages/zh-HK.json` `problems`, `activity-view.tsx`.

**P1-9. Mobile cannot switch shop or branch from the chrome.**  
Location and account live in the desktop sidebar. Mobile shows the location as text. The locations page tells you to use that sidebar. Account switching is a row at the bottom of 設定. Five bottom tabs plus theme, locale, bell, and Ask Kinnso leave little room for the task. Action sticky bar is a sixth bar.  
**Pointers:** `workspace-shell.tsx` (`workspace-switcher` vs `workspace-mobile-brand`); `settings/page.tsx` account comment; `business/locations/page.tsx` lead `shell.locations.lead`.

**P1-10. Preview-as-role on the workbench.**  
An owner can hide their own buttons and think the product broke. It does not change authority. It belongs in a QA flag, not the shop header.  
**Pointer:** `detail-header.tsx` role `Select`.

**P1-11. Role copy is a policy memo.**  
Viewer and out-of-scope banners explain drafting, approving, delivering, and billing in one paragraph (`shell.access`). The owner of a two-person shop needs “你睇到，改要問店主” and disabled buttons, not a second article.

**P1-12. Rescan copy can point at a control that is not there.**  
Quiet week says 按「重新掃描」. The button renders only for a paid owner or manager, inside 睇最近結果. Lite owners and viewers get the sentence only. Cadence on Today and on 到期 is a reminder; nothing in this app runs the schedule (`calendar-view.tsx` header comment).  
**Pointers:** `home-brief.tsx` `canRescan`; `components/workspace/rescan-button.tsx`; `POST /api/workspaces/[id]/rescan`.

### P2 — real, but not the loop

**P2-1.** Usage meter (核准後交付, ∞) is permanent chrome and invisible on mobile. It matters only when an export is blocked. Show it on the export step and on 方案.  
**P2-2.** 商戶 and 設定 are both link indexes. Fine as rare pages; expensive as two of five thumb tabs.  
**P2-3.** Fix Pack and 到期 are queue tabs for staff drafts and dated work. Most shops have neither. English “Fix Pack” fails the language rule.  
**P2-4.** Activity is an audit log. Correct for accountability. Wrong as the place “查看所有問題” sends a shop owner (P1-8).  
**P2-5.** Notifications: English eyebrow “Email”; monthly digest is labelled 規劃中; two preference layers.  
**P2-6.** Assets rights (needs review / approved) are easy to miss until a social draft demands an approved photo.  
**P2-7.** Offers and packs, if flags turn on, add modes, a pack page, and a stale-offer banner without a shop-language home. Leave them dark until loop A is the only start path.  
**P2-8.** Ask Kinnso can generate social, FAQ, and menu drafts from any screen. That is a second 改稿. Keep explain intents on Today and Insights; keep generate intents on the action only.  
**P2-9.** Onboarding is close to shop language (以 Google 驗證, 呢間係咪你) but still says 認領報告, 市場, 時區, and approved-claims-per-line before the owner has seen a task.  
**P2-10.** `location=all` is correct to refuse a combined score, and it is easy to land in from the sidebar. One-location shops should not see an “all locations” choice.  
**P2-11.** Capability badges (Live / Beta / Demo / Requires connection / Planned) on cards and the delivery panel. Owners cannot act on “Beta”.  
**P2-12.** Team table caption and billing/approve columns describe the permission matrix. The shop job is “邊個可以改稿”.  
**P2-13.** Integrations “recovery log” jumps to the audit table. Google reconnect is also a queue action (`google-reconnect` template) and a Today CTA. Three doors, one job.  
**P2-14.** zh-TW did not get the same spoken register as zh-HK (有沒有比較好 vs 有冇好啲). Do not let a redesign “align” Taiwan back to written product Chinese, and do not leave zh-HK strings half-updated.

---

## 5. Target information architecture

Thumb bar becomes four words. URLs of #108/#109 stay, so bookmarks and the 308 table keep working.

| Tab (zh-HK) | Route | First screen | Not on the first screen |
|---|---|---|---|
| **今日** | `/owner/[slug]` | One task: title, one sentence, one button. If something is broken, one line above it with one button | Score, month metrics, team strip, ledger, the three other tasks, getting-started checklist |
| **待辦** | `/owner/[slug]/actions` | A short list of things waiting for the owner, each with one verb (補資料 / 改稿 / 確認 / 複製) | Point maths, capability, channel filter, status filter, Fix Pack tab, due tab |
| **好啲？** | `/owner/[slug]/insights` | h1 有冇好啲 and the one sentence already shipped | Score series, presence rates, coverage table |
| **舖** | `/owner/[slug]/business` | Four rows: 邊個可以改稿 (team), 可以講咩 (brand), 相同事 (assets), Google / Instagram | A separate 設定 tab. Plan, notifications, and activity become rows here |

設定’s current URL stays as a 308 or a row inside 舖 (`/settings` already exists; do not delete it in the first phase). Bottom nav stops highlighting a fifth item.

**Location:** if the shop has one branch, show the name and no switcher. If it has two or more, the switcher is on the mobile top bar, not only the sidebar. `all` is not the default.

**Ask Kinnso:** one button, explain-only on 今日 and 好啲？. On an action it can offer 縮短呢則回覆 and similar edits into the textarea. It never says it approved or posted.

### 5.1 Screen map (target)

```text
sign-in → onboarding (verify or wait for Fimmick) → 今日
今日
  ├─ one task ──────────────► 待辦項目 /actions/[id]
  │                              改稿 → 確認 → 複製文字
  │                              點解咁講 = evidence + what was measured
  ├─ 有問題 (0 or 1) ────────► rescan | reconnect Google | open that draft
  ├─ 其他 n 項 ──────────────► 待辦
  └─ 點解咁講 ───────────────► one paragraph, link to 好啲？
好啲？
  ├─ sentence (shipped)
  └─ 點解咁講 → plain before/after, then optional number table
舖
  ├─ 可以講咩     /business/profile
  ├─ 相同事       /business/assets
  ├─ Google、IG   /business/integrations
  ├─ 邊個可以改稿 /settings/team
  ├─ 方案         /settings/plan
  ├─ 通知         /settings/notifications
  └─ 紀錄         /settings/activity
```

`/actions/new` stays for “我想自己開一樣” and is not a tab. Default contents: the three lead goals only. Offer and pack modes stay behind flags and off this map until a later decision.

`/packs/[id]`, Fix Pack, and 到期 stay addressable and leave the default tabs.

### 5.2 Primary loop, screen by screen

**改稿.** One textarea. If facts are missing, the questions are on this screen (voice, three facts, which review, photo or “文字就得”). Button: 寫一稿 / 儲存. No priority badge, no capability, no preview-as.

**確認.** Read-only text of the saved version. One button: 確認呢一版. Secondary text button: 唔啱，改返 (back to 改稿). Reject and “request changes” are the same shop outcome: this version is not the one to send. Keep both server transitions; do not show both as peer buttons.

**複製文字.** After confirm: the text, a 複製 button, and one line — 未連接發佈，所以唔會自動貼上 Google 或 Instagram. If Google publish is truly available for this version, a second button 貼去 Google with the existing confirm and reconcile states. Export-as-file moves under 點解咁講. The sticky bar repeats the single primary button of the current step, and it uses the same confirm dialog as the page.

**After copy.** Today’s next visit can ask 你貼咗未？ as the one card, with 貼咗 / 未貼 / 遲啲. That replaces the review-check state machine on the home card. The panel can stay on the action under 點解咁講 for the record.

**好啲？** Unchanged face. Next scan is a button here and on 今日 only when this shop’s plan allows it. If it does not, the sentence does not mention the button.

### 5.3 Keep / fold / merge / remove / rename

| | What |
|---|---|
| **Keep** | Today coach card and its three empty states. Insights lead sentence and all-locations “open one shop”. Action stepper component. Approval of one immutable version, export counting, role checks, comparability rules, no aggregate score, demo isolation, ops console, 308 redirects, `?location=`, server as authority. |
| **Fold into 點解咁講** | Score dial, coverage, month metrics, change ledger, AI Visibility Team strip, integration health, evidence gallery (Today). Score series, presence rates, metric cards (Insights). Provenance and run history (Action). File export. |
| **Fold into the action step** | Missing facts, brand voice, approved claims, asset picker. Do not send the owner to 商戶 mid-draft. |
| **Merge** | 商戶 index + 設定 index → one 舖 index (URLs can stay). Fix Pack drafts → the same 確認 step, labelled Fimmick 準備嘅稿. Google reconnect queue action + integrations card → one 連接 Google path. Approve and sticky-approve → one control. Request-changes and reject → 唔啱，改返. |
| **Remove from the default shop UI** | Preview-as-role. Priority point maths on cards. Capability badges. Seven queue tabs (keep one list). Channel and status filters (keep search only if the list is long). Online/offline pill. “All locations” when there is one location. Command palette (already unmounted — do not add it). Direct-publish button while it is disabled. |
| **Do not delete from the system** | Templates, version APIs, fact types, scoring, audit events, Fix Pack routes, offer and pack routes, bulk approve route, ops pages. Hiding is the redesign. |
| **Rename (zh-HK)** | Nav 行動 → **待辦**. Nav 成效 → **好啲？** (h1 stays 有冇好啲). Nav 商戶+設定 → **舖**. 核准此版本 → **確認呢一版**. 匯出已核准版本 → **複製文字**. Fix Pack → **Fimmick 嘅稿**. 需要授權 / 重新授權 → **再連一次 Google**. 覆蓋率, 評分 on select-workspace → only inside 點解咁講. 核准後交付 → **本月已複製出街** (or drop from chrome). |

English locale should follow the same jobs in plain words (Today / To do / Better? / Shop; Edit / Confirm / Copy), not a literal Cantonese translation and not the old “operating brief” vocabulary.

---

## 6. Phased rollout

Each phase is copy, information architecture, and what is visible. No new scoring, no new publish connector, no migration. #108/#109 components stay; later phases move blocks, they do not restore the pre-#109 first screen.

### Phase 1 — finish the three screens already cut

Scope: Today, Action detail, Insights. No nav rename yet (avoids a half-renamed shell).

1. Today: leave the coach card and the failure line. Move the score dial, proof card, month metrics, ledger, AI strip, and integration health into the existing **點解咁講** disclosure. Change **睇最近結果** into one sentence plus a link to Insights (reuse `insightsLeadSentence`). Change **其他待辦** into a count and one link. Getting started: show only the next incomplete step, and only while the first delivery has not happened; put it under the coach card only when there is no task yet.
2. Action: one column. Header is title + sentence. Stepper drives which controls exist (P0-1, P0-2, P1-6). Evidence tab content moves under 點解咁講. Rewrite `actionTabsZhHK.workflow` into shop sentences. Checklist actions get the same three words where they fit (改清單 → 確認做完 → 複製清單) or an explicit one-step “我做完” so they are not a secret state machine.
3. Insights: keep the h1 and sentence. Inside 點解咁講, first block is plain before/after; the series table and presence rates start closed.
4. Tests to extend, not replace: `home-brief.test.tsx`, `action-detail-client.test.tsx`, `insights-view.test.tsx`, `e2e/acceptance/home-today.spec.ts`.

### Phase 2 — one list, one nav

1. Rename shell labels (待辦, 好啲？, 舖) in `lib/copy-shell.ts` for all three locales. Bottom nav: four items; 設定 routes remain, linked from 舖.
2. Queue: default list is “waiting for you”, ordered as the server already orders them. Drop the point-math row and capability badge. Move 到期 and Fix Pack behind a 更多 link, still the same URLs (`?view=due`, `?view=fixpack`).
3. `/actions/new`: show the three lead goals only; “其他寫法” disclosure for the rest. Do not turn offer/pack flags on as part of this work.
4. Mobile: location switcher in the top bar when there are 2+ locations; otherwise no switcher. Account stays the 舖 row that already exists.
5. Select-workspace cards: shop name, market, “有一件等你” / “未掃過”. Score and coverage move behind 點解咁講 on Today after they open it.

### Phase 3 — close the loops that leak

1. Inline missing facts on 改稿 (brand voice, claims, hours, asset). Profile and assets pages remain for editing later.
2. After a copy, Today may show 你貼咗未？ as the single card. Do not show it beside another priority.
3. Failure line: one shop sentence and one button (再掃一次 / 再連 Google / 再開張稿). Reference code only inside 點解咁講. Activity stays the audit log, not the recovery home.
4. Remove preview-as-role from the owner header (keep the component behind a dev flag if QA still needs it).
5. Viewer: same pages, primary button replaced by 問店主改, banner reduced to one line.
6. Rescan: show the control only next to copy that mentions it, and only when `canRescan` is true.
7. Assistant: remove generate intents from home, actions list, and insights surfaces.

### Phase 4 — only if a shop job is proven

Offers, starter packs, bulk approve, Google publish, and team location-scope stay as they are technically. Promote any of them into the default UI only with shop-language names and a place in loop A (for example 貼去 Google as the real third step when the connector is on). Do not add them as new tabs.

Ops console: no change, no link from 舖.

---

## 7. Open questions

1. **發出.** Is the product allowed to keep the word if the only real action is copy, or must the button say 複製文字 until a connector posts? This audit recommends the second. Confirm before Phase 1 copy is written.
2. **One list or none.** Should 待辦 exist as a tab, or should “其他 n 項” on Today be the only list? A tab is recommended so a long backlog does not return to Today. Confirm.
3. **舖 vs two indexes.** Merging 商戶 and 設定 in the thumb bar changes a Phase 4 decision (`docs/ux/PHASE-4-REPORT.md`). URLs can stay. Confirm the tab label 舖 (shop) rather than 商戶.
4. **Second person.** For a typical HK shop, is the other login a spouse who should see the same 今日, or a viewer who only looks? Phase 3 assumes the same screens with 問店主. Confirm before designing a different viewer home.
5. **Fix Pack.** Still a Fimmick staff queue the owner must find, or the same 確認 step when a staff draft exists? Audit recommends the same step.
6. **Offers and packs.** Leave dark through Phases 1–3? Audit recommends yes.
7. **Rescan on the free plan.** The quiet-week sentence currently mentions a button lite owners do not have. Should free shops only hear “下次掃完再睇”?
8. **zh-TW register.** Follow the HK coach cut in spoken Taiwanese Mandarin, or keep the more written zh-TW already in `copy-workspace-home.ts`? Do not block Phase 1 zh-HK on this.
9. **All-locations.** Any real multi-branch HK customer in the next cohort? If not, Phase 2 can treat one location as the only UI.
10. **Monthly digest** is labelled 規劃中. Leave it off the notifications screen until it sends?

---

## 8. What a later PR must not do

- Put the score dial, coverage, or “AI Visibility Team” back on Today’s first card.
- Remove 有冇好啲 or replace it with a chart as the h1.
- Remove the stepper and return workflow/agent run to a peer tab.
- Invent a combined score for `location=all`.
- Turn copy or export into “published” without a connector.
- Auto-publish, email-match claim, or a second scorer.
- Link `/ops/*` from the shop.
- Restyle tokens, fonts, or brand colour as part of the IA work. Kinnso orange, dark ink on orange, system fonts, dark mode in the owner workspace only.
