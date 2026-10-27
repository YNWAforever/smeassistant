# UX redesign changelog

Each phase has a full report in `docs/ux/`.

## One word for each thing (2026-10-27, second pass)

- **待辦, not 行動:** every owner screen, Ask Kinnso answer and owner email now calls a task 待辦, matching the nav. The public site keeps its own wording.
- **相片 / 照片, not 素材:** photos and menus are called that, in the asset picker, the task screen, Activity and Ask Kinnso.
- **Task states in plain words:** 草稿已寫好, 需補資料, 寫稿中, 需先連接, 已確認 · 可複製.
- **To do:**
  - A confirmed task's button says "打開再複製", as on Today; viewers see "查看待辦".
  - The select box sits in each card's corner instead of its own row, so the list is about 12% shorter on a phone.
- **Shop profile checklist:** screen readers say 填咗 / 未填 for each item instead of the badge words.

## Workspace clean-up: less to read, clearer next step (2026-10-27)

- **Task screen:**
  - The task's icon sits in the header.
  - The three steps (改稿 → 確認 → 複製文字) are pills, with the current one in orange and a line saying nothing is sent without your OK.
  - When there is a draft, the draft comes first and "what this is based on" folds below it.
  - Tabs are "寫稿同確認" and "紀錄". The back link says "返回待辦".
  - The approval flow no longer appears twice.
  - On a desktop the floating approval bar is hidden, because the buttons are already on screen.
- **New task:**
  - Cards drop the "Live" badge; only Beta and similar labels show.
  - The tags read 掃描發現 / 你嘅想法.
  - The free-text box is optional ("有冇嘢想補充？").
- **Plan:** one usage rule at the top instead of three notes. Before subscriptions open, a "聯絡 Fimmick" button appears when a contact channel is set.
- **Google and Instagram (was 連接與整合):** each source has its icon, and the labels say what we check ("最近檢查", "我哋可以做咩", "只睇公開帖文，唔會幫你發佈").
- **Notifications:**
  - The two cards are "全間舖可以收嘅電郵（店主設定）" and "我自己收嘅電郵".
  - "有嘢變差咗" replaces the regression-alert jargon.
  - The why-mail-won't-arrive note shows once.
- **Activity:** "要處理嘅問題", a "邊個做" column, and plain event names (掃描結果已儲存, 待辦已排序).
- **Photos and menus, Team, Profile, choosing a workspace:**
  - "加相或餐牌" and "等你確認".
  - Each role is described in one line ("只可以睇，唔可以改").
  - The Profile buttons read "儲存" and "加資料".
  - The workspace picker reads "揀你想處理嘅舖頭".
- **Viewers** no longer see "keep your streak" or "fill in your profile" nudges they cannot act on.
- **English:**
  - "Only one scan so far" reads as a full sentence.
  - The first badge is "First confirm".
  - The breadcrumb on a task reads "Task".

## Friendlier owner screens: icons, charts, photos and progress (2026-10-26)

- **Icons:** every kind of task has its own picture (reviews, posts, Google, search, website) on Today and To do.
- **Today, "your month":**
  - a ring of tasks done this month out of what is open;
  - a weekly streak;
  - the four sources the last scan could check;
  - five badges: first confirm, first copy, five done, full profile, four-week streak.

  It all counts what the owner did, never results, and says so. The score stays under 點解咁講.
- **Photos:** the shop's own confirmed photos on Today and the Shop page; where there are none, a credited sample photo (the three Pexels images the landing page once used), labelled 示意圖, and an "add photos" button.
- **Shop:** a profile card with a ring and a six-item checklist (voice, facts, lines you're happy to say, a photo, Google, Instagram) linking to where each is filled in.
- **Better?:** a bar per scan showing how much each scan could check (never the score), with scans that cannot be compared marked.
- **Simpler words:** task summaries, the usage note, the "start writing" button and the only-one-scan message are shorter.

## Owner quick fixes (2026-10-26)

- **Today:** the results and other-tasks rows are styled cards; "other tasks" no longer counts the task already shown; the button says what happens next ("打開再複製", "睇草稿再確認", "連接 Google") and the card shows the first lines of the draft; the sidebar badge reads "1 項緊急".
- **One word per idea:** approval is 確認 (待確認 while waiting) in both Chinese locales; the usage meter is 已用次數 with a note on what counts; Google's listing is "Google 商家檔案" everywhere; "相同事" is now "相片同餐牌".
- **Task screen:** the five panels that were all called "點解先做呢項？" are named for what they hold (版本資料, 根據咩發現, 相片說明, 品牌檢查, 貼咗出去未？, 技術紀錄).
- **To do:** priority, state and time needed show on each card; evidence folds under "睇證據"; the bulk-assign bar appears only after selecting; "更多" says what it holds.
- **好啲？ after one scan:** a starting-point card with the scan date, coverage and the rescan button (or the plan link on the free tier). No score is shown for a single scan.
- **Settings pages:** Plan, Team, Activity, Profile, Integrations and Notifications speak in owner words (no "webhook", "Agent", "伺服器端授權" or English badges).
- **Phones:** one location menu (in the top bar), a labelled 問 Kinnso button, and no search-glass mark in the top bar.

## Phase 11: the legacy stylesheet is gone (2026-10-21)

- **Nothing looks different.** The last pre-redesign styles were either unused (deleted) or basic defaults for text, links, focus rings, buttons and selects, which now have their own files. Every page was checked against 372 screenshots.
- **One question for you:** the arrow links on the landing page's sample case are dark because of an old rule; the kit meant them to be brand brown. They stay dark until you decide.

## Phase 10: shared and public styles off the legacy stylesheet (2026-10-21)

- **Nothing looks different.** The public pages (landing, scan, scanning, report, unlock, pricing, methodology, trust, legal, sign-in, onboarding, demo, 404) and the styles they share with the workspace now have their own files. Every page was checked against 372 screenshots before and after.
- **The old stylesheet is down to 32 KB** (from 84 KB). What remains is base element rules, two button colour rules that have to stay, and about 7 KB of classes no page uses any more, listed in the report for a decision.
- **The screenshot tool** now covers the public pages too, signed out and in light mode.

## Phase 9: tidy the workspace screen files (2026-10-21)

- **Dark mode:** icons and step numbers on orange are now dark, as in light mode, instead of white.
- **Nothing else looks different.** The workspace style files lost repeated rules, unneeded `!important`, and 36 old sidebar colours that never showed. Every step was checked against 284 screenshots.
- **A colour sheet** lists the 56 colours still written by hand. Four now use theme colours, including the Today card borders, which now follow dark mode. The rest stay as written.

## Phase 8: workspace screens off the legacy stylesheet (2026-10-21)

- **Nothing looks different.** Action detail, Today, the Actions queue, Insights, the shell, Ask Kinnso, Business, Settings and New now have their own style files. Every change was checked against 284 screenshots in two languages, two widths, and light and dark.
- **One dark-mode fix:** the approval bar on action detail no longer has a bright outline in the dark theme.
- **The old stylesheet is half the size** (157 KB to 84 KB). What remains is mostly the public pages and a few shared styles.
- **A screenshot tool** in `test/visual/` captures states that normal test data never shows, such as a version conflict, being offline or a used-up allowance, and compares two runs pixel by pixel.

## Phase 7: repo hygiene and finishing (2026-10-20)

- **Names:** the paid plan is called the Growth plan (增長方案 / 成長方案) everywhere, and the product is called Kinnso OS everywhere, including the report title and the WhatsApp message. A test stops old names coming back.
- **Search engines** now get every page in every language with the right language links. The launch check passes in full.
- **All interface text** lives in the shared copy files in English, Hong Kong Chinese and Taiwan Chinese, including the demo workspace, pricing and Ask Kinnso. Nothing looks different.
- **Tidier repository:** 27 unused interface components removed, old agent files archived under `docs/archive/`, a new README for Kinnso OS, and an index of the redesign docs.
- **Legacy styles were measured** across every page, role, size and theme. The rules not seen in use all style real states (offline, conflicts, unread notifications), so none were deleted. Shrinking them means moving those screens onto the new styles.

## Phase 6: quality (2026-10-20)

- **An action that isn't there is a real 404 again**, including a mistyped link, which used to show a server error.
- **Action detail** is split into small parts, and its text, like the rest of the workspace's, now lives in the shared copy files. Nothing looks different.
- **Phones:** every button, chip, checkbox and switch has a 44 px touch area, without stretching how it looks. The language label in the top bar is no longer cut off. Queue cards with a long status no longer run off the screen.
- **Faster Actions queue:** it loads 41 KB less JavaScript, because the side panel's editor loads only when a panel opens. CI now fails a build that pushes any page over its JavaScript budget.
- **Accessibility checks:** 0 axe violations on every workspace page in light and dark, and every keyboard stop shows a focus ring. Sign-in fields keep a visible focus ring in Windows high contrast.
- **New acceptance tests** for bulk approve, the getting-started checklist, the side panel and the 404.

## Phase 5: onboarding and states (2026-10-20)

- **Error and loading pages:** a failed page shows a friendly error in the page's language, with Try again and a short reference code to quote to Fimmick. Workspace pages show skeletons while loading and a not-found that leads back to Today.
- **One role notice:** every "you can view, not change" banner now says what your role can do and who can change it.
- **Sign-in, onboarding and choosing a workspace** have a simple header with brand, language and Help, and sign-in says Kinnso OS.
- **Onboarding** is a three-step wizard: Signed in, Verify ownership, Business basics. A failed lookup shows an error with a retry instead of the wrong next step.
- **Choosing a workspace:** one card per workspace, listing each location's score (or "No score yet"), coverage and urgent count.
- **Getting started** on Today: five steps to the first delivered piece of work. The list hides itself once everything is done.
- **Empty states** across the workspace have an illustration, one line and one next step.
- **The scanning page no longer jumps** when the scan finishes.
- **Phase 4 fixes:**
  - The brand link goes to the plain workspace URL again.
  - On a phone, Settings › "Switch workspace or sign out" is the way to sign out.

## Phase 4: workspace shell and navigation (2026-10-20)

- **Five destinations:** Today, Actions, Insights, Business, Settings. Phones get a 5-tab bar, and the usage meter sits in the sidebar.
- **Ask Kinnso** (問 Kinnso) is the assistant's name, opened from the top bar. "SME Scanner" now reads "Kinnso OS" across the workspace.
- **Old links keep working:** Create, Calendar, Assets, Brand, Integrations, Billing, Activity and More answer with a permanent redirect to their new home, keeping `?location=`.
- **One Actions queue** with status tabs plus Due (the old Calendar) and Fix Pack views. A New button starts work from a goal, an offer or the starter pack; the offer and starter pack modes stay behind their flags.
- **Action detail opens beside the queue** on wide screens. Each action shows draft → needs approval → approved → delivered, and what changed since the previous version.
- **Bulk approve** for review replies and social posts only. Each draft's full text must be ticked as read, and each approval still goes through the usual server checks.

## Phase 3: scan and report (2026-10-20)

- **Report rebuilt** in reading order:
  - score with coverage, and a change shown only for comparable scans
  - "Do this first"
  - one card per source
  - key numbers, evidence photos, then every finding
- **"Do this first" is much higher on a phone:** 2,114 px from the top on an unlocked report instead of 4,977.
- **Findings** can be filtered by priority and source. Each one says why it matters, what to do next, and which source, date and limitation it comes from.
- **Undated evidence** shows the scan date, else "Date not recorded".
- **Save, share, print** on unlocked reports:
  - Save to my workspace leads to the Google-verified claim.
  - Copy link shares the public preview.
  - Print / save as PDF prints the whole report without site chrome.
- **Public preview** now shows each source's coverage and limitation openly instead of in a closed panel.
- **Scanning page** shows one row per source with its current step, and rows no longer jump when the status changes.
- **Unlock page:** the one required consent is set apart from the optional ones.
- **Scan wizard** split into a state hook and one file per step, with no visual change.

## Phase 2: public site (2026-10-20)

- **Kinnso OS brand** in the header, footer, page titles and Open Graph images, with a simpler nav (How it works · Pricing · Methodology) and one Free scan button.
- **Landing page** cut from 13 sections to 7:
  - One value line, the business field, an explicit market and one Start free scan button.
  - An 8-second illustration with no numbers or real business.
  - Then how it works, what we check, a Demo-labelled sample report, Free and Growth pricing, a five-question FAQ and a trust strip.
  - About 5,200 px tall on a phone instead of 15,500, with no photos.
- **Methodology and Trust** rebuilt with the shared visuals. The comparison table and how the work is prepared moved to Methodology, without agent names.
- **Honesty:** the hero no longer promises more customers (G-8), and the landing no longer claims a response-rate rise that the demo data contradicts (G-11).
- **CSS:** 36 KB of dead legacy rules removed, with no visual change elsewhere.

## Phase 1B: visual explanation and motion (2026-10-20)

- **Motion:** CSS presets with the still state as the default, plus small hooks (1.1 KB gzipped). Reduced motion shows every final state at once.
- **Visuals (`components/visual/`, 9.1 KB gzipped in total):**
  - score dial, coverage meter, trend chip and sparkline
  - impact/effort matrix and before/after compare
  - loop stepper, approval flow and scan progress
  - evidence preview, the "?" explainer and empty-state illustrations
  - feedback moments
  - a CSS page fade
- **Guardrails built in:** nothing compares scans that aren't comparable; unknown values are never 0; the matrix is labelled Recommended and before/after Attributed.
- **Checks:** zero axe violations and zero layout shift on the gallery in three locales, at two widths, in light and dark.
- **Not on pages yet:** they're wired in Phases 2–4.

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
