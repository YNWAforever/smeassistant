# SMEAssistant 重新稽核及修復報告（2026-10-09）

**結論先行。** production（`d1cbc7b`，2026-10-06 部署）仍然是舊稽核版本；Codex 已在 main 修好 T-03～T-18 的程式碼（PR #44，CI 通過），但 main 被 `vercel.json` 刻意停止自動部署，所以**沒有一項 2026-10-07 稽核修復已上線**。今次獨立重驗了這些修復，再新增四項修復（F-13～F-16）。最嚴重的新發現是 **F-16：production 唯一可見的店主工作台首頁自 2026-10-02 起每次打開都失敗**，根因需要正式資料庫唯讀存取才能確認；單靠部署 main 不一定能修好。

狀態用語：**code fixed**（程式已改）→ **local verified**（本地合成／隔離 DB 測試通過）→ **CI verified**（GitHub Actions 同 SHA 通過）→ **hosted verified**（正式站同版本驗收）→ **deployed**（正式 alias 指向該 SHA）。本報告不把較低層級當作較高層級。

## 1. 基準

| 項目 | 值 | 來源 |
|---|---|---|
| 日期 | 2026-10-09（Asia/Hong_Kong） | 本機時鐘 |
| 歷史稽核基準 | `d1cbc7bd8a2bc7989c774d15001f7971274bed8d` | 附件 E19 |
| production alias | `smeassistant.vercel.app` → `dpl_ARepQExFa36hUt1PzYcCzW4ECzCE` → **`d1cbc7b`** | Vercel list_deployments（只讀） |
| origin/main | **`cb0b546`**（PR #43、#44 已合併；比基準多 31 commits） | `git fetch` |
| main CI | run 37822055638 @ `cb0b546`：success | `gh run list` |
| main 自動部署 | 停用：`vercel.json` `git.deploymentEnabled.main=false`（`6bc3b0f`、`ced4028`） | repo |
| 本次分支 | `claude/audit-fix-20261009`（worktree `.claude/worktrees/audit-fix-1009`），基於 `cb0b546` | 本地，**未推送** |
| 本次最終程式 SHA | `1bbb69d`（之後只加文件） | `git log` |

附件：稽核 ZIP（28 檔，已讀）、Codex handoff ZIP（計劃、tracker、kickoff，已讀）。CLAUDE.md Part A 及頂部 Neon 運作契約已讀。

## 2. 方法

1. 用原 E32 反例腳本（改為呼叫目前的真函式，`evidence/E32-rerun.mjs`）重跑 slug、優惠、進度三組反例。
2. 逐段讀碼核對 Codex 的修復（slug、URL、進度、優惠、tabs、月份、有界列表、批量分派、dispatch deadline、本人申請入口），並檢查 T-09／T-10 是否有真 DB 對照（有：`test/integration/neon-workspace-read.integration.test.ts`）。
3. 以「重送／雙擊／斷線／並發」角度追蹤 UI → API → service → DB：掃描開始、重掃、AI 生成、核准、匯出、標記 applied、認領。
4. 只讀查詢 production：Vercel runtime errors（7 日）、runtime logs、request logs（含 HTTP status）。沒有登入、沒有寫入、沒有讀 env 值。
5. 每個新缺陷先寫失敗的 regression（RED），再做最小修復（GREEN），最後按 CI 次序跑完整 gates。

## 3. 新發現及修復

### F-13（P2）掃描開始與重掃重送時重建 scan、重複付費

- **Before：** server 先寫入 job 才回覆。回覆遺失後重按、雙擊、或返回再提交，都會建立第二個付費 scan；重掃同理（只靠每日 3 次上限）。RED：真 route＋Postgres 下重送得到新 job；5 個並發 → 5 個 job；同一 key 換店名仍 200；3 個並發重掃 → 3 個 job（`evidence/F13-red.txt`）。
- **根因：** `/api/scan/start` 沒有 idempotency；重掃沒有「同一地點進行中」檢查。
- **修改（`e9a6f9b`）：** client 每次提交帶 `submission_key`（同一 payload 重試沿用；sessionStorage 30 分鐘，不可用時用記憶體）。server 用 advisory lock 串行同一 key，在扣 budget 之前回傳已存在的 job（不再寫第二個 `scan_started`），並把 key 記在該 job 的 `scan.queued` audit event（沿用既有 `audit_events.idempotency_key` unique index，**不需要 migration**）。同一 key 用於不同內容 → 409 `submission_key_conflict`，不寫入。重掃：同地點仍在排隊／進行（未 dead-letter）就回傳該 job，先於每日 limiter 檢查一次、insert transaction 內再原子檢查一次。PR 審閱後（Codex review）去掉了原本的 30 分鐘上限：lease 會執行任何排隊中的 job，不論多舊，所以舊的排隊 job 也要沿用，只有 dead-letter 後才可再排。
- **After：** 見 OP-R03～R08、R12～R15，全部 pass（integration＋component＋unit）。
- **Rollback：** `git revert e9a6f9b`；沒有資料或 schema 變更。舊 client（沒有 key）照舊可用。

### F-14（P2）同一行動重按「生成」會再次呼叫付費模型

- **Before：** `action_runs` 沒有進行中檢查；雙擊或回覆遺失後重按會再跑一次模型及多寫一版草稿。RED：queued／running 時再按仍 200 並呼叫模型；兩個並發都進入模型（`evidence/F14-red.txt`）。
- **修改（`9677918`，`1bbb69d` 調整 import）：** `queue()` 在既有 action row lock 下檢查 3 分鐘內（與 reaper 相同門檻）是否已有 queued／running run，有就拋 `ActionRunInFlightError` → route 回 409 `run_in_progress`，不呼叫模型、不寫 run。行動頁及「建立」頁以三語說明「沒有重新開始，亦沒有額外收費」。
- **After：** OP-D01～D04 pass（真 route＋Postgres）。超過 3 分鐘的卡住 run 不會阻擋重新生成。
- **Rollback：** `git revert 9677918 1bbb69d`。

### F-15（P3）沒有填 IG 時，進度頁顯示「等候收集結果」直到完成

- **Before：** engine 只按開始時的 handle 讀 IG（否則記 `IG_HANDLE_NOT_PROVIDED`），但掃描中 IG 卡顯示「等候收集結果」，完成後顯示籠統的「未能取得」。
- **修改（`db7f844`）：** status API 回傳 `notProvided`（由 `audit_jobs.ig_handle` 判斷），進度卡由第一次 poll 起顯示「未提供」，但永不覆蓋已有證據的 measured／failed；server 的 `moduleStates` 維持 scorer 原值。
- **Rollback：** `git revert db7f844`。

### F-16（P1，production 現況）店主工作台首頁讀取 actions 失敗

- **證據（只讀）：** Vercel runtime errors：`Error: actions lookup failed`，count=10、users=3，路由 `/[locale]/owner/[workspaceSlug]` 及 `/calendar`，首次 2026-10-02T14:48:22Z，最近 2026-10-08T16:11:15Z。2026-10-02 14:48–14:49 UTC 連續 5 次打開 `/zh-HK/owner/nadagogo` 全部失敗；request logs 顯示 500 ×3（10-02～10-03），之後在 200 回應中由 error boundary 顯示錯誤（10-08）。logs 中只見這一個工作台，**所有可見的 owner 首頁訪問自 10-02 起都失敗**（`evidence/F16-red.txt`）。
- **時間關聯：** PR #28（P4.1 offers）2026-10-02T11:57Z 合併，令 actions 查詢加入 `offer_id`（migration 0011）。首次失敗是該次合併後第一個 production deployment。
- **根因：** **未證實。** wrapper 丟棄了 driver error，logs 沒有 SQLSTATE。最可能是部署所讀的資料庫缺少 0011 欄位（T-19 早已指出 production DATABASE_URL 與已套用 migration 的 Neon branch 綁定未確認），其次是權限或 timeout。
- **今次修改（`1bbb69d`）：** (1) `read()` 失敗時只記錄 SQLSTATE（不記 message／SQL）；PR 審閱指出 `workspaceReadRepository` 的 `rows()` 會丟掉 driver error 的 code，已改為保留 code，並以真 DB 測試證明缺欄位時 log 為 `42703`；(2) `pnpm neon:readiness` 核對 application schema 宣告的**每一欄**，不再只核對 journal 及 `first_published_at`（RED：改名 `actions.offer_id` 後 readiness 仍說 READY；GREEN 後 not_ready）。
- **仍需：** 用唯讀身份對部署實際指向的資料庫跑 `pnpm neon:readiness`（見 §8）。若缺欄位，需另行授權按 `docs/implementation/owner-platform-v1/rollout/apply-0011.sql` 程序補套。**在確認前，部署 main 不保證修好首頁**，因為 main 同樣讀 `offer_id`。

### F-17（觀察，不改）候選商戶網址無效時阻擋第 3 步

`resolveScanWebsite` 在店主沒填網址時會驗證候選商戶的網址，無效就阻擋（Codex 的測試刻意如此）。候選網址在來源已用相近規則清洗，只有罕見格式（例如路徑含空格）會觸發。保留現有已測行為，列作觀察。

### F-18（觀察，P3）助理「起草」重按會再呼叫模型

`lib/assistant/live.ts` 先呼叫模型才記錄 run，沒有進行中檢查。功能由 `CONTEXTUAL_ASSISTANT_ENABLED` 控制（預設 off），另有 rate limit 及 AI 預算上限。啟用前應比照 F-14 處理。

## 4. Codex 修復的獨立重驗（T-03～T-18）

| 任務 | 重驗方式 | 結果 |
|---|---|---|
| T-03 slug | E32 重跑：`3cuOKFmHdiYf00BOs27E_NO1` 接受；`/`、65 字元、`%2F` 拒絕；`returnTo` 只作解碼檢查不改原值 | code＋local verified；CI verified（cb0b546）；**未部署** |
| T-06 優惠 | E32 擴展：NT$／US$ 錯幣、漏起日、漏迄日、錯年 → warning；HK$88、HKD 88、NT$1,280、中文／斜線／英文日期 → 通過；`$88`、`1,280元` → 「不明確」warning（locale 不作幣種證據） | 同上；`OFFER_PROMOTIONS_ENABLED` 預設 off |
| T-07 進度 | E32：`collecting_aeo` 時 IG 不再 `done`；F-15 再補「未提供」 | 同上 |
| T-08 URL | 讀碼：前後端共用 helper；credentials、非 http(s)、>2048 在扣額及建 job 前 400 | 同上 |
| T-09／T-10 | 真 DB integration 存在（tab counts 不隨 tab 改變；HK／TW 00:00、00:15、07:59、08:00、DST、通知去重） | 同上 |
| T-11 deadline | 讀碼：55 秒工作＋5 秒收尾、AbortSignal 傳到 request／body、budget pool statement_timeout | 同上；cron 關閉，hosted 無法觀察 |
| T-12／T-13 | 讀碼：每頁 25／上限 50、keyset cursor、批量只限 assignee／due，每項在 transaction 內重驗權限／scope／CAS | 同上；`ACTION_BULK_ASSIGN_ENABLED` 預設 off |
| T-18 | 讀碼：`latestForUser` 以 `user_id` 限定，不建立 membership | 同上 |

沒有發現需要倒退的 Codex 修改。

## 5. AI 工具清單（目前 registry）

12 個 agent：**Live 7**（review_reply、review_request、social_post、faq_jsonld、ig_bio、website_basics、validation_plan）；**Beta 5**（gbp_post、photo_brief、local_seo_brief、menu_translation、promotion_copy；promotion_copy 另需 `OFFER_PROMOTIONS_ENABLED=true`）。其他 AI 面：情境助理（`CONTEXTUAL_ASSISTANT_ENABLED`）、未儲存預覽（`PREVIEW_DRAFT_ENABLED`）、GBP 回覆發佈（`GBP_REPLY_PUBLISH_ENABLED`，另需 Google 連接）。所有旗標只接受精確字串 `true`；production 實值未讀（不讀 secret）。

共通控制：evidence 以 JSON 放入「UNTRUSTED EVIDENCE」區塊並註明是資料不是指令；agent 沒有工具；輸出經 zod schema、禁用字、連結、優惠檢查；每次輸出都要人手核准指定版本；失敗／timeout 不扣用量。離線 corpus：88 個 HK／TW 案例（normal／missing-data／adversarial／recovery）。**沒有執行真模型評測**（DEC-04 預算／dataset 未批准），所以不報任何品質分數。

## 6. 驗證結果（同一 SHA）

`evidence/gates/gates.jsonl` 按 CI 次序記錄每項 command、exit code、時間及 log；以下為 `1bbb69d` 的結果（第一次在 `db7f844` 的嘗試因中途改碼而中止，保存在 `evidence/gates-attempt1-db7f844-aborted/`，不計入）。

| Gate（CI 次序） | exit | 結果 | 時間 |
|---|---|---|---|
| `pnpm lint` | 0 | 0 errors | 47 s |
| `pnpm typecheck` | 0 | root＋四個 packages | 18 s |
| `pnpm test` | **1** | **4,815 passed / 2 failed**：`tests/scan-claim-single-path.test.ts`、`tests/scan-events-single-writer.test.ts` 在全套負載下超過 5 秒 timeout（兩次 retry 都超時）；同 SHA 單獨重跑 3/3 通過（各 < 1 秒，`gates/unit-timeout-isolated-rerun.txt`）。屬 Windows 負載 flake，**不算 pass、亦未修改**；需 CI（Linux）確認 | 122 s |
| `pnpm test:secret-boundary` | 0 | | 64 s |
| `pnpm test:no-supabase` | 0 | 既有 pinned auth-js 例外保留 | 2 s |
| `pnpm test:no-self-service-claim` | 0 | | 0 s |
| `pnpm db:verify` | 0 | 0001–0015 於 disposable PostgreSQL | 11 s |
| `pnpm test:integration` | 0 | **53 files / 578 passed**（Codex 交付時 52／565；新增 13） | 489 s |
| `pnpm build` | 0 | | 51 s |
| `pnpm e2e` | 0 | **31 passed** | 71 s |
| `pnpm e2e:acceptance` | 0 | **52 passed**（required merchant acceptance；Codex 時 49） | 488 s |

這是 **local verified**，不是 CI verified：本分支未推送，GitHub Actions 未跑。

## 7. 原 21 項及新項目狀態

見 `tracker-2026-10-09.csv`（實作、本地證據、CI、hosted、部署分欄）。摘要：

- **code fixed＋CI verified（未部署）：** T-03、T-06～T-14、T-18。
- **code fixed＋local verified（未推送、未 CI、未部署）：** T-22（F-13）、T-23（F-14）、T-24（F-15）、T-25 部分（F-16 的可觀察性／readiness）。
- **只有 fixture／離線證據：** T-15、T-16、T-17、T-20。
- **只準備好 runbook：** T-02、T-05、T-19、T-21。
- **基準已結案：** T-01、T-04。
- **hosted verified：0 項。deployed（本次或 Codex 修復）：0 項。**

操作清單 `operation-inventory.csv`：37 項；pass 32（每項註明證據層：pure function／unit／component／integration／code read）、fail 1（OP-D09 production 首頁）、blocked 3、not-applicable 1。blocked 不算 pass。

## 8. 待批准動作及最少步驟

1. **F-16 唯讀診斷（最優先）：** 由 Willy 在已登入的 Neon／Vercel 環境，用唯讀身份對 production 部署實際使用的 DB 跑 `corepack pnpm neon:readiness`（需 `NEON_READINESS_HOST`、`NEON_READINESS_DATABASE` 及 secret manager 提供的連線；見 `docs/operations/migration-readiness.md`）。只回報 JSON 的 `status` 及 `category`，不要貼連線字串。
2. **若 readiness 指出缺 0011 欄位：** 另行授權按 rollout 檔補套（正式 migration，不在本次授權內）。
3. **推送本分支及開 PR：** 需要明確同意（未做）。
4. **部署：** main 被 `vercel.json` hold；解除 hold 或手動 promote 需要授權，並應在 F-16 診斷之後。0015 只是 index，程式不依賴，可之後再套。
5. **hosted 驗收：** 需要專用 owner／scoped manager／viewer／陌生身份及測試 workspace（T-15、T-20、UC-12、UC-22）。
6. **真模型評測（DEC-04）、HK 實機量測（T-17）、備份還原演練（T-21）、cron 決定（DEC-10）：** 維持 blocked。

## 9. Release 及 rollback

- 本分支 commits：`9677918`（F-14）、`e9a6f9b`（F-13）、`db7f844`（F-15）、`1bbb69d`（F-16＋import 修正）及文件 commit。全部可逐一 `git revert`，沒有 migration、沒有資料改寫。
- 新 API 回應均為加法（`replayed`、`existing`、`notProvided`、409 `run_in_progress`／`submission_key_conflict`），舊 client 不受影響。
- 部署後 rollback：Vercel promote 上一個 READY deployment（`dpl_ARepQExFa36hUt1PzYcCzW4ECzCE`），不碰資料。

## 10. 限制

- 沒有 production DB 存取，F-16 根因未證實。
- 沒有登入身份，所有 hosted 流程（註冊、認領、onboarding、每日工作）未在正式站驗收。
- 沒有付費 scan、真模型、寄信或外部發佈。
- 本地 gates 在 Windows 跑；兩個掃描整個 repo 的測試在全套負載下偶爾超過 5 秒（見 §6）。
