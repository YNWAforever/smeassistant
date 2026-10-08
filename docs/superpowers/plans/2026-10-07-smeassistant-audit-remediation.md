# SMEAssistant — Codex GPT‑6.1 Sol Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans`, if available, to implement this plan task by task. Use checkbox (`- [ ]`) steps for tracking. Default to sequential execution; do not delegate automatically. If that skill is unavailable, follow the same reproduce → implement → verify → record workflow directly.

**Goal:** 以 `SMEAssistant_Audit_2026-10-07_Evidence.zip` 為依據，修復商店掃描、登入／認領／onboarding、每日工作、維護及 AI 工具的已證實缺陷，補足可追溯驗收；不把本地通過、CI 通過或功能已合併誤當成正式營運完成。

**Architecture:** 保留現有 Next.js App Router、Neon Auth／Postgres、repository/service 層、確定性 guardrails、精確版本核准及既有角色／location scope。先修共用輸入與狀態契約，再修查詢正確性，然後做有界讀取及批量分派。排程、外部發佈、真模型評測及正式資料庫驗證獨立設門檻。

**Tech Stack:** 稽核基準為 Next.js 16.2.6、React 19.2.6、TypeScript 5.9.3、Node 24／最低 22.13、pnpm 9.12.0、Vitest、Playwright、Neon Postgres。執行時以當前 lockfile、`.nvmrc`、`CLAUDE.md` 和 CI 為準，不為這次修復順帶升級框架。

**Spec:** 原證據包主報告、Tasks／Operations／User_Cases CSV、E19–E37 及本文件。F／T／UC 編號保留；repo 內 `FINAL-AUDIT-REPORT` 的 FA 編號是另一套編號，不能互換。

**文件日期:** 2026-10-07（香港）；本文件只規劃，未實作產品程式、部署或啟用功能。

## Global Constraints

1. 先完整閱讀當前 `AGENTS.md`（如有）、`CLAUDE.md` Part A、相關設計決策與測試規範。頂部 Neon 契約優先於歷史 Supabase 段落。保留 `@neondatabase/auth@0.5.0-beta` 及僅保留的 transitive `@supabase/auth-js@2.79.0` 例外，不重新引入 Supabase 服務。
2. 本文件不是部署授權。執行者可在獲授權的 implementation session 做本地修復、隔離 fixture、測試和本地提交；`git push`、開 PR、部署、正式 migration、啟用 cron／feature flags、付費掃描／LLM、寄信及外部發佈，仍按該次 session 已有的明確授權和 repo 規則處理。先完成可本地審閱的工作，不因某項 hosted 驗收受阻而停下其他任務。
3. 測試使用 injected fixture、合成資料和可丟棄資料庫。不得讓 ambient `.env`、登入 cookie 或 provider key 把測試導向正式服務；不輸出秘密、個人資料或完整連線字串。不得為測試新建真實用戶／寄邀請郵件而假定已有授權。
4. 保留 workspace／action／location 的 server-side authorization、owner／scoped manager／viewer 差異、未驗證身份拒絕、既有無自助認領限制、same-origin returnTo、lease／idempotency。報告 slug 不是會員資格，也不是發佈授權。
5. 核准綁定 immutable version；改稿後不得繼承舊版本核准。批量功能只處理分派及到期日，不新增批量核准、生成、發佈、標完成或刪除。
6. 缺資料、未量度、unsupported 和 timeout 不等於零分、已完成或成功。Locale 不等於營業市場／貨幣。成效測量不聲稱營收因果。
7. DEC‑10 的 cron 撤下保持有效；`OFFER_PROMOTIONS_ENABLED`、`WORK_PACKS_ENABLED`、`CONTEXTUAL_ASSISTANT_ENABLED`、`PREVIEW_DRAFT_ENABLED`、`GBP_REPLY_PUBLISH_ENABLED` 不為結案而打開。布林旗標沿用嚴格 `true` 契約。
8. 不修改已提交 migration。若查詢索引確實需要 migration，讀取當前序列後新增下一個編號，先在 disposable DB 驗證。不要預設下一個一定是 0015；正式 journal 需另行唯讀核實。
9. 沿用既有版面、元件、CSS 和三語文案機制。避免大規模重構、重做品牌或順帶更換 auth／queue／ORM。
10. 每批維持可運作、可回退；保留現有 CI gates。新增測試必須針對真實失敗路徑，不可只修改 mocks、降低 assertion 或排除失敗測試以取得綠燈。

## Review Focus

| 失敗／輸入類別 | 必須證明的行為 | 主責任務 |
|---|---|---|
| 合法 slug、惡意 URL、claim 遺失 | 合法輸入跨頁保留；無效輸入拒絕；權限不擴張 | T-03、T-08、T-18 |
| 缺來源、partial、錯幣、缺日期、錯年份 | 不虛報量度或產生無根據優惠；warning 可見 | T-07、T-06、T-14、T-16 |
| mixed states、月初、scope、cursor | 分母穩定、IANA 月份正確、有界讀取、不跨租戶 | T-09、T-10、T-12、T-13 |
| 慢 body／DB、deadline、重試、併發 | 有總預算、未做項可恢復、重試不重送／重覆事件 | T-11、T-02、T-13 |
| 綠色 CI、flags off、缺 migration、無會員 | 不把程式存在當成可營運；hosted 證据與批准分開 | T-05、T-15、T-19、T-20、T-21 |

---

## 1. 基準、證據與完成定義

Repository: https://github.com/YNWAforever/smeassistant  
Live: https://smeassistant.vercel.app/  
Owner: https://smeassistant.vercel.app/zh-HK/owner

| 項目 | 已核對的基準 | 解讀限制 |
|---|---|---|
| GitHub main | `d1cbc7bd8a2bc7989c774d15001f7971274bed8d`；本計劃編寫時仍相同 | 開始實作時重核；不可覆蓋其後修復 |
| Audit production | `dpl_ARepQExFa36hUt1PzYcCzW4ECzCE`，同 SHA | 來自證據包；本次規劃沒有重新做 live audit |
| CI | run `37401133680`／job `112068346724`；merchant acceptance 44/44 | F-03 舊失敗已結案；不證明 branch protection／promotion gate |
| 本地 targeted suites | 34 files／641 pass | 另加的兩個行為反例失敗，不能混成全通過 |
| 操作記錄 | 72 項：38 pass、10 fail、11 blocked、12 not tested、1 N/A | 不是全產品通過率或正式環境 SLA |
| 工作台 | 稽核身份已登入但無 accepted membership；selector 看得到本人 pending request | 不可宣稱登入後 daily job 已 end-to-end 通過 |

E22／E31／E32 支持 slug 反例；E25 支持 URL；E28 支持 counts 和月份；E32 支持錯幣、缺迄日及 in-flight 假完成；E33／E34 支持功能與排程的驗收限制。原 ZIP 及內部 `MANIFEST.sha256` 在編寫時已核對。

E28 的兩個案例要移植為真正的 regression tests，保留會遵守 SQL `states` 條件的 mock，並加 DB integration 對照。E32 腳本是稽核重現工具；它若抽取原檔案字串，重構後可能不適用。永久測試要 import 真正函式、斷言應有行為，不能把當前錯誤輸出 `false` 當成預期。

每項任務分開記錄：`實作狀態`、`本地／CI 證據`、`hosted 驗收狀態`。允許「local_verified / hosted_blocked」，不允許把 blocked 改為 pass。只有取得該任務所需的證據才能結案；原 T-01、T-04 保留已驗證完成。

## 2. 執行次序與工作批次

下表是 review／commit 邊界，不要求立即建立 PR。每個小任務先做最小 regression，再實作和驗證；有明確 gate 的外部動作留到最後。

| 批次 | 次序／任務 | 可交付結果 |
|---|---|---|
| 0 基準 | T-01、T-04 保留；建立 checkpoint | 確認 SHA 漂移、證據、指令和阻塞，不重開舊 CI 缺陷 |
| A1 登入與认領 | T-03 → T-18 | `_` report slug 可進 onboarding；no_access 可查看本人申請 |
| A2 掃描誠實性 | T-08 → T-07 → T-14 | URL 前後端一致；不虛報來源完成；限制原因三語可讀 |
| B AI 事實 | T-06 → T-16 的 offline 部分 | 價格／貨幣／日期 guardrails；可重跑品質 corpus |
| C1 每日數字 | T-09 → T-10 | 切 tab 數字一致；HK／TW 本地月份正確 |
| C2 列表規模 | T-12 → T-13 → T-17 的 local 部分 | 有界列表、搜尋／篩選、可預覽的批量分派、手機基本可用 |
| D 維護與發佈準備 | T-11；T-05／T-19 的可用唯讀證據；T-21 的隔離準備 | deadline、DB／CI readiness、restore runbook |
| E 有條件驗收 | T-15 → T-20；T-02、T-16 live、T-17 HK field、T-21 restore | 僅在相關身份、權限、環境及預算具備時執行 |

實作依賴比原 audit tracker 增加兩條：T-12 在 T-09／T-10 之後，避免把 counts／月份錯誤帶入新查詢；T-13 的 preview／execute UI 及權限驗收包含在 T-17 local 檢查。`queries-pages.ts`、`workspace-read.ts` 的修改依次完成，不同批次不要同時覆寫。

**首批 checkpoint 是 A1，但不是停止點。** A1 驗證後繼續所有未受阻的本地任務。只在出現需要產品選擇、互斥要求或真正外部權限時記下具體問題；不要每小步要求使用者確認。

### 本計劃新增的實作預設

以下是建議採用的產品／工程契約，不是聲稱現有系統已具備：report slug 6–64 個 `[A-Za-z0-9_-]`；網址最多 2048 字元且為絕對 HTTP(S) URL；列表預設 25／上限 50；批量一次最多 50 個明確 action ID；dispatch 軟 deadline 55 秒，預留 5 秒結束；不明貨幣 `$`／`元` 提醒核對；local 月份使用 IANA timezone。若當前 repo 新版契約已明確不同，記錄差異、維持其安全性並更新本文件，不靜默改產品行為。

## 3. 批次 0：準備、基準及追蹤

**Files — 讀取現有:** `CLAUDE.md`、`.nvmrc`、`package.json`、`pnpm-lock.yaml`、`.github/workflows/ci.yml`、`vercel.json`、`docs/superpowers/`、發現的 `AGENTS.md`。  
**Files — 新增規劃副本:** `docs/superpowers/plans/2026-10-07-smeassistant-audit-remediation.md`；進度紀錄可放 `docs/audits/2026-10-07-remediation-progress.md`。原稽核 ZIP 留作唯讀輸入，不將其內的 scratch 測試整包搬入產品。

- [ ] 核對原 ZIP manifest，讀主報告、21 tasks、25 user cases、failed／blocked operations；保留 F／T／UC 連結。
- [ ] 用 `git status --short`、`git rev-parse HEAD` 和 `git diff` 確認工作樹；不可清掉使用者修改。依 repo 規則建本地隔離分支／worktree。
- [ ] 如果 main 已超過基準，先比較受影響檔案與測試；已修項只補證據，不重做。同 SHA 才沿用 baseline 數字。
- [ ] 記錄 Node／pnpm 版本；使用 lockfile 安裝依賴。列出本地 DB 和 provider fixture 策略，不把正式環境變數複製到測試。
- [ ] 原 T-01：記錄 DEC‑10、`vercel.json` 無 crons 和 E34 的有限 log 結果；不將「沒有 cron 記錄」寫成維護正常。
- [ ] 原 T-04：保留同 SHA CI run／job 和 44/44。新的修復仍需新的 CI；不改寫舊證據。
- [ ] 建進度表：task、base／result SHA、changed files、test command、exit code、case count、environment、evidence path、blocked reason、next step。

**完成條件:** 基準和安全測試環境可識別；所有 21 個 T 項都有獨立狀態。此批無產品修復宣稱。

## 4. A1：登入、認領和申請狀態

### T-03 · F-02 · 統一 report slug contract

**Evidence / cases:** E22、E31、E32；UC-12。  
**現有檔案:** `lib/identity/sign-in-flow.ts`、`app/api/oauth/google/claim/start/route.ts`、`app/api/oauth/google/claim/callback/route.ts`、`app/[locale]/owner/onboarding/page.tsx` 及各自現有 `.test.ts[x]`。用 `rg` 補找所有 report claim slug 驗證；`lib/workspace/slug.ts` 是 workspace slug，不能直接混用。  
**新增檔案（提案）:** `lib/report-access/slug.ts`、`lib/report-access/slug.test.ts`。

**Interface:** `parseReportSlug(value: unknown): string | null`，接受 6–64 個 ASCII 英數、`_`、`-`，保留大小寫及原 slug，不 trim 成另一個識別字、不雙重 URL decode。缺值回 null；report ID／signed token／workspace slug 使用各自契約。

- [ ] 先加失敗測試：`3cuOKFmHdiYf00BOs27E_NO1` 從 sign-in claim、OAuth round-trip 至 onboarding 查到同一報告；含 `-`、大小寫正常。
- [ ] 補邊界：長度 5／65、空白、slash、`%2F`／double-encoded slash、完整 URL 均拒絕；非法 claim 不變成任意 returnTo；授權拒絕照舊。
- [ ] 執行 targeted tests，確認失敗是合法 `_` 被拒絕，而非 fixture 沒有報告。
- [ ] 加共享 parser，替換已核實的 report slug 重複驗證。維持 OAuth state／claim binding／membership 行為。
- [ ] 重跑原有 sign-in、Google claim、onboarding tests；加一條 fixture acceptance 串接 flow。
- [ ] 本地提交 `fix(auth): unify report claim slug validation`，記錄 commit 和測試輸出。

**驗收:** 合法 public report slug 不再被 onboarding 當無報告；claim 未遺失；非法輸入 fail closed。**回退:** 回退此 commit；不改資料或既有 slug。

### T-18 · F-12 · no_access 可查看本人申請

**Evidence / cases:** E21、E24、E31；UC-08、UC-22。  
**現有檔案:** `components/auth/sign-in-completion.tsx`／`.test.tsx`、`lib/workspace/no-workspace-copy.ts`、`lib/identity/complete-sign-in.ts`（預設只讀）、`app/[locale]/owner/select-workspace/page.tsx`、`e2e/acceptance/guided-sign-in.spec.ts`。

**Interface:** 保持 `CompletionResult` 的 `no_access` 結果。新增純導覽 CTA 到 `/{locale}/owner/select-workspace`，建議 zh-HK「查看我的申請及工作台」，三語有對應。預設不增加 pending-status API、不自動 redirect、不自動加入會員。

- [ ] 先加 no_access 畫面測試：保留店主／同事指引、掃描和切換帳戶，另有本地 selector 連結。
- [ ] fixture 覆蓋本人 pending、沒有申請、陌生身份和已有 member；selector 不向陌生身份暴露其他申請。
- [ ] 新增 CTA／文案；沿用 selector 的 server identity 查詢，不用 email 對比來授權。
- [ ] 驗證 no_access 不要求已有申請者重掃；無 redirect loop；外站 returnTo 仍拒絕。
- [ ] 跑 completion、identity 和 guided-sign-in 相關測試；以獨立 commit `fix(onboarding): link no-access users to request status` 保存。

**驗收:** 可從完成頁到本人狀態；沒有新增 membership／申請／資料修補。**回退:** 只回退 UI／copy。

## 5. A2：shop scanning 與報告

### T-08 · F-06 · URL 前後端驗證一致

**Evidence / cases:** E25、E31、E35；UC-03。  
**現有檔案:** `components/scan-page.tsx`／`.test.tsx`、`lib/funnel/scan-start.ts`、`lib/scan/start-job.ts`／`.test.ts`、`app/api/scan/start/route.ts`／`.test.ts`、`test/integration/neon-scan-start.integration.test.ts`。  
**新增（提案）:** `lib/funnel/website-url.ts`／`.test.ts`；如未有，新增 `lib/funnel/scan-start.test.ts`。

**Interface:** `parseOptionalWebsiteUrl(raw: unknown)` 回傳 `{ok:true,value:string|null}` 或 `{ok:false,reason:"invalid_type"|"invalid_url"|"unsupported_scheme"|"too_long"}`。可略過欄位／空白；非空必須是絕對 HTTP(S) URL、長度 ≤2048、無 username／password。保留合法 path／query。這是輸入驗證，不取代 fetch 層 DNS、redirect、private-IP 等安全防護。

- [ ] 先驗 `not-a-url` 無法從 step 3 進入有效預覽、不增加來源數；空白可繼續。
- [ ] 表格測試 HTTP／HTTPS、path／query、空白、非字串、`javascript:`／`file:`／`data:`、credentials、2048／2049 邊界。
- [ ] UI next、source count、payload builder、server parser 共用此 helper。candidate website fallback 同樣驗證；使用者明確輸入無效網址時不能偷偷換 candidate 繼續。
- [ ] server 在建立 job／扣 quota／呼叫 provider 前拒絕，回 400 和可本地化的欄位錯誤。UI label、help、`aria-invalid`／error 關聯一致。
- [ ] 跑 component／start-job／route／scan integration；驗合法 path／query 到 collector 不被丟失；保持既有安全 fetch tests。
- [ ] commit `fix(scan): validate website URLs at UI and server boundaries`。

**回退:** 回退 parser／UI，不改既有資料。不能把此修復報告成已確認或修復 SSRF 漏洞；audit 未證實 SSRF。

### T-07 · F-05 · 進度不猜測 module outcome

**Evidence / cases:** E23、E31、E32；UC-04。  
**現有檔案:** `lib/funnel/scan-progress.ts`／`.test.ts`、`components/scanning-page.tsx`／`.test.tsx`；透過 import 找實際 scan-status DTO producer，只有需要時才增補 DTO。  
**Interface:** `collectorPhases(...)` 維持入口。建議加 `awaiting_result` 顯示 phase（「等待結果」）；`done` 僅由明確 measured outcome 產生。terminal moduleStates 優先，未知舊 payload 保持未知。

- [ ] 先固定反例：`collectorPhases("collecting_aeo","processing",null)` 不能把 Instagram／Google 猜成 measured／done。
- [ ] 覆蓋不填 IG、unsupported、unavailable、failed、timeout、partial、stage 前進／terminal 結果到達、舊 payload 無 outcomes。
- [ ] 把 collector stage 與 outcome 分開；只有 DTO 明確提供 not-requested 訊號時才能顯示「未提供」，不可從時間或下一個 stage 猜測。
- [ ] 三語顯示 running／等待結果／未能量度／失敗的區別；不變更 scoring 或工作租約。
- [ ] 重跑進度與 scanning component tests，保存可見 label assertion，commit `fix(scan): show only evidenced collector outcomes`。

**回退:** 回退呈現邏輯；原始 outcome 保留。驗收要求整段進度「從未」短暫誤顯示 measured，而不只是最後畫面正確。

### T-14 · F-11 · 限制原因本地化

**Evidence / cases:** E21、E23、E26；UC-05、UC-10。  
**現有檔案:** `lib/funnel/report-labels.ts`、`lib/report/view-model.ts`／`.test.ts`、`components/report/dashboard-metrics.tsx`、相關 report／demo copy dictionary；先沿 import 定位，保留已改善的「能見度」及空白狀態文案。  
**新增（需要時）:** `lib/funnel/report-labels.test.ts`，若已有則擴充。

- [ ] 列出公開 UI 實際收到的 limitation codes，先加 `IG_HANDLE_NOT_PROVIDED`、TRUST 未量度及未知 code 的三語測試。
- [ ] 用 typed code → copy mapping，提供原因和適用下一步。未知 code 用本地化一般提示；raw provider text／code 留在適當內部診斷，不直接向店主顯示。
- [ ] 保留「未量度」和「量度為零」差別，不把未知限制變成已完成。
- [ ] 驗 zh-HK／zh-TW／en；不單用 screenshot snapshot，assert 可見原因與操作文字。commit `fix(i18n): localize scan limitation reasons`。

**狀態說明:** 原 audit「進行中」表示先前已有部分改善，不代表這份計劃已開始改碼。**回退:** copy／mapping commit。

## 6. B：AI 工具事實檢查與品質

### T-06 · F-04 · 優惠貨幣、完整日期及年份

**Evidence / cases:** E31、E32、E35；UC-14。  
**現有檔案:** `lib/agents/offer-checks.ts`／`.test.ts`、`lib/agents/agents/promotion-copy.ts`、`lib/agents/agents.test.ts`、`docs/superpowers/specs/2026-10-01-offers-promotion-copy-design.md`。沿用 acceptance warning taxonomy，不擅自將 warning 改為自動核准或整個流程的硬 gate。

**Interfaces:** 保持 `offerPriceMismatch(body, offer): boolean`、`offerDatesMissing(body, offer): boolean`；內部解析 token 必須含 amount 及 currency，不只數字。沿用 `offer_price_mismatch`、`offer_dates_missing`。

**本計劃的明確規則:** `HK$`／`HKD`／港元／蚊為 HKD；`NT$`／`TWD`／新台幣為 TWD；`US$`／`USD`／美元為 USD（offer 本身仍只接受既有 HKD／TWD）。裸 `$`／`元` 不足以確定貨幣，提示核對，不由 UI locale 猜貨幣。這項收緊要在測試和文案記錄。沿用數值 tolerance、千分位／小數等值，不把年份／電話当價格。

- [ ] 先固定 E32：HKD88 文案 NT$88 和 US$88 必有 price warning；只有 valid_from 必有 dates warning。
- [ ] 加 HKD／TWD 正例、1,280／1280.00、無 offer price 卻報價、錯 amount、同額錯幣、混合多種價格、裸符號歧義、沒有任何價格的 fixture。
- [ ] 日期須涵蓋起日和迄日；同一天可只出現一次。ISO／中文／既有 D/M、D MMM 格式都檢查；explicit wrong year 不能被無年份 substring regex 蒙混。跨年範圍要求可確定的年份；不完整／不可能日期 fail conservatively。
- [ ] 加只有起日、只有迄日、兩者皆漏、錯年、跨年、同日、正確本地格式。修改原來只要求「任一日期」的錯誤 assertion，註明新契約。
- [ ] 用 deterministic parser 修正，不加 LLM 呼叫。透過 promotion agent acceptance 測试確認 warning 傳到店主；warning 文案同時涵蓋缺漏／不一致，而非聲稱已查證優惠。
- [ ] 驗改稿後原版本核准不移轉；Beta flag 保持 off。commit `fix(ai): validate offer currency and full validity range`。

**回退:** flags 維持原值，回退 validator；不要用打開 Beta 來做正式驗收。

### T-16 · AI 品質基線：現在做 offline，live 有條件

**Evidence / cases:** E27、E32、E35；UC-14、UC-19。  
**現有檔案:** `lib/agents/index.ts`、`test/corpus/workflows/`、`scripts/eval-workflows.ts`／`.test.ts`。稽核時 12 個工具（7 Live／5 Beta），執行時重新列 registry，保存分類。  
**新增（提案）:** corpus 的 HK／TW fixtures、`docs/audits/ai-quality-baseline.md`；沿用現有 harness，不造第二套 eval runner。

- [ ] 等 T-06 通過後，以實際 registry 建 coverage 表：每工具 × HK／TW × normal／missing-data／adversarial／recovery，12 工具時目標 96 個具名 fixture；不適用項寫理由，不假造通過。
- [ ] 適用工具額外覆蓋錯幣、過期優惠、prompt injection、schema malformed、provider timeout／retry、多語、缺來源。定義輸入、允許證據、禁止主張、期望 warning／needs-input／recovery。
- [ ] CI 全部 injected outputs、零真模型花費；標記為 guardrail／contract coverage，不能稱為 AI 寫作品質實測。含秘密或指令注入的外部內容不得變更系統規則或授權。
- [ ] 準備 live 評測 manifest：工具／模型／參數、樣本、人工標準、預算上限、停止條件、token／成本、p50／p95、schema failures、無根據主張、price／date accuracy。不同工具／市場分開統計；樣本不足不推論穩定 p95。
- [ ] 只有該 session 明確授權預算與 dataset 後，才用現有 `EVAL_LIVE=1` 和 `--budget-usd` opt-in。不用 production action 或開 Beta flag 來做品質評測；超預算前停止。
- [ ] 人工核對真模型輸出，保留失敗樣本；現有 gate 必須全通過，但品質門檻和預算由已記錄產品決定約束。commit offline corpus 和 docs；live 結果獨立記錄。

**現在可完成:** corpus／harness／本地證據。**仍受阻:** DEC‑04 真模型預算／reference dataset 未提供。fixture pass 不解除 live blocker。

## 7. C1：daily job 數字正確性

### T-09 · F-07 · tab counts 分母一致

**Evidence / cases:** E28、E31；UC-15。  
**現有檔案:** `lib/workspace/queries-pages.ts`／`.test.ts`、`lib/workspace/overview.ts`、`lib/repositories/workspace-read.ts`、`test/integration/neon-workspace-read.integration.test.ts`、`components/workspace/action-filters.tsx`。

**Interface:** 先保留 `ActionFilters`／`ActionListResult`。counts 由「已授權 workspace＋location scope＋channel＋explicit status」得到；不受 active tab、cursor 或 page size 影響。既有 `all` 表示 open actions；completed 獨立，drafts／awaiting 依現有 `displayPhaseKey`，可重疊，不保證所有 tab 相加等於 all。

- [ ] 移植 E28 mixed needs_input／completed 反例；mock 必須真正套用 `opts.states`。測試不能只讓 mock 回全部而掩蓋查詢 bug。
- [ ] 在 integration fixture 做相同資料；切所有 tabs，counts 相同；location／channel／explicit status 改變時依約更新。
- [ ] 分開 counts scope 和 list view filter；沿用 canonical phase，不創造另一套 draft／approval 判定。T-12 前先完成最小正確修復；過渡期讀取成本寫入 checkpoint。
- [ ] 驗 owner、scoped manager、viewer 的可見範圍；遵從既有 workspace-wide action 規則，不將 `location_id=null` 當成可繞 scope。
- [ ] 跑 queries／integration tests，commit `fix(workspace): keep action tab totals independent of active view`。

**回退:** read path commit；無資料改寫。T-12 必須用 DB aggregation／projection 解掉過渡讀取成本，不靠每頁重載全部 versions。

### T-10 · F-08 · 本地月份上下界

**Evidence / cases:** E28、E31；UC-16。  
**現有檔案:** `lib/workspace/queries.ts`、`lib/workspace/queries-pages.ts`／`.test.ts`、`lib/repositories/workspace-read.ts`、`lib/workspace/delivery-notices.ts`／`.test.ts`、`lib/workspace/notify.ts`、`lib/repositories/notifications.ts` 及相關 integration。  
**新增（提案）:** `lib/workspace/month-window.ts`／`.test.ts`。

**Interface:** `monthWindow(period: string, timezone: string)` 回 `{period,timezone,startLocalDate,endLocalDate}`，驗證 `YYYY-MM` 和 IANA zone。repository 以 parameterized Postgres `AT TIME ZONE` 轉換 local midnight，使用 `[start, end)`；不再拼 `${period}-01T00:00:00Z`。timezone 由可信 workspace context 取得，不由 client 決定。

- [ ] 先固定 2026-10-01 00:30 HKT 時、00:15 完成的行動須計入 10 月。對應 UTC：現在 `2026-09-30T16:30:00Z`、完成 `16:15:00Z`、下限 `16:00:00Z`。
- [ ] 加 HK／TW 月初 00:00、00:15、07:59、08:00、前月底、下月 00:00；若 workspace 接受 DST zone，同測該 zone 和 UTC。不可硬編碼所有時區 +8。
- [ ] 修 home completion 查詢，並搜尋所有 period-to-instant 使用點。`delivery-notices.ts` 的 allowance notice 去重也是 UTC 下限，須共用正確月份 descriptor；不改既有 quota／billing period 定義。
- [ ] 跨 repository signature 的變更一次更新 callers／mocks。integration 驗實際 DB boundary，不能只測 helper 自己輸出的字串。
- [ ] 跑 queries／delivery notice／DB tests；commit `fix(workspace): use workspace-local month windows`。

**回退:** 查詢 commit；不回填或重寫歷史 completed_at。月初 counts 改變是修正，不代表新完成了工作。

## 8. C2：有界列表、查找及批量分派

### T-12 · F-10 · cursor pagination 和最新摘要

**Evidence / cases:** E31；UC-18。**依賴:** T-09、T-10。  
**現有檔案:** `lib/repositories/workspace-read.ts`、`lib/workspace/queries-pages.ts`、`lib/workspace/overview.ts`、`app/[locale]/owner/[workspaceSlug]/actions/page.tsx`、`components/workspace/actions-list-view.tsx`／`action-filters.tsx`、`test/integration/neon-workspace-read.integration.test.ts`。  
**新增（提案）:** `lib/workspace/action-list-cursor.ts`／`.test.ts`、`test/integration/neon-action-list-pagination.integration.test.ts`、benchmark fixture／結果文件；索引 migration 僅在 EXPLAIN 證明需要時新增下一號。

**Interfaces（提案）:** `ActionFilters` 增加 `cursor?:string; pageSize?:number`；`ActionListResult` 增加 `nextCursor:string|null; hasMore:boolean`。repository 新增獨立 list projection／counts methods，detail／history methods 保持完整功能。排序採 `priority_score DESC, updated_at DESC, id DESC`，先核對現有產品排序；明確處理 nullable priority，cursor 使用完全相同的排序值。

- [ ] 建 10／100／1000 actions、每項 10 versions／5 runs 的 deterministic fixture。測同 priority／timestamp、空列表、恰滿頁、末頁、scope 邊界；禁止真用戶資料。
- [ ] 先加失敗測試：預設 25、上限 50、非法 cursor／pageSize 拒絕；固定資料跨頁無遺漏或重複；counts 與 page 無關；response 不含全量 version body／meta／run history。
- [ ] 用 keyset cursor、`LIMIT pageSize+1`、每 action 最新所需 metadata／摘要及適當索引讀取。不能先讀全部再在 JS slice；不能只限 actions 卻仍讀所有歷史 body。
- [ ] cursor 綁定 filter／scope fingerprint，變更 filter 時清除；cursor 不是 authorization。每次 server 重新限制 membership／location。動態資料在翻頁期間可能移位，要提供 refresh、UI 去重；不聲稱未實作的 snapshot consistency。
- [ ] counts 用 DB aggregation 或 compact bounded representation，保持 T-09 的 canonical phase；加 SQL projection vs `displayPhaseKey` parity corpus（connection、queued/running、approval、delivery、applied、completed）。查詢次數保持固定，不 N+1。
- [ ] home 的 `openActions` 也限制展示數，總數另取；保留 detail 的完整版本讀取。不要把共用 versions/runs 方法全域加 LIMIT，導致 detail／approval 讀錯版本。
- [ ] 記錄 before/after EXPLAIN、query count、DB rows、response bytes、固定環境延遲；清楚分冷／暖樣本。驗收以有界讀取、語义一致、固定 fixture 跨頁完整為硬條件；延遲是真實量測，不能編造 p95 或承諾 1000 actions 一定多少毫秒。
- [ ] integration／UI pagination 通過，commit read-model 和 UI（可兩個可運作 commits）。若原 tracker 的 rollback flag 要保留，僅限測試／內部診斷；不得成為正式環境默默回全量歷史的 fallback。

**回退:** 回到前一已驗證部署／read path；新增索引可保留，不做破壞性 down migration。禁用新入口要保持既有單筆操作可用。

### T-13 · F-10 · search／filters／bulk assign

**依賴:** T-12。**Evidence / cases:** E31、E33；UC-18。  
**現有檔案:** actions page／list／filters、`app/api/actions/[actionId]/route.ts`、`lib/repositories/action-mutations.ts` 及其授權 helper。  
**新增（提案）:** `lib/workspace/bulk-action-updates.ts`／`.test.ts`、`app/api/workspaces/[workspaceId]/actions/bulk/route.ts`／`.test.ts`、`components/workspace/bulk-action-dialog.tsx`／`.test.tsx`、`test/integration/neon-bulk-action-updates.integration.test.ts`。

**Interfaces（提案）:**

- query 增 `q`（trim、最多 200 chars）、`assignee`（UUID／`unassigned`）、`due`（`overdue`／`today`／`next_7_days`／`none`），依 workspace timezone 計算。只搜 list 可見標題／摘要，不掃所有 version bodies；同樣作用於 counts。
- `POST /api/workspaces/:workspaceId/actions/bulk`，`mode:"preview"|"apply"`，`items:[{actionId,expectedUpdatedAt}]`，`patch:{assignee_user_id?:UUID|null,due_at?:ISO8601|null}`；不接受其他欄位。最多 50 個唯一 ID、日期須帶 timezone。兩欄皆略過是無效請求。
- preview 回逐筆 before／after、eligible／reason。apply 回逐筆 `updated|no_change|forbidden|not_found|conflict|failed`；foreign entity 對外錯誤要避免暴露存在性。不給跨 workspace 的名稱／細節。

- [ ] 先寫 service／route 失敗測試：viewer 拒絕、scoped manager 越界拒絕、assignee 必須是可接受且適用 scope 的 member、未核准 target／deleted action、preview 後角色或 updatedAt 改變、重覆 ID、51 IDs、不可寫欄位拒絕。
- [ ] 抽出單筆與批量共用的 server-side validated patch service。不能只由前端迴圈呼叫 PATCH 而漏 assignee scope；不得擴張原 authorizeActionMutation 權限。
- [ ] preview 必須用 DB 當下狀態；apply 再驗角色、scope、assignee、action state 和 `expectedUpdatedAt`。每筆更新／audit event 在同一 transaction 內 CAS，不把整批變成無法解讀的單一成功。
- [ ] idempotent set：desired state 已存在即 no_change、不重覆事件；conflict／timeout unknown 先重新讀取再 preview。重試只送失敗項，保留成功項結果；不能盲目重播全部。
- [ ] UI：先篩選 → 明確勾選 → 預覽 → 確認分派／到期日 → 逐筆結果。跨頁最多 50 項，清楚標示已選数量；workspace／location／filter 改變清空選取；不提供未實作的「全部查詢結果」選取。
- [ ] 搜尋／filter 用參數化查詢；保存 URL state／清除 cursor；手機對話框及 focus 正常。加 `ACTION_BULK_ASSIGN_ENABLED`（新提案，預設 off，fixture 可 true），保留單筆路徑，不順带在 production 打開。
- [ ] 測 2 成功＋1 scope 拒絕＋1 concurrency conflict，重試失敗項後成功項事件數不增加；UI 宣告部分完成，不能 toast「全部成功」。提交 service/API、UI 和驗收三個小 commit，任何中間 commit 都保持 gated／可編譯。

**回退:** 關入口旗標／回退程式；已合法分派的資料不自動還原，使用同一正常單筆流程更改。沒有必要為最多 50 項而新增 durable bulk-job 系統；若遇到真實 timeout 風險，再用量測支持設計調整。

## 9. D：maintenance、readiness 與營運

### T-11 · F-09 · dispatch 共享總 deadline

**依賴:** 已完成的 T-01。**Evidence / cases:** E27、E31；UC-17。  
**現有檔案:** `app/api/cron/dispatch/route.ts`／`.test.ts`、`lib/mail/deliver.ts`／`.test.ts`、`lib/mail/transport.ts`、`lib/mail/resend-driver.ts`／`.test.ts`、`lib/repositories/mail-outbox.ts`、`test/integration/neon-mail-outbox.integration.test.ts`。  
**新增（提案）:** `lib/jobs/execution-budget.ts`／`.test.ts`。

**Interfaces（提案）:** dispatch 建一次 `ExecutionBudget {remainingMs():number; signal:AbortSignal}`，使用 injectable monotonic clock。route `maxDuration=60` 保留；工作預算 55s、5s 收尾。各步、DB claim、provider request 和 body read 都共享剩餘時間；`MailTransport.send(message, context?)` 增 optional context 並更新全部 implementations／mocks。

- [ ] 用 fake clock／controlled promises，先重現 10 筆 ×10s 串行 transport 超過預算；再測 fetch headers 已回但 body 不回、DB lock／query 慢、前面 dispatch 步驟已耗時。
- [ ] 將 deadline 傳入 notify／reclaim／auto／reconcile／verify／mail 路徑；每步啟動前檢查剩餘預算。對不能取消的操作不要用 `Promise.race` 假裝完成；DB 有適當 statement／lock timeout 或 repo 所支援的取消機制。
- [ ] mail 改 just-in-time claim（每次一項、總數最多 10），避免一次租下 10 項後丟棄 9 項。保留 lease token CAS 和 provider dedupeKey；未嘗試項不因 deadline 被累計為失敗或 dead-letter。
- [ ] provider timeout 取 `min(10s, remainingBudget)`，涵蓋 response body／JSON；response streaming 卡住也可取消。已開始但 provider 結果不明時沿用冪等鍵／reconcile 契約，不承諾無法證明的 exactly-once。
- [ ] 定義 budget exhausted 結果為可觀測的 deferred；釋放或到期恢復未完成 lease，要有明確且測過的規則。保留已完成項；不得用延長 route 時間掩蓋無界工作。
- [ ] fake transport＋DB integration 驗總 deadline、可重試、租約競爭、已送不重送；fixture provider received-count／event-count 可追溯。commit `fix(maintenance): enforce a shared dispatch deadline`。

**驗收限制:** 可证明程式預算，不宣稱所有平台終止都有 100% 保證；若現有 DB／HTTP driver 不可取消，該支線不得標已滿足，應改為可取消 driver／獨立有界 worker 並說明影響。Cron 仍關閉。

### T-05 · F-03 · required CI 與 promotion gate

**依賴:** 已完成的 T-04。**現有:** `.github/workflows/ci.yml`、repo rulesets／branch protection、Vercel deployment／promotion 設定；外部設定先唯讀。

- [ ] 記錄哪些 checks 是 required、對應 branch／commit、是否允許 bypass、production alias 如何提升；secret 值不入報告。
- [ ] 對比 CI 成功 SHA 與部署 SHA。沒有讀取權限就標 blocked，不用 workflow 檔案推論平台 gate 已啟用。
- [ ] 準備一個隔離失敗分支演練程序；需要 push／建立外部資源或更改設定時，先完成可審閱方案，再按執行 session 授權進行。
- [ ] 已授權且安全的非 production 演練證明 failure 不會獲准提升正式 alias；不把「沒有點 promote」當作 gate 有效。若 gate 缺失，提出明確 required checks／promotion 修正，保留替代保護後才移除舊 gate。

**驗收:** settings＋失敗路徑證據，單純 CI green 不足。T-04 不因 T-05 blocked 而重新標失敗。

### T-19 · production migration journal，特別是 0014

**Evidence / cases:** E33；UC-24。  
**現有:** `scripts/neon/readiness.ts`、`scripts/neon/migrations.ts`、migration journal／schema、`lib/repositories/measurements.ts`、publish flag-off integration tests。

- [ ] 本地 disposable DB 先驗 committed migrations、schema 和 flag-off measurement。`first_published_at` 在 publish flag 關閉時仍被 measurement 讀取；不能用關旗標來掩蓋缺 column。
- [ ] 準備唯讀核對清單：deployment／SHA、明確 DB host／database、0001–0014（及之後已提交的）journal／checksum、schema／privilege readiness；不輸出連線字串。
- [ ] 只有取得合適唯讀存取後，按當前 CLI 要求設定 `NEON_READINESS_HOST`、`NEON_READINESS_DATABASE`、canonical origins，運行 `corepack pnpm neon:readiness`。此指令不是 migrate，也不等於 hosted auth 全通過。
- [ ] journal／checksum 不一致就停止該 release／enablement，交付具體差異和 migration 前置計劃；不可自動 apply、改舊 migration 或偽造 journal。

**現在可完成:** 本地 schema／measurement fixture 和唯讀程序。**仍受阻:** 缺獨立正式 DB metadata 證據。作者「已套用」不能代替核對。

### T-02 · F-01 · 只有決定啟用營運才恢复排程

**依賴:** T-01、T-11、T-19；另需明確改變 DEC‑10 的營運決定。  
**現有:** `vercel.json`、dispatch route、既有 job／heartbeat／observability 設施（先沿 repo 定位）；新增 docs runbook，不預先承諾不存在的監控 API。

- [ ] 現在先做 fixture 的 cron auth、dispatch budget、lease／idempotency，以及 heartbeat／backlog／missing-tick 的可審閱設計；未決定啟用就不加回 crons。
- [ ] 提出具體 scheduler cadence、工作上限、告警去向與閾值、owner、停用操作，核對平台當時限制。不把增加 scheduler 當作修復舊 401 根因。
- [ ] 獲准後在受控環境證明無憑證拒絕、合法 tick 連續 3 次、每步 heartbeat、backlog 可見、缺 tick 告警；使用合成不寄信／不發佈的 job。
- [ ] 啟用前核對與其他 scheduler 不重覆；保留 roll back 與 unresolved delivery ledger。只有經授權才做 production enablement／觀察。

**驗收:** 3 次合法 tick 和可恢復結果；監控失效也是 blocker。若 DEC‑10 仍有效，狀態是「有意未啟用」，不是 bug 已修或營運已驗收。

### T-21 · backup／restore 與交接

**Evidence / cases:** E33；UC-25。**新增（提案）:** `docs/operations/restore-drill.md`、演練結果模板；優先沿用現有 backup／restore runbook。

- [ ] 記錄目前備份機制、實際 retention／restore 方法、權限及費用來源；沒有證據的值留 unknown。
- [ ] 準備隔離 restore：明確 source recovery point、全新 target、禁止連 production alias、provider fixture／寄信關閉、合成 workspace 和登入流程。
- [ ] 授權及環境具備後執行；量測開始／可讀取／可登入時間、實際恢復點、schema／row／relationship／scope checks，算實測 RTO／RPO；不可拿產品承諾數字冒充演練結果。
- [ ] 交接 on-call、失敗處置、人工補償／清理、告警、密鑰管理責任；清理隔離資源按其授權處理，不覆蓋／刪除 production。

**狀態:** runbook 可以完成；未 restore 不得標演練通過。

## 10. E：完整驗收，不混淆 fixture 與正式結果

### T-15 · user registration／onboarding／daily job end to end

**依賴:** T-03、T-18、T-19；相關修復完成後再跑整段。  
**現有:** `e2e/acceptance/`、`playwright.acceptance.config.ts`、Neon auth E2E config／fixtures、各 action／version APIs。以现有規則擴充，不另造 bypass login。

- [ ] 先完成本地 fixture journey：初次身份／回訪登入 → claim 保留 → onboarding 中斷與 resume → 補必要 facts → 生成 → 修改 → 核准精確版本 → export → applied／完成 → 同條件 rescan／measurement。
- [ ] 把 registration 與 workspace membership 分清。覆蓋已存在身份、provider 取消／失敗、session 過期、未驗證身份、重複 callback／submit、accepted invitation／無 membership、pending request；只測 repo 支援的註冊方式，不新增密碼註冊。
- [ ] 角色矩陣：owner、scoped manager、viewer、nonmember。檢查 client 不能繞過 server role／scope；manager 不得操作其他 location；viewer 不可 mutation；陌生身份看不到他人申請。
- [ ] 每個 mutation 檢查 request／result／stored state／audit event；重試不重扣 quota、不重覆生成或移轉核准。生成失敗可回復，不產生假成功。
- [ ] Hosted 部分需要專用授權 workspace、測試身份和必要 provider 允許。沒有就記 blocked，保留具體缺項；不要使用真客戶資料代替。
- [ ] Hosted 認領、寄驗證信／邀請、掃描和外部寫入各自遵守已授權範圍；API／DB／畫面／deployment SHA 證據對上才標 pass。

**驗收輸出:** UC-08／09／19／20 對照、合成資料 IDs、版本 ID、expected vs actual、retry 結果、scope 拒絕；截圖去識別。測試新帳戶成功不代表已開放自助加入工作台。

### T-17 · 手機及 accessibility

**依賴:** T-12；T-13 完成後覆蓋其對話框。**Case:** UC-21。

- [ ] Local／CI：375px／390px、長 report／action title／三語，無水平溢出；掃描步驟、錯誤提示、篩選、分页、preview dialog 可完整鍵盤操作，focus 可見且返回合理位置；用 labels／roles assert，不只 screenshot。
- [ ] 對 loading／空結果／partial failure／slow network fixture 測可恢復和不可重複提交；記錄桌面模擬環境，不能說是香港真手機實測。
- [ ] 有 HK 實際裝置／網路樣本後，才收 LCP／INP／CLS，記錄地點、裝置、瀏覽器、連線、頁面、樣本數及量測方法；小樣本不宣稱 field p75／SLA。

**狀態:** local 可完成；HK field measurement 保留獨立 blocker。

### T-20 · P4.2／P4.3／P4.5／P4.6 分項 enablement

**依賴:** T-15、T-19。**Cases:** UC-23、UC-24。  
**現有:** `lib/workspace/packs*.ts`、`app/api/workspaces/[workspaceId]/packs/route.ts`、`lib/assistant/suggestions.ts`／suggestions route、`lib/preview/`／preview route、`lib/publishing/`／publish routes；既有 flag-off integration tests。

| 功能 | 旗標 | 必驗契約 |
|---|---|---|
| P4.2 工作包 | `WORK_PACKS_ENABLED` | 3-item pack 的 scope／配額／去重；不當作 T-12 分頁或 T-13 批量分派已完成 |
| P4.3 建議 | `CONTEXTUAL_ASSISTANT_ENABLED` | 只用可讀取 context，缺資料不杜撰，不自動替用戶採取 mutation |
| P4.5 草稿預覽 | `PREVIEW_DRAFT_ENABLED` | grant／unlock／rate-limit／quota；preview access 不變成 workspace membership |
| P4.6 GBP 回覆發佈 | `GBP_REPLY_PUBLISH_ENABLED` | 連線＋角色／scope＋核准精確版本＋精確 target；結果未知時 reconcile，不盲重發 |

- [ ] 每項先測 flag off 和 fixture on、role／location／quota、provider failure／retry；record actual observed flag value only，不推測 production 設定。
- [ ] 以合成 provider 證明 P4.6 一個核准版本對精確 target 的一次寫入、readback、不確定結果 ledger／reconcile、配額只記一次；改稿失去舊核准。
- [ ] staging 具備相關授權後逐項驗收；production 打開旗標和真實發佈須另有具體 target／version 授權。未獲得就交付可審閱的 enablement checklist／rollback，不代按 publish。
- [ ] 0014 `first_published_at` 的 measurement 在旗標 off 時仍通過；收起入口不能掩蓋 schema 不完整。

**回退:** 各自關旗標／回先前版本；保留未知結果 ledger 以 reconciliation，不能刪記錄假裝沒發生。

## 11. 執行命令與驗證策略

命令在 repo root 執行；先核對最新 scripts。所有測試在明確 fixture／disposable DB 環境，安裝或瀏覽器依賴不足要記錄，不替換成正式服務。

```bash
node --version
corepack pnpm --version
git status --short
git rev-parse HEAD
corepack pnpm install --frozen-lockfile
```

每任務只跑相關最小紅／綠測試；下列為已存在路徑的例子，新增測試加入同一批：

```bash
corepack pnpm exec vitest run lib/identity/sign-in-flow.test.ts 'app/[locale]/owner/onboarding/page.test.tsx' app/api/oauth/google/claim/start/route.test.ts app/api/oauth/google/claim/callback/route.test.ts
corepack pnpm exec vitest run components/auth/sign-in-completion.test.tsx
corepack pnpm exec vitest run components/scan-page.test.tsx lib/scan/start-job.test.ts app/api/scan/start/route.test.ts
corepack pnpm exec vitest run lib/funnel/scan-progress.test.ts components/scanning-page.test.tsx
corepack pnpm exec vitest run lib/agents/offer-checks.test.ts lib/agents/agents.test.ts
corepack pnpm exec vitest run lib/workspace/queries-pages.test.ts lib/workspace/delivery-notices.test.ts
corepack pnpm exec vitest run lib/mail/deliver.test.ts lib/mail/resend-driver.test.ts app/api/cron/dispatch/route.test.ts
corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-workspace-read.integration.test.ts
```

E28 測試整合到既有 queries 測試，不永久保留「讀檔 regex 抽函式」作為測試框架。integration config 需要的 disposable DB／Docker，依 repo 程序啟動；不能憑文件名稱認為任何 `DATABASE_URL` 都安全。

每個 review 批次在完成 relevant tests 後，依影響執行 lint／typecheck。所有可本地完成的批次整合後，跑一次目前 CI 的完整 gate，重型步驟順序執行，不同 terminal 不同時跑整套：

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:secret-boundary
corepack pnpm test:no-supabase
corepack pnpm test:no-self-service-claim
corepack pnpm db:verify
corepack pnpm test:integration
corepack pnpm build
corepack pnpm e2e
corepack pnpm e2e:acceptance
```

CI 的 fixture 設定包括 `SCAN_SOURCES=fixture`、`VITEST_MAX_WORKERS=1`、`NEON_INTEGRATION=1`、合成 `RATE_LIMIT_SECRET` 和 localhost origin；精確 DB 啟動／reset／Playwright webServer 設定以 `.github/workflows/ci.yml` 為準。不在本計劃中提供可被誤貼到 production 的 migrate／deploy／live 指令。`e2e:live`、`e2e:neon-auth` 和 `eval:workflows` 都先核對其 target／side effects／授權，不能混入普通零花費 gate。

完整 gate 通過後只為明確新風險／失敗再補測，不無限重跑。新 SHA 的 CI 結果取代不了 hosted 驗收。若環境缺 Docker／credentials／裝置，記錄命令、失敗原因和尚未驗證的層級，不能宣稱測試全通過。

## 12. 完成、交接及驗收紀錄格式

### 每批交付

- [ ] 實際修改檔案和 commit SHA；每批目的／行為改變，不寫只有檔名的摘要。
- [ ] 最小 regression 的 before-fail／after-pass 證據；integration／UI／CI 的實際 command、exit code、樣本數與日期。
- [ ] 更新原 T／F／UC 對照，不覆蓋原 audit CSV。新增 tracker 分開 `audit_status` 與 `implementation_status`，保留 T-14／T-18 的歷史部分完成意義。
- [ ] 人工 diff review：權限、確定性檢查、query bounds、local month、lease／retry、flags off、秘密和 migration immutability。
- [ ] 為每批寫簡短 review／PR 草稿與 rollback；只在執行 session 已授權時才 push／開 PR。

### 最終報告必須回答

1. 哪些 F 已由回歸＋整合證據修復？哪些只有 code／fixture verified？對應 SHA 是甚麼？
2. 所有 21 個 T 的狀態、可點開證據和下一步；T-01／T-04 不要列成新修复。
3. Auth／claim／onboarding／daily job 哪些真實步驟有 hosted 證據？哪些因 membership／測試身份仍受阻？
4. Cron／AI live eval／Beta／publish 實際是否啟用？沒有啟用就明說；不把準備好等同營運中。
5. 哪些外部動作仍需具體授權、帳戶、budget 或環境？逐項指出對應已準備的方案，不問籠統「可以繼續嗎？」。

**可本地工作完成的定義:** A1、A2、B offline、C1、C2、T-11 的 code＋fixture gate 通過；所有可用的 readiness 證據已整理；剩餘 hosted blockers 清楚列出。這不自動等於全部 21 tasks 結案，也不等於 production 已修復。

**全稽核整改結案的定義:** 所有仍適用任務都有其要求層級的證據；正式 release 的 SHA、CI／promotion gate、DB journal、授權工作台 journey 和相關營運驗收相符。營運決定繼續停用的功能可記「有意不啟用／不適用於本次 release」，需附決定，不能偽記 pass。
