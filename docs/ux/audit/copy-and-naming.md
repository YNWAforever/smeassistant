# Copy audit — SME Scanner Visibility Workspace

Read-only audit of `/home/user/smeassistant` at `697ef29` (2026-10-19). No repo file was modified.
Method: grep and small Python counters over `app/`, `components/`, `lib/` (tests, `components/ui/*` and `components/ops/*` excluded unless noted).
English word counts are counts of words inside string literals. They cover all of a screen's states (errors, empty states, dialogs), so treat them as "copy load", not words on screen at one time.

---

## 1. Copy architecture

### 1.1 Where user-facing strings live

| Layer | File(s) | Size | Shape | Notes |
|---|---|---|---|---|
| Locale registry | `lib/copy.ts` (522 lines), `lib/locale-data/{all,browser,registry,server,types}.ts` | — | `copy[locale]` = `{ ...funnel, workspace }` | `copy.ts` also holds inline blocks (`homeReviewCopy`, `LOCALE_NAMES`). |
| Funnel dictionary | `lib/copy-dictionaries.ts` (1,270 lines) | en 10–365, zh-HK 366–710, zh-TW 711–1270 | Three full `FunnelCopy` objects | landing, scan, scanning, report, unlock, pricing, trust, preview, notFound, footer, demoBar, nav. |
| Workspace dictionary | `lib/copy-workspace.ts` (1,067 lines) | en 239–557, zh-HK 558–845, zh-TW 846+ | Three `WorkspaceCopy` objects | templates, metrics, states, phases, offers, packs, publish, verification, websiteExport. |
| Upstream messages | `lib/messages/{en,zh-HK,zh-TW}.json` (541 lines each) | 16 namespaces | `t(locale, "scanner.x")` via `lib/i18n.ts` | Copied from upstream. zh-HK file is **colloquial Cantonese** (嘅 ×74). |
| Small copy modules | `components/auth/sign-in-copy.ts` (217), `lib/seo-copy.ts` (48), `lib/report/comparison/copy.ts` (32), `lib/workspace/no-workspace-copy.ts` (48), `lib/ops/problem-copy.ts` (27), `lib/agents/agents/promotion-copy.ts` (66), `lib/copy-workspace-keys.ts` (51, keys only) | — | Per-locale records | |
| Label maps | `lib/workspace/audit-labels.ts`, `lib/workspace/guardrail-text.ts`, `lib/workspace/format.ts`, `lib/capabilities.ts`, `lib/domain.ts` | — | `{ en, zh, zhTW? }` | Two-key maps (`en`/`zh`). Taiwan wording is handled only where a `zhTW` key exists. |
| Industry/landing modes | `lib/scan-modes.ts` | 20 `"zh-HK":` keys | Trilingual objects plus **zh-HK-only FAQ arrays** (l.42–64) | Cantonese plus English ("scan", "review", "audit", "v0.1"). |
| Demo data | `lib/demo-data.ts`, `lib/pocket-assistant/demo.ts`, `lib/funnel/sample-report.ts` | — | Inline `isChinese ?` | Allowed on demo surfaces only. |
| Root metadata | `app/layout.tsx:17-24`, `app/[locale]/_meta.ts`, `app/opengraph-image.tsx`, `app/[locale]/r/[slug]/opengraph-image.tsx` | — | Hard-coded | Root `description` is **zh-HK only** for every locale (`app/layout.tsx:23`). |
| zh-TW shim | `lib/zh-tw.ts` (`zhFor`, `zhDeep`) | 14 replacement pairs | Converts zh-HK text to Taiwan wording at runtime | Applied only where a call site remembers to wrap the string. |

### 1.2 Inline locale ternaries

- **688** inline ternaries across **63** files. The pattern counted was `isChinese ?`, `zh ?`, `isZh ?` and `locale === "en"|"zh-HK"|"zh-TW" ?`.
- **36 files** define `const isChinese = locale !== "en"`. This is a binary switch, so zh-TW receives the zh-HK string unless the call site wraps it in `zhFor()`/`zhDeep()`.
- **410** `isChinese ? "…"` literals are not wrapped in `zhFor` or `zhDeep`. Most are neutral Chinese. 14 contain HK-only terms (see §3.3).

| # | File | Ternaries | | # | File | Ternaries |
|---|---|---|---|---|---|---|
| 1 | `components/workspace/action-detail-client.tsx` | **125** | | 11 | `components/workspace/assets-client.tsx` | 20 |
| 2 | `components/workspace/home-brief.tsx` | 44 | | 12 | `components/public-pages.tsx` | 18 |
| 3 | `components/landing-page.tsx` | 44 | | 13 | `lib/workspace/guardrail-text.ts` | 17 |
| 4 | `components/onboarding-page.tsx` | 37 | | 14 | `components/product-ui.tsx` | 17 |
| 5 | `components/workspace/create-view.tsx` | 31 | | 15 | `components/workspace-shell.tsx` | 16 |
| 6 | `components/workspace/insights-view.tsx` | 27 | | 16 | `lib/funnel/sample-report.ts` | 14 |
| 7 | `components/workspace/actions-list-view.tsx` | 27 | | 17 | `components/workspace/team-view.tsx` | 14 |
| 8 | `components/workspace/billing-view.tsx` | 26 | | 18 | `components/workspace/integrations-view.tsx` | 13 |
| 9 | `components/public-demo-workspace.tsx` | 23 | | 19 | `components/workspace/access-request-form.tsx` | 11 |
| 10 | `components/pocket-assistant/assistant-sheet.tsx` | 22 | | 20 | `components/select-workspace-page.tsx` | 11 |

Also notable: `fix-pack-card.tsx` 10, `lib/workspace/format.ts` 9, `assets-view.tsx` 9, `activity-view.tsx` 8, `calendar-view.tsx` 7.

### 1.3 Inline trilingual objects

- **7 files** contain inline `{ en, "zh-HK", "zh-TW" }` literals: `lib/scan-modes.ts` (20), `lib/assistant/__fixtures__.ts` (5), `components/workspace/brand-client.tsx` (3), `lib/copy.ts` (2), `components/public-chrome.tsx` (2), `lib/workspace/queries-pages.ts` (1), `lib/agents/guardrails.ts` (1), `components/workspace/create-view.tsx` (1).
- **3-way inline `locale === "zh-HK" ? … : locale === "zh-TW" ? … : …` blocks** (full sentence sets): `components/landing-page.tsx:77-136` (ownerStory, confidence), `components/workspace/integrations-view.tsx:32`, `components/workspace/action-detail-client.tsx:378`.
- **Assessment.** There are five overlapping systems: dictionaries, messages JSON, label maps, inline ternaries and the zhFor shim. Roughly half of all visible product copy lives in component JSX, against the CLAUDE.md §5 rule that new strings go in `lib/copy.ts`. The heaviest offender is `action-detail-client.tsx`, with ~1,234 English words inline.

---

## 2. Naming inconsistency

| Name (as shown to users) | Hits / files | Where | Issue |
|---|---|---|---|
| **SME Scanner** | 59 / 17 | `app/layout.tsx:18,21,25` (title template `%s · SME Scanner`, siteName), `_meta.ts` ×4, both OG images, `public-chrome.tsx` ×3, `landing-page.tsx` ×14, `copy-dictionaries.ts` ×12, `seo-copy.ts` ×3, messages ×2/locale, README | Primary brand. Also used as the free plan's name (`public-pages.tsx:56` `title: "SME Scanner"`), so the product name and the plan name collide. |
| **Visibility Workspace / 能見度工作台** | 14 / 9 (+4 zh) | `app/layout.tsx:18` (default title "SME Scanner Visibility Workspace"), `_meta.ts:52`, `opengraph-image.tsx:13`, `public-pages.tsx:189` (sign-in badge), `workspace-shell.tsx:177` (sidebar), `landing-page.tsx:156,187,636`, `audit-labels.ts:65-66` (activity **actor name** for agent+system), `demo-data.ts:278,294-295`, README:1 | Shown as a product, a sub-product ("SME Scanner finds… Visibility Workspace helps…", `landing-page.tsx:187`) and an actor in the activity log. |
| **Growth Workspace / 增長工作台 / 成長工作台** | 13 en / 16 HK / 5 TW | Pricing plan (`public-pages.tsx:69`), home tier badge (`home-brief.tsx:77`), `seo-copy.ts:21-37` | A third "workspace" name. The tier is `paid` in data, `Growth Workspace` on the page and "Free plan" (`免費方案`) for lite, while `messages/*:105` says "Free workspace". |
| **工作台** (generic) | 135 | everywhere | Fine as a noun, but it competes with the three named variants above. |
| **Visibility Operator / 隨身增長助理 / 增長助理 / "operator"** | 11 en / 4+1 zh | `assistant-sheet.tsx:388` (sheet title), `assistant-launcher.tsx:52` ("Ask Visibility Operator" / 問隨身增長助理), `workspace-shell.tsx:184` ("Ask operator" / 問增長助理), `public-demo-workspace.tsx:71`, `landing-page.tsx:527-528`, `action-detail-client.tsx:122` ("Drafted by the operator" / 由助理生成) | Four labels for one feature. The English name means "Visibility Operator", the Chinese name means "pocket growth assistant", and neither translates the other. |
| **Pocket assistant** | 0 in UI | code only (`components/pocket-assistant/*`, `lib/pocket-assistant/*`) | Internal name only. OK. |
| **smeassistant** | 6 / 4 | code comments only (`app/api/oauth/google/**`, `lib/oauth/google-connection.ts`) | Not user-facing. OK. |
| **SMEAssistant / SME Assistant** | 0 | — | — |
| **Kinnso** | 1 | `app/layout.tsx:32` (comment: palette) | Not user-facing, but the brand mark and OG use Kinnso orange while the text says "SME Scanner by Fimmick". |
| **Fimmick** | 132 / 27 | footer, unlock, onboarding, pricing, trust, legal JSON, report CTA | Consistent. Used both as the company and as "the Fimmick team" doing manual tasks. |
| **Visibility Scout / 能見度偵察 / "Scout complete"** | 3 / 2 | `landing-page.tsx:210,215`; `home-brief.tsx:81` (EN agent strip) | Agent persona names appear in English only on Home. The zh Home strip uses plain verbs. |
| **AI visibility team / AI 能見度團隊** | 4 / 3 | `public-pages.tsx` (pricing feature), `landing-page.tsx`, `home-brief.tsx:253` ×2 | A "team" metaphor, which conflicts with "not another agent" (`landing-page.tsx:528`). |
| **Agent / agent** in customer copy | ~35 en strings; zh keeps the Latin word "Agent" | `action-detail-client.tsx:121,342,389,430,886,914,973,1016` ("Agent run", "Agent 輸入", "由 Agent 生成"), `create-view.tsx:201`, `landing-page.tsx:502,528`, `copy-dictionaries.ts:322/672/1017` ("Agent inputs and outputs"), `public-pages.tsx:177` | The Chinese UI shows the untranslated English word "Agent". The eyebrow "Agent run" (`action-detail-client.tsx:1016`) is English in every locale. |
| **Fix Pack / Fix Pack 草稿** | 12 / 7 | `fix-pack-card.tsx:88`, `copy-dictionaries.ts:194/550/895` (report `draftLabel`), `audit-labels.ts:42,97` | English brand inside Chinese UI. It is separate from "drafts/versions" but looks the same to owners. |
| **Work pack / Starter pack / 入門套裝 / 入門套組** | 3 + 2 | `copy-workspace.ts:287` ("Work pack" eyebrow), `packs/[packId]/page.tsx:19` ("Starter pack"/入門套裝), `audit-labels.ts:60` | Two English names for one feature. The zh-TW page title uses HK 套裝, while the audit label uses TW 套組. |
| **Visibility Score / AI Visibility Score** | 9 / 4 | `messages/en.json:220,230,502` (share meta title "{business}'s AI Visibility Score"), `zh-HK/zh-TW.json:220` (English inside Chinese), `scan-modes.ts:49,114-116` | The product elsewhere just says "score / 評分 / 能見度評分" (`product-ui.tsx:146`). |

**Metadata checks**
- No `manifest` exists.
- `sitemap.ts` and `robots.ts` hold no brand strings.
- The OG alt is English for all locales (`_meta.ts:52`, `opengraph-image.tsx:13`).
- The OG subtitle is Chinese-only (`opengraph-image.tsx:22` 證據為先，行動為本).
- The report OG tagline is colloquial Cantonese for zh-TW as well: `r/[slug]/opengraph-image.tsx:41` `isZh ? "你間舖 AI、Google、IG 搵唔搵到？"`. It is binary and not passed through zhFor.

---

## 3. Jargon and confusing labels

### 3.1 Internal or system terms shown to owners

| Term | Example (file:line) | en | zh-HK | zh-TW | Why it confuses |
|---|---|---|---|---|---|
| coverage | `copy-dictionaries.ts:148/504/849`; `product-ui.tsx:154`; scan step hint `:23` "Improve coverage" | "Coverage {coverage}%" | 覆蓋率 | 涵蓋率 | It reads like "insurance coverage" or a percentage grade. Owners will assume a low % is bad performance. 30 en strings. |
| comparable / comparable scan | `copy-workspace.ts:421,437`; `home-brief.tsx:85,188,202`; `product-ui.tsx:157` | "Awaiting comparable scan", "since comparable scan" | 等待可比較掃描 / 可比較 | same | The core proof concept, explained only in methodology. 27 en strings. |
| snapshot | `home-brief.tsx:106` eyebrow; `copy-dictionaries.ts:234,236`; `pocket-assistant/run-status.tsx:9` | "Snapshot · {date}", "Metadata only · snapshot not stored" | 快照 (unwrapped, `home-brief.tsx:106`) | 快照 | A DB noun. "Scan on {date}" would do. |
| state enums | `copy-workspace.ts:432-437` / `:722-727` | Unsupported, Superseded, Not eligible, Insufficient coverage, Approved · export ready | 未支援, 已被取代, 不符合資格, 覆蓋不足, 已核准 · 可匯出 | same | These are raw `ProviderState`/`ApprovalState`/`MeasurementState` values. "Unsupported" next to IG reads like a product bug. |
| Attributed / Inference (FactType) | `product-ui.tsx:298-302` | "Attributed", "Inference" (English shown verbatim) | 可能相關, 推論 | same (one zh map for both) | Bare epistemics labels with no legend or tooltip. |
| delivery / approved delivery / allowance | `messages/en.json:105-106`; `copy-workspace.ts:486,501,534`; `action-detail-client.tsx:678`; `billing-view.tsx:59` | "{count} approved deliveries a month", "approved-delivery allowance is used up" | 核准後交付 | 核准後交付 | A billing unit invented in the codebase. 27 + 11 strings. |
| run / run state / state machine | `action-detail-client.tsx:1016,1021` | "Agent run", "Recoverable run state", "Separate state machine", "No single overloaded status", "Independent lifecycle summary" | 可復原執行狀態, 獨立狀態機, 不以一個含糊狀態代表所有事情 | (same, binary) | Engineering design notes rendered as a tab ("Workflow states"). |
| immutable / idempotency / audit | `action-detail-client.tsx:430,1027,1030`; `public-pages.tsx:162` | "Immutable output versions", "Conflict and idempotency", "Version & audit history" | 不可變更的輸出版本, **衝突及冪等性**, 版本及審計紀錄 | same | 冪等性 is a computer-science term. |
| entitlement / payload / mutation / lifecycle | `public-pages.tsx:161-164`; `billing-view.tsx:79-81` | "Production mutations must verify role, workspace, location, entitlement and integration permission", "raw provider payloads", "Payment lifecycle", "entitlements… webhook" | 伺服器強制執行範圍 / 權益 / **webhook** | same | This is the Trust page and Billing, both customer-facing. |
| OAuth tokens | `public-pages.tsx:177` | "OAuth tokens" | **OAuth 代幣** | same | 代幣 reads as "crypto coin". |
| JSON-LD / schema / FAQ schema / H1 / CMS | `copy-workspace.ts:402,417,550` / `:693,708,838-841`; `copy-dictionaries.ts:221/577/922` | "FAQ and JSON-LD workflow", "FAQ schema present" | "將 `<script type="application/ld+json">` 區塊貼入你網站嘅 `<head>`" (`:840`) | FAQ 結構化資料 | Raw HTML in owner instructions. |
| AEO | `messages/*.json:408` | "AEO Data" | AEO 數據 | AEO 數據 | Not explained anywhere for owners. |
| provenance | `assets-view.tsx:44` | "Every asset shows provenance, rights…" | 來源 | 來源 | Fine in zh, jargon in en. |
| "Locale stays separate", "Purpose-limited" | `copy-dictionaries.ts:23` (scan step hints) | stepHints | — | — | These are product-guardrail phrases, not instructions. |
| "Score = weighted measured signals ÷ eligible…" | `public-pages.tsx:150` | Formula as heading | 評分 = 已量度訊號加權值 ÷ 合資格已量度權重 | via zhFor | Fine on methodology, but it is an `<h2>`. |

### 3.2 Register problems inside zh-HK (written vs colloquial)

The CLAUDE.md §5 standard is 香港書面中文. The codebase mixes three registers.

- **Colloquial Cantonese:**
  - `lib/messages/zh-HK.json`: 嘅 ×74, 唔 ×21, 喺 ×18. Examples: `:1` onboarding title 設定商戶，睇清第一步做咩; `:134` 免費 Scan 我嘅生意; `:204` 我哋搵到…; `:217` 緊急 scan 緊你嘅 IG….
  - `lib/scan-modes.ts:42-64,114,151,188,225`.
  - `components/landing-page.tsx:80,85,87,286`.
  - `copy-workspace.ts:838-841` (website-export disclaimer).
  - `action-detail-client.tsx:927`.
  - `copy-dictionaries.ts:675`.
- **Formal written Chinese:** the rest of `copy-dictionaries.ts` and `copy-workspace.ts` (嘅 ×1 and ×5 only).
- **Mixed in a single block:** `landing-page.tsx:79-90` puts 睇清 / 少啲…嘅 next to 毋須 / 由你已經營緊**的**生意 (的 and 緊 in one phrase).
- **The same HK screen flips register.** For example, onboarding takes its title from messages (colloquial) and its body from the dictionary (formal).
- **English inside Chinese:**
  - `zh-HK.json:134-135,170,217,220` ("Scan", "audit 報告", "Visibility Score").
  - `zh-HK.json` `legal.serviceBody` ("公開marketing visibility審視").
  - `scan-modes.ts:58-64` ("scan preview", "v0.1", "IG handle", "profile", "audit").
- **Approval verb has three variants in zh-HK:**
  - 核准 appears ×17 in workspace HK and in `seo-copy.ts:28`. CLAUDE.md lists 核准 as a TW term.
  - 審批 appears in `public-pages.tsx:82` and `seo-copy.ts:30`.
  - 批准 appears in `landing-page.tsx:87` and `public-pages.tsx:162`.
  - `public-pages.tsx:82` (審批流程) and `:84` (核准後交付) sit next to each other on one pricing card.
- **Wrong timing:** `messages/{en,zh-HK,zh-TW}.json:135` says "get your audit report in 30 seconds" (30 秒即收 audit 報告), while the landing page says "a few minutes" (CLAUDE.md §5).

### 3.3 zh-TW leaks (HK terms on Taiwan pages)

| Location | zh-TW renders | Expected TW |
|---|---|---|
| `r/[slug]/opengraph-image.tsx:41` | 你間舖 AI、Google、IG 搵唔搵到？ (Cantonese) | 你的店 AI、Google、IG 找得到嗎？ |
| `copy-dictionaries.ts:1149` | 輸入**商戶**名稱 | 店家 |
| `copy-dictionaries.ts:1172-1173` | 尚未連結已掃描的**商戶** / 為你的**商戶** | 店家 |
| `copy-dictionaries.ts:1137,1153` | **店主**登入, 由**店主**批准 | 店家 / 核准 |
| `copy-workspace.ts:864,887` | 只有**店主**… / 需要**店主**或經理 | 店家 |
| `packs/[packId]/page.tsx:19` | 入門**套裝** | 套組 (as in `audit-labels.ts:60`) |
| `assets-client.tsx:23,26,49,61,64` (binary, unwrapped) | 地點, 上載, 帖文 | 據點, 上傳, 貼文 |
| `artifact-preview.tsx:12` | 可**審批**輸出預覽 | 核准 |
| `run-status.tsx:10`, `onboarding-page.tsx:286`, `home-brief.tsx:106` | 商戶 / 快照 unwrapped | 店家 |
| `lib/funnel/sample-report.ts:138` | 商戶 | (demo, low) |
| `action-detail-client.tsx` (2 lines) | 店主 / 地點 | — |

`zhFor` also misses some terms: 帖文→貼文, 套裝→套組, 舖→店, 電話短訊→簡訊, 嘅/唔/喺 (colloquial). Mixed formality in zh-TW: the workspace TW dictionary uses 您 ×20 and 你 ×10, messages TW uses 您 ×40 and 你 ×36, and the funnel TW uses 您 ×2 and 你 ×28.

### 3.4 Mixed-locale strings (any locale)

- `action-detail-client.tsx:1016`: the eyebrow "Agent run" shows in zh.
- `public-pages.tsx:189`: the sign-in badge "Visibility Workspace" shows in zh.
- `public-demo-workspace.tsx:71` and `landing-page.tsx:527`: "Visibility Operator" chip in zh.
- `home-brief.tsx:81`: the agent strip is English-only, but only in the en branch (OK).
- `app/layout.tsx:23`: the root `<meta description>` is zh-HK for en and zh-TW pages.
- `FactType` (`product-ui.tsx:301`) shows English labels in en (OK), but has a single zh map. 可能相關 for "Attributed" is softer than the guardrail meaning ("temporal association").

---

## 4. Text-heavy screens

Rough English copy load. "Dict" is that screen's section in the dictionaries. "Inline" is literals in the component. Both include all states.

| Screen | Component | Inline words | Dict words | Over ~40 visible? |
|---|---|---|---|---|
| Landing | `landing-page.tsx` | 1,205 | 26 | **Yes** (10+ sections) |
| Scan | `scan-page.tsx` | 21 | 337 + messages.scanner | **Yes** (per step ~60–90) |
| Scanning | `scanning-page.tsx` | 36 | 348 | **Yes** (stalled/resume ~90) |
| Report | `report-view.tsx` + `report/*` | 154 | 465 | **Yes** |
| Unlock | `unlock-page.tsx` | 0 | 250 | **Yes** (~120) |
| Pricing | `public-pages.tsx` (Pricing) | ~400 | 71 | **Yes** |
| Methodology | `public-pages.tsx` (Methodology) | ~250 | 3 | **Yes** |
| Trust | `public-pages.tsx` (Trust) | ~250 | 148 | **Yes** |
| Sample report | `report-view.tsx` + `lib/funnel/sample-report.ts` | (as report) | — | **Yes** |
| Demo workspace | `public-demo-workspace.tsx` | 238 | — | **Yes** |
| Sign-in | `sign-in-page.tsx` + `auth/sign-in-copy.ts` | 31 | ~400 (217-line module) | Borderline (~50) |
| Onboarding | `onboarding-page.tsx` | 413 | messages.onboarding | **Yes** (~150 per gate) |
| Select workspace | `select-workspace-page.tsx` | 91 | — | Borderline |
| Owner home | `home-brief.tsx` (+needs-attention, fix-pack) | 392 + 77 | homeReviewCopy | **Yes** (~180) |
| Actions list | `actions-list-view.tsx` | 188 | phases/states | Borderline |
| Action detail | `action-detail-client.tsx` (+owner-review-check-panel 387, gbp-publish) | **1,234** | publish 470, verification 111, websiteExport 97 | **Yes**, worst |
| Create | `create-view.tsx` | 357 | — | **Yes** |
| Insights | `insights-view.tsx` | 216 | metrics 47 | **Yes** |
| Assets | `assets-view.tsx` + `assets-client.tsx` | 210 | — | Borderline |
| Calendar | `calendar-view.tsx` | 94 | — | No |
| Activity | `activity-view.tsx` | 51 | audit labels | No |
| More | `more-view.tsx` | 57 | — | No |
| Brand | `brand-view.tsx` + `brand-client.tsx` | 292 | — | **Yes** |
| Integrations | `integrations-view.tsx` | 126 | — | **Yes** (reauth note 26 words) |
| Team | `team-view.tsx` | 116 | — | Borderline |
| Billing | `billing-view.tsx` | 269 | — | **Yes** |
| Notifications | `notifications-view.tsx` | 43 | — | No |
| Offers | `offers-view.tsx` | 0 | **offers 467** | **Yes** |
| Packs | `pack-view.tsx` | 7 | packs 165 | **Yes** |
| Assistant sheet | `pocket-assistant/*` | 441 | messages.assistant | **Yes** |

### 4.1 Proposed visual replacements (screens above ~40 words)

| Screen | Main text blocks (file:line) | Replace with |
|---|---|---|
| Landing | ownerStory + confidence (`landing-page.tsx:77-136`), loop body (`:156,187`), agent team (`:210-215`), "not another agent" explainer (`:502,528`), plans (`:597`) | **3-step icon row** (Scan → Approve → Prove) replacing the confidence trio. **LoopRibbon animation** for the loop paragraph. **Agent cards** with one line each. Plans: price cards only, and move the "approved deliveries" text into an **InlineExplainer popover**. |
| Scan | step hints and security body (`copy-dictionaries.ts:23-30`), manual-entry warning (`:46`), coverage heading (`:71`) | **Stepper with icons** in place of the hints. **CoverageMeter preview** that fills as optional channels are added, replacing the "Improve coverage" text. Consent as **3 toggle rows** with ⓘ popovers. |
| Scanning | stalledBody / resumeNote (`copy-dictionaries.ts:130,141`), backgroundBody, recoveryBody | **Animated collector checklist** (pending→running→measured icons) plus an elapsed ring. Collapse stalled/resume into a **status card with one sentence + "Why?" disclosure**. |
| Report | firstScanBody (`copy-dictionaries.ts:174`), withheld body (`:172`), unlockBody (`:251`), claimBody (`:259`), passport | **ScoreDial + CoverageMeter** side by side, with each source as a chip (measured / not measured). A **"Score withheld" illustration** in place of the 32-word paragraph. Unlock: **3-benefit icon row**. Claim: **"Verify with Google" badge + one line**. |
| Unlock | body + benefits + formBody + signInEmailHint (`copy-dictionaries.ts:268-280`) | **Two-step progress** (Report access → Ownership, later) diagram. Consent rows with **icons + ⓘ**. Drop the formBody paragraph. |
| Pricing | H1 (`public-pages.tsx:119`), plan descriptions (`:57-97`), usage banner (`:135`), FAQ (`:136`) | **Plan comparison table with check icons**. **"What counts as a delivery" mini-flow** (Draft → Approve → Export = 1) in place of the 16-word heading and banner. |
| Methodology | principles (`:149`), formula (`:150`), limitations (`:151`) | **Weighted donut** (IG 30 / GBP 35 / AEO 25 / Trust 10) and a **"missing ≠ zero" visual** (greyed slice lowers coverage, not score). **FactTypeBadge legend**. |
| Trust | pillars (`:160-165`), approval contract list (`:176`), retention card (`:177`) | **ApprovalFlow diagram** (Draft → Approved version → Export, nothing auto-publishes). **4 shield icons with 4-word captions**. Retention as a **table** (data type / kept for / who sees it). |
| Sample report / Demo workspace | demo explainer (`public-demo-workspace.tsx:72`), Operator chip | Same as Report and Home, plus a **sticky "Demo data" ribbon** in place of the paragraph. |
| Onboarding | Google verification (`onboarding-page.tsx:256`), staff assignment (`:268`), wrong-business (`:246`), basics intro | **3-step progress tracker** with a **"Verified with Google" check animation**. Move the ownership policy into an **InlineExplainer**. Show the wrong-business text only behind a link. |
| Owner home | follow-up review block (`home-brief.tsx:136-145`, homeReviewCopy), proof empty state (`:202-203`), ledger (`:272-277`), agent summary (`:253`), withheld (`:175`) | **ScoreDial + delta chip**. **"Next step" card** with a single CTA. **Before→after metric tile** for proof, with an **empty-state illustration** ("Do one action → rescan → proof shows here" 3-icon row). Ledger as **green/red/grey dots** with labels. |
| Action detail | workflow tab (`action-detail-client.tsx:1014-1023`), history tab (`:1025-1033`), needs-facts note (`:886`), conflict and compare (`:927`), delivery intro (`copy-workspace.ts:486`), website-export disclaimer (`:550`) | Remove the "Workflow states" tab. Replace it with a **horizontal ApprovalFlow stepper** (Draft · Approved · Exported · Measured) at the top. History becomes a **timeline**. Needs-facts becomes an **input checklist**. The disclaimer becomes a **"Not published yet" badge + popover**. |
| Create | allowance and agent note (`create-view.tsx:201`), disclosure (`copy-workspace.ts:587,664`) | **Channel picker cards with icons**. **Usage meter** ("2 of 3 this month") in place of the disclosure sentence. |
| Insights | denominator note (`insights-view.tsx:111`, 43 words), comparable badges (`:64`) | **Line chart with gaps** (dashed for non-comparable). An **ⓘ popover** on "Presence rate" for the denominator. |
| Brand | `brand-client.tsx` field help | Inline **examples/placeholders** in place of the help paragraphs. |
| Integrations | reauth note (`integrations-view.tsx:32`) | **Connection status chip** (Connected / Needs reconnect) + "Reconnect" button + ⓘ. |
| Billing | eyebrow "payment lifecycle", entitlement/webhook text (`billing-view.tsx:59,79-81`) | **Plan card + usage meter + next-billing date**. Delete the webhook text. |
| Offers / Packs | `copy-workspace.ts` offers (467 words), packs (165) | **Offer card preview** (live mock of a post). **Pack progress ring** (n of 3 drafts). |
| Assistant sheet | `pocket-assistant/*` boundary and run-status text | **Suggested-question chips**. Boundary text becomes a **lock icon + 6-word caption**. |

---

## 5. Long headings (> 8 words) and long supporting lines (> 20 words)

Found 11 headings over 8 words and 86 supporting strings over 20 words (en; ops and legal included in the count). Worst 20:

| # | file:line | Words | Kind | Text (en) |
|---|---|---|---|---|
| 1 | `public-pages.tsx:135` | 16 | H2 | "One delivery is counted only after an exact version is approved and first exported or published." |
| 2 | `messages/en.json:526` | 13 | H2 (legal) | "If a report names your business and you did not ask for it" |
| 3 | `home-brief.tsx:202` | 12 | H2 | "Proof appears after an action is completed and a comparable scan lands" |
| 4 | `public-pages.tsx:119` | 12 | H1 | "Not a bundle of AI tools. One team that moves improvement forward." |
| 5 | `landing-page.tsx:237` | 11 | H2 | "Connect the work after the report into one provable improvement loop." |
| 6 | `landing-page.tsx:193` | 11 | H2 | "Know what changed. Fix the next visibility problem. Prove what improved." |
| 7 | `landing-page.tsx:186` / `:597` / `public-demo-workspace.tsx:72` | 11 | H2 | "A closed loop that starts with evidence and ends with proof." / "See the issue for free, then choose the right operating rhythm." / "Start from the problem, not a grid of ten AI tools." |
| 8 | `public-pages.tsx:147` | 9 | H1 | "How evidence, coverage and comparable change are handled" |
| 9 | `messages/en.json:515` | 93 | body (privacy) | "When you run a scan we store the business details you enter…" |
| 10 | `copy-workspace.ts:550` | 47 | body | "This is a draft for your website editor, not a claim that your website has changed…" |
| 11 | `insights-view.tsx:111` | 43 | body | "The denominator is the queries that returned a usable result in that scan…" |
| 12 | `copy-dictionaries.ts:130` | 42 | body | "This scan has not reported a new stage for a while. It may still be running…" |
| 13 | `copy-dictionaries.ts:332` | 42 | body (trust) | "Nothing here is deleted by age yet, and we will not publish a schedule we do not run…" |
| 14 | `copy-dictionaries.ts:141` | 41 | body | "Resuming never starts a second scan — it can only pick up this same scan…" |
| 15 | `onboarding-page.tsx:268` | 41 | body | "Ownership is proven, never self-declared, and we do not match on email…" |
| 16 | `copy-dictionaries.ts:259` | 40 | body | "Sign in to claim this report into a workspace… unlocking a report on this device does not by itself prove you manage the business." |
| 17 | `rescan-button.tsx:127` | 40 | dialog | "A rescan re-reads the same public sources as the original scan…" |
| 18 | `create-view.tsx:201` / `public-pages.tsx:177` | 34 | body | "One approved delivery is counted only after an exact version is approved…" / "Scan evidence, agent inputs and outputs, assets, audit events, OAuth tokens…" |
| 19 | `auth/sign-in-copy.ts:77` / `copy-dictionaries.ts:273` / `onboarding-page.tsx:256` | 33–34 | body | "No code? Sign-in codes only reach an address…" / "Your full report opens here as soon as you unlock it…" / "Sign in with the Google account that manages…" |
| 20 | `copy-dictionaries.ts:172` / `onboarding-page.tsx:246` / `copy-workspace.ts:486` / `copy-dictionaries.ts:306` | 31–32 | body | Score-withheld explanation / not-your-business / GBP publish intro / pricing plan note |

The legal text (`messages/en.json:515-537`) is long by nature. Keep it, but put it behind accordions.

---

## Key takeaways

1. **There is no single source of copy.** Five systems overlap: dictionaries, messages JSON, label maps, 688 inline ternaries in 63 files, and the zhFor shim. `action-detail-client.tsx` alone carries 125 ternaries and about 1.2k English words.
2. **zh-TW is a derived locale in about 36 files** because of `isChinese = locale !== "en"`. HK terms leak through: 商戶, 店主, 地點, 上載, 帖文, 套裝, and a Cantonese OG tagline.
3. **zh-HK has no consistent register.** Colloquial Cantonese (messages JSON, landing, scan-modes) sits beside formal written Chinese. It also uses three approval verbs (核准, 審批, 批准) and Chinglish fragments ("Scan", "audit", "Visibility Score").
4. **There are about 9 product or feature names.** SME Scanner, Visibility Workspace, Growth Workspace, Visibility Operator, 隨身增長助理, "operator", AI visibility team, Fix Pack, Work pack and Starter pack. "Agent" is left as an untranslated English word in the Chinese UI.
5. **Engineering vocabulary reaches customer pages.** Examples: state machine, idempotency (冪等性), immutable, entitlement, webhook, OAuth 代幣, JSON-LD and `<head>` instructions, coverage/comparable/snapshot.
6. **The copy contradicts itself on scan time.** It says "30 seconds" in `messages/*.json:135` and "a few minutes" on the landing page.
