# 已有評論與逾時用量可靠性修復

日期：2026-10-17，Asia/Hong_Kong。

本報告只覆蓋本輪修改與本輪新執行的驗證。較早的真實 AI 五份草稿及失敗 log 原樣保留，不能當作本輪最終版本的驗收。`browser/` 是本輪最後重跑輸出；最後 candidate 前的中途畫面與 receipts 另存於 `browser-before-final-candidate/`。

## 版本及範圍

- Repo：`YNWAforever/smeassistant`。
- Worktree：`C:\Users\laich\Documents\smescanner\.worktrees\smeassistant-llm-rate-limit-20261015`。
- Branch：`codex/content-approval-journey-20261017`。
- 修改前 HEAD：`6b293eca02b5c8ae5a0f5e1ad51994719d4cbfa5`，保留該 commit 已完成的草稿版本及批准保護。
- 本輪唯讀 `git ls-remote origin refs/heads/main`：`ae8411f41f95eb53d2caa27ee1621410f8bbfe86`。
- Application 修復 SHA：`d153c4a3e4c614de0377f055ee24b10d7b5cb655`。
- 真實 AI 接續 runner SHA：`bb3f48af4ae42a362c3ff58878f74286736e0f40`；只增加隔離回覆診斷留存。`git diff d153c4a HEAD -- app components lib test e2e` 為空，兩批應用程式與測試內容相同。
- `candidate-source.json` 對應 51 個測試時檔案；後續只有 relay 診斷三行是預期差異，其餘 50 個檔案逐一核實不變。最終來源、測試指令、exit codes 及 receipts 見本報告末段及 `final-verification.json`。
- 授權：本機修復、新建且可精確清理的 Docker fixtures、原有 key、指定 OpenCode Go endpoint、exact `longcat-2.5-preview-free`。沒有 push、PR、merge、部署、正式資料/Auth 設定變更、真實電郵、Eldage、外部發佈或排程。

## 根因及最小修復

### 已有評論被重問

舊 prompt 把空的 scanned-review array 與「沒有評論」混為一談，即使 authorized owner inputs 已有非空原文。模型的 `facts_needed` 又直接進入後續表單。

`lib/agents/review-source.ts` 從已授權 context 判定 owner／scan／visitor／missing，供 prompt 和 merchant-only normalization 共用。非空 owner 原文、已選的 scan 評論和只有 rating 的有效評論均屬可用來源；空白、不合規 rating 及空 scan 不算。Prompt 保留 provenance，不把 owner 或 visitor 原文冒充 scan 資料。

只在已有來源且具備實際回覆正文時，移除重問評論的欄位；混合問題只移除評論部分，保留其他必要資料。只有澄清句、空白或原評論引文的輸出不能建立草稿／新版本；完整回覆中的重複索取句則被移除。缺原文時仍在模型請求前追問。共用 public-preview parser 沒有放寬。

### 逾時／遲到回覆用量漏記

舊做法在 provider effect 後才保存 aggregate usage，輸出 deadline 到達後無法保留遲到 usage；重試也可能把未知一次當零或再發模型請求。

- 在既有 `action_runs.input.provider_usage` 保存每次 attempt reservation，先 commit 再發請求。
- 記錄 attempt identity、模型、狀態、可核實 token、provider request ID 與已知 subtotal；缺失值保持 null。
- 利用現有 row locks 原子且去重地更新 usage，late observation 不改 run 終態、output、action state 或 output version。
- 保留 45 秒輸出 deadline 和 60 秒 route lifetime，使用現有 Next `after()` 等待最多約 50 秒的 usage-only window。硬截止先 abort transport，最後 DB observation 另設 1 秒上限；卡住也會保留 durable pending，而不是零。
- `pending`、`unknown`、`partial` 均阻止同 action 再生成；第一個失敗回覆及重載的 UI 與 API 一致。無法核實用量的自動 retry 被禁止。
- 既有 terminal null cost、且沒有新 attempt metadata 的資料仍標 unknown；不把 rollout 前缺記錄當零。新 pre-model gate，或 setup 已耗盡 deadline、根本沒有外部請求時，明記 0 tokens／0 cost；開始 attempt 後會由真實觀察或 unknown 取代初始零值。
- exact free model 的已知 usage 使用零費率估算；unknown tokens 仍是 unknown cost，不以免費模型名稱抹去缺失。

改動重用現有 runs、versions、membership、budget 和 UI 機制，沒有新增平行資料表、migration、認證政策或發佈機制。

## RED → GREEN 證據

- 第一輪 RED：`review-paths-red.log`、`late-usage-red.log`、`usage-record-red.log`、`usage-db-red.log`、`usage-budget-red.log`、`usage-ui-red.log`。
- 覆核追加 RED：`followup-red.log`（8 failed）、`reply-sentence-red-host.log`（2 failed）、`partial-db-red.log`（1 failed）、`legacy-usage-red.log`（1 failed）、`no-attempt-timeout-red.log`（1 failed）、`partial-response-red.log`（1 failed）。
- `reply-sentence-red.log` 是 sandbox EPERM、沒有執行任何測試，不算功能 RED。
- 部分舊 corpus 原先要求 timeout 後再發第二次模型請求；保留 case IDs，改成斷言一次請求、failed、沒有 version/output、unknown cost。不是跳過該情境。
- API tests 保留精確 deadline／model options／trusted membership 斷言，加上新 usage settlement callback 契約。Prompt corpus 只更新正確的版本指紋。

## 測試隔離及真實 AI 方法

DB fixture 先核對 Docker context／engine、唯一 container ID、ownership/database labels、database name、image、`network=none` 及沒有 published ports，之後才建立 client／migrate。應用程式使用 fixture runtime role；DB stream 只經本機 listener → 該 owned container 的 Docker exec，沒有 ambient／正式 DATABASE_URL fallback。清理前再次核對同一 container identity，只刪本輪 owned IDs。

Next 的環境採 allowlist，本機 Auth/mail fixture、假 relay credential，並禁止外連。真實 key 只由獨立 relay 讀入記憶體，沒有寫入 log、screenshots 或 Git。Relay 每次請求前核對當前官方免費資訊及 Go catalog，拒絕其他 model、model mismatch、非零 monetary response、非預期 payload 或超過 bounded calls。沒有 provider／model fallback。

新 runner 不包含舊驗收 helper 的「再填一次已有評論」補救；若出現重問或無版本，該次直接 FAIL。五個情境仍使用既有 app API 生成、Brand settings 修改、assistant revision 和版本保存；browser 檢查重載與新的 fixture session。

`firstSaveMs` 只量度生成 API 觸發至首版成功保存，不包括登入、初始設定、選擇建議或真人思考／操作時間。因此不能用它宣稱完整真人旅程已在 5 分鐘內完成；該產品時間目標仍需真人計時驗收。

額外 late-usage 案例使用真實 LongCat response，**由本機 relay 人為延遲交付**，不是聲稱 provider 自然逾時。確認 45 秒輸出失敗後，第二次生成被 409 拒絕，再放行同一回覆，只補記原 attempt usage；原草稿及 failed run 不改。Provider 沒回 usage、body 或超出 window 時必須保留 FAIL／unknown，不能補造通過。

## 保留的限制

- 無 provider reconciliation API／帳單對帳；超出 bounded window、process 被殺死或缺 token 的 remote request 仍需保留 unknown/pending。沒有證明遠端取消即沒有計算。
- 401／403／429 目前保留 `rejected` 觀察及未報 token。沒有足夠 provider 契約證據將所有 rejection 補寫成 0，因此可能保守阻止重試；沒有用假零令 budget 通過。
- 五份內容由使用者評核。未有人類評分就維持 `PENDING_USER`，不以模型自評代替 4/5 門檻。
- 本機 Auth/mail fixture 不是本輪真實 Google／OTP 登入驗收。Google ownership、OTP 過期／重用／限流、legacy magic-link、Safari/WebKit、真手機仍分開列為本輪未驗證。
- Chromium 390px 只是手機 viewport。
- 沒有部署；source、mock／DB／browser、真實 AI 及 production 驗收分開。

## 需要另行批准的部署及回復

沒有 migration 或正式設定變更。本輪不 push、開 PR、merge 或部署。若之後獲准發布，先核對當時 main／部署 SHA 及 exact CI，再部署到現有 SMEAssistant project；不建立第二個 project。

新判定會保守攔住 rollout 前 24 小時內的 terminal null-cost 記錄；無法證明有無 inference 的舊資料不應自動補成零。部署前需要另外批准相應正式唯讀影響核對，不能在本輪擅自回填／解除未知狀態。回復使用核實過的上一個 production deployment／revert 本輪 source commit；現有 JSON metadata 可保留，不刪 runs 或草稿資料。

## 本輪最終執行結果

所有命令的 working directory 均是上列 worktree。各 gate exit code 保存在 `candidate-stages.jsonl`，未將舊測試補成新版本成功。

65 份原始 `.log` 保留本機原貌，repo 交付用 `raw-test-logs.zip` 封存；`raw-log-archive-manifest.json` 記錄各相對檔名及 SHA-256，已逐個解壓 stream 核實相等。沒有修剪 terminal 原始輸出的尾空白或刪除失敗內容。報告、JSON 收據及截圖可直接閱讀；相對 `.log` 名稱對應 ZIP entry。

| 層級 | 實際指令／環境 | Exit | 結果 |
| --- | --- | --- | --- |
| 全 unit／workspace packages | `$env:VITEST_MAX_WORKERS='4'; pnpm test` | 0 | 6,209 PASS：root 5,622、safe-media 62、region 23、scoring 183、contracts 20、scan-engine 299 |
| API／DB 整合 | `node node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts test/integration/neon-artifacts.integration.test.ts test/integration/neon-ai-spend.integration.test.ts` | 0 | 34／34 PASS；owned PostgreSQL fixtures，包含 partial 第一回覆、拒絕重試／跨 workspace／actor、late replay、舊 null spend、版本 CAS 及審批保護 |
| Typecheck | `pnpm typecheck` | 0 | root 及四個 packages PASS |
| Lint | `pnpm lint` | 0 | 0 errors／40 warnings，保留 log；清理本輪兩項測試未使用變數／import 後重跑 |
| SDK／ownership 邊界 | `pnpm test:no-supabase`；`pnpm test:no-self-service-claim` | 0／0 | PASS，沒有刪 gate 或升級 SDK |
| 預設 build | `pnpm build` | 1 | **FAIL／本機環境阻礙**：Turbopack 不接受現有外置 node_modules junction，未改 production bundler 設定 |
| Webpack build | `pnpm exec next build --webpack` | 0 | PASS，完整 production build |
| 最終 build／client secret boundary | `$env:SME_TEST_WEBPACK='1'`，合成 provider keys／secrets、`NODE_OPTIONS=--require=./test/e2e/transport-guard.cjs`；`pnpm test:secret-boundary` | 0 | 最新來源完整 Webpack build 及 170 個公開 artifacts PASS；外連被阻擋 |
| 隔離 browser | `$env:SME_TEST_WEBPACK='1'; pnpm exec playwright test --config playwright.acceptance.config.ts e2e/acceptance/review-usage-reliability.spec.ts` | 0 | 4／4 PASS；英文 desktop、zh-HK 390px、缺評論零模型請求、45 秒後補記 usage／舊稿不變 |
| 真實 AI 首批 | `node --import tsx .superpowers/sdd/review-usage-reliability-20261017/run-live-acceptance.ts` | 1 | Case 1 PASS；Case 2 被事實守則拒絕、沒有版本。兩次請求已完整記帳，精確清理後才接續 |
| 真實 AI 接續 | 同指令加 `--from-case=2` | 0 | Cases 2–5、三次 assistant 修改、CAS／保存重播、late real-response、逐 run 對帳及清理 PASS |
| 彙整驗證 | `node .superpowers/sdd/review-usage-reliability-20261017/consolidate-evidence.cjs` | 0 | 五份唯一案例、10 個唯一 provider response IDs、全部 counters／reservation／時間先後、零未解 attempts、未批准及零送出已 assert |

Vite native-config 提示及 Node 既有 shell deprecation 提示保留在 log，沒有以壓制警告或改 timeout 令測試通過。第一次 browser 未設 Webpack opt-in 而啟動失敗的四個案例，保留於 `browser-final.log`，不算功能實測。較早兩次全 unit 的舊契約失敗亦保留；上表取最後 candidate 結果。

### 五個真實案例

| Case | 實際結果 | 最終版本 | 首次生成 API 至保存 |
| --- | --- | --- | --- |
| 1 | professional 英文，既有評論直接生成；保存／重載／新 fixture session 一致 | 1 | 17.679 秒 |
| 2 | 缺評論時模型請求 0；提供評論後的第一批被 fact guard 拒絕無版本；完整對帳後明確接續成功；沒有索取已知評論的補救 | 1 | 成功批 17.578 秒；原拒絕另列，不算首試全綠 |
| 3 | action 指向 Branch B；排除 Branch A 已確認地址及 B 未確認匯入地址；prompt、正文及讀回符合範圍 | 1 | 9.892 秒 |
| 4 | 新保存的 direct 語氣供縮短／較親切／contact CTA 三次真實 assistant 修改使用；每次另存及保存重播去重，最後讀回一致 | 4 | 初版 12.159 秒；不含後續三次修改 |
| 5 | 舊 base 保存 409；確認新 base 後明確另存，同一保存重播回同一版本 | 3 | 初版 8.788 秒；最後一句為人手測試追加，評核包有標示 |

五份正文及圖像在 `five-drafts-for-user-review.md`。本輪有限事實核對沒有發現這五份已保存正文新增地址、價格、優惠、營業時間、業務成效或實體到訪邀請；不是保證所有可能模型輸出，也不是 4／5 品質自評。原拒絕的正文沒有留存，**無法判定具體問題文字或是否誤判**；不把這個未知寫成已修復的另一個事實守則缺陷。

### 真實用量及遲到回覆

兩批共 **10 次真實 Go requests**，全部回報 exact `longcat-2.5-preview-free`、HTTP 200，官方免費 gate 每次通過。包括一個被守則拒絕的 completion、八個成功保存／修改的 completion，以及一個刻意延遲交付的 completion。

- Provider：**17,517 input + 2,152 output tokens**。
- Application：**17,517 input + 2,152 output tokens**。
- 逐 response ID 對上原 reservation，差額 0、unmatched responses 0、unresolved attempts 0；沒有把 unknown 當零。
- Application estimated cost 為 0。Provider response 沒有 monetary cost，沒有獨立 invoice／帳單查核，不能把免費定價驗證冒充帳單對帳。
- 既有 owner review 不需再次填寫；兩批所有成功案例的 `repeatedKnownReviewConfirmation=false`。未刪事實守則、改 prompt 資料或換 model 去掩蓋拒絕。

真實 late 測試是 **本機 relay 人為延遲真實模型回覆**：45.590 秒輸出為 failed／usagePending；重送生成請求 409，只有原本一次 inference。放行後同一 attempt 補記 **1,684 input + 177 output tokens**，run 仍 failed，原稿只有一版並在重載／新 fixture session 讀回不變。Usage observation 在 run terminal timestamp 後約 1.024 秒完成。`totalElapsedMs=55.622秒` 包括後續 browser 新 session 讀回，不能把它當作輸出 deadline 或 settlement duration。

原 first batch container `8c9fbcd06c78…` 及 follow-up `f8826d001494…` 的 exact-ID cleanup receipts 均確認不存在；最後交付前再唯讀核對。全部版本無 `approved_at`／`first_exported_at`，deliveries／delivery usage 均為 0。隔離容器已清理，正文／圖像保留作評核，不是 production 可開啟的草稿。

### 狀態與尚需驗收

- **已完成程式、unit、owned DB、Chromium browser 及上述真實 AI 隔離回歸。**
- **PENDING_USER：** 五份真人內容評核及完整真人 5 分鐘旅程；文件評分不會觸發 app approval。
- **NOT_RUN：** CI、hosted／production、真實新品牌 onboarding、真實 Google／OTP 正常與過期／重用／重發／限流、legacy magic link、Safari/WebKit、真手機。本輪沒有 auth 修改，舊 hosted 結果不算本輪新版本驗收。
- **未部署、未推送。** 任何正式資料、認證設定、外部服務或部署操作仍須另行批准。
