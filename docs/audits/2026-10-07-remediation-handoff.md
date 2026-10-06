# SMEAssistant 本地整改交付

所有未受阻的本地整改已實作及驗證，十四批本地 implementation／fixture commits 加最後 evidence-only 提交。必須 local gates 全部 exit 0；外部／hosted 前提仍未齊備，沒有本分支遠端 CI、production 部署或啟用。這份文件記錄實作，不代替原 implementation plan。

## 基準與界線

正確 repository 是 `YNWAforever/smeassistant`，audit/main/production alias 的已觀察 SHA 均為 `d1cbc7bd8a2bc7989c774d15001f7971274bed8d`。本地分支為 `codex/smeassistant-audit-remediation-20261007`；隔離工作樹位於 `C:/Users/laich/Documents/smescanner/.worktrees/smeassistant-audit-remediation`。原本 `smescanner` 是另一個有使用者修改的 repo，未作為本次程式碼來源，修改保留。

Handoff MANIFEST 6/6、原始 evidence MANIFEST 28/28 均相符；原始 ZIP／報告唯讀。計劃副本 SHA256 `4121B9FB00AA7CBA35F4E113ECD88CBE6B43082A143AFF756C534B7E19C16F55` 與附件一致。Lockfile SHA256 `C7C722C958A874DEEE76AB2B4FAAF654D985547A9D29EB256D8F6C9B848F63C6` 未改。Neon、pinned auth、合法 transitive auth-js 例外及既有 CI gates 保留。

沒有 git push、PR、部署、正式 migration、hosted 設定／旗標變更、付費 scan／LLM、真實寄信或外部發佈。DEC-10 cron 維持關閉；bulk flag 預設 off。所有 DB 寫入只在有 ownership guard 的隔離 fixture；沒有 ambient .env/provider key 帶入測試。

## 實作與證據

- A1：共用嚴格 slug parser，保留合法大小寫、`_`／`-` claim；no_access 有本人申請／工作台入口，沒有自動會員授予。
- A2：前後端共用 URL 驗證，invalid input 在 quota/job 前拒絕；collector outcome 與 stage 分開；未知／缺資料保持未量度，三語限制原因及下一步一致。
- B：優惠金額與 currency、完整起訖日期及年份分別檢查；88 個 HK/TW corpus fixtures，8 個無 production template 的 slots 明列 N/A。Provider retry 保留原有兩次及總 budget；沒有 live AI quality claim。
- C1：counts 依授權 scope／明確 filters 計算，獨立於 tab/cursor；真 DB 核對 IANA local month，包含 HK/TW/UTC/New York DST。
- C2：列表預設 25、上限 50，scope-bound keyset cursor，latest metadata projection；search／assignee／due filters 與 counts 共用 scope。批量只接受 assignee／due date，preview → fresh authorization/CAS → atomic update/audit，失敗項另重試。Apply 後刷新可見卡片／counts。
- D：dispatch 共用 55 秒工作及 5 秒收尾預算，涵蓋 headers/body/DB/pool wait；未嘗試 lease 可補償，未知 provider 結果保留 dedupe／lease recovery。Readiness 額外核對實際 first_published_at column，不能以 flags off 或 journal 存在冒充 schema 齊備。

大型列表 fixture：1,000 actions、每項 10 versions／5 runs，由 3 queries／16,000 rows／26,739,928 bytes 降至 2 queries／27 rows／22,589 bytes。這是本地 serialized-result 成本，非 hosted p95。新增 0015 的三個索引只在 disposable DB 套用；舊 migration 和 legacy catalog 保留。

詳細可讀證據：[progress](2026-10-07-remediation-progress.md)、[tracker](2026-10-07-remediation-tracker.csv)、[list benchmark](action-list-performance.md)、[assignment acceptance](action-assignment-acceptance.md)、[dispatch deadline](dispatch-deadline-verification.md)、[AI corpus](ai-quality-baseline.md)、[acceptance matrix](acceptance-matrix.md)。

## 分批本地 commits

每批理由、RED/GREEN command／exit code 及 F/T/UC 對應詳見 progress／tracker；下表是可反向回退的程式碼批次。所有提交都在本地。

| Commit | 內容 | 該批實際驗證 |
|---|---|---|
| c31a297 | T-03 共用 slug parser | 106 unit；typecheck/lint 0 |
| 5109ecf | T-18 本人申請狀態入口 | 35 unit／7 DB；lint 0；早期 browser setup timeout 留存 |
| 3ea795d | T-08/T-07/T-14 URL／outcome／三語原因 | 245 unit；typecheck/lint 0；DB 初期 timeout 後由完整 gate 解決 |
| 3902941 | T-06 currency／完整雙日期／年份 | 251 unit；typecheck/lint 0 |
| 4f64c9f | T-16 offline corpus／bounded provider recovery | 213 unit；typecheck/lint 0；沒有 live model |
| 0fc4eec | T-09/T-10 counts／IANA local month | 66 unit／23 DB；typecheck/lint 0 |
| 9ae5f12 | T-12 bounded projection／cursor／0015 indexes | 70 unit／6 DB＋10/100/1000 benchmark；typecheck/lint 0 |
| 8309f49 | T-13 gated scoped atomic assignment service/API | 30 unit／5 DB；typecheck/lint 0 |
| 01b1bdd | T-13 search/filter／explicit selection／preview | 67 unit／12 DB；typecheck/lint 0 |
| 13dc0fb | T-13/T-17 375px keyboard／scope acceptance | 2 Chromium／12 DB；frozen install 0 |
| 5a82d82 | T-11 shared deadline／body/DB cancellation／lease recovery | 187 unit／35 DB；typecheck/lint 0 |
| 05da46c | T-02/T-05/T-19/T-21 operations、T-15/T-20 matrix、T-17 field checklist | 唯讀 settings/roles；prepared JSON；lint/typecheck 0；沒有外部套用 |
| 76404c4 | T-13 refresh；T-19 column readiness/catalog；T-03/T-15/T-17/T-20 fixture follow-up | 14 selected unit／51 DB；完整 lint/type/unit/security/migration/integration/build 0；31 general E2E 0 |
| 6941ed7 | T-15 required-input fixture／201 create＋200 replay／UUID 和實際 assertion row | HK/TW 2/2 browser；fresh full lint/typecheck 0；完整 required acceptance 49/49 exit 0 |

產品程式驗證 commit：`76404c43458e3bf614bd2ac2329655e265c74f79`，tree `9cc29f67569b7be35849ffe78e21da382917733b`。最新 fixture commit：`6941ed7c24ab66593018ab40e3628d193056ed17`；與前者的非 docs 差異只有 merchant-loop acceptance fixture，application／unit／DB／build／general E2E sources 沒有變動。這批 fresh lint/typecheck 與 HK/TW 2-case browser 通過，再跑完整 required acceptance；沒有重跑無變動的 heavy gates。最後 evidence-only 提交只整理結果，不代表遠端 CI 或部署。

## 實際 gates

最終 ledger：`remediation-evidence/final-gates.jsonl`；每項包含 gate、exit code、時間及 log 路徑，command 是對應的 `pnpm <gate>`。[verification-summary.json](remediation-evidence/verification-summary.json) 記錄每個最後成功結果、command、source/fixture SHA、counts、歷史失敗的保存檔案，以及 remote CI／hosted 未執行界線。十一項 local gates 最後結果全部 exit 0，沒有 final failed／skipped tests。

- Frozen install exit 0；full lint exit 0（40 warnings）；root＋四 packages typecheck exit 0。
- Full unit：root 4,800 tests、packages 525 tests，exit 0。首次未完成的 run 保留為 interrupted；沒有將其列為 pass。
- Secret boundary 61 public artifacts、no-supabase、no-self-service-claim 各 exit 0。
- Disposable migrations 0001–0015、replay []、41 business tables／491 columns／204 constraints／111 indexes／8 triggers／23 functions，zero seeded rows，exit 0。
- Full integration 最後重跑：52 files／564 tests exit 0，沒有 skipped，包含新增的 readiness 缺 column regression。此前 2 個 journal-count 14→15 的期望失敗保留；readiness RED exit 1、三完整 integration files／51 tests GREEN exit 0。
- Build exit 0。一般 E2E 第一次在啟動健康檢查失敗，零 browser assertions：Next dev manifest 只有 `_not-found`。保存 log／manifest，核對本工作樹及 owned process 後只清除 `.next/dev` 產物快取；沒有改 auth、locale 或測試要求。重建路由後 31/31 通過，exit 0。
- Bulk refresh regression RED exit 1、selected 14 tests GREEN exit 0。卡片刷新／回應遺失 recovery、claim／resume／no_access cases 在完整 browser 已通過；merchant 新增 facts fixture 的首輪結果 47 passed／2 failed，保留 log／context／trace。補齊既有 template 的 persisted required list，並嚴格核對 applied 201 create／200 replay，同 UUID 對應真 DB row／單一 event；HK/TW targeted 2/2 pass。最後完整 required acceptance **49/49 passed，exit 0，10.1m**。
- 一個 corrected targeted HK 首次 detail request 404、TW pass；保存 server/context/trace，同程式在核對 cache target／owned process 後清除 `.next/dev`，2/2 再跑及完整 49/49 通過。沒有聲稱已修好 framework cold-start 根因。Command quoting exit 255 的零-test 嘗試也保留；不可計作 product regression 或 pass。

## 全部 21 項

原 audit_status 保留原文；T-14/T-18 的歷史「進行中」不代表本次成果。此表與 CSV 分開 implementation_status／hosted_status。

| 任務 | 本地結果 | Hosted／營運 |
|---|---|---|
| T-01 | 保留已結案 baseline：cron 已撤下 | 有意關閉，非維護啟用證據 |
| T-02 | auth/deadline/lease fixtures；activation／heartbeat／backlog／missing-tick 設計 | DEC-10 維持 off；待明確啟用前提 |
| T-03 | slug parser／unit/DB；精確 slug browser case 已通過 | 未 hosted 驗收 |
| T-04 | 保留同 audit SHA 的成功 CI 證據 | 不代表本分支新 CI |
| T-05 | 唯讀 gate/roles 證據及具體未套用提案完成 | gate gap；設定與 failed-candidate drill 受阻 |
| T-06 | currency／dates／years／visible warnings 完成 | Beta／flags 未變；未驗收 |
| T-07 | 真實 collector outcome／unknown 誠實顯示完成 | live scan 未跑 |
| T-08 | URL 前後端、真 DB 完成；早期 timeout 已解 | live scan 未跑 |
| T-09 | faithful mock＋真 DB counts scope 完成 | 未驗收 |
| T-10 | IANA local month＋DST 真 DB 完成 | 正式資料未讀 |
| T-11 | shared deadline／cancellation／lease recovery 完成 | cron off，未觀察 hosted ticks |
| T-12 | 有界列表／cursor／DB benchmark／新索引完成 | 0015 正式 journal／套用未做 |
| T-13 | scope/CAS/preview/partial retry；刷新／lost-response browser cases 已通過 | 新 bulk flag off，未啟用 |
| T-14 | 三語 limitation mapping 完成 | hosted 三語未驗收 |
| T-15 | composed fixture journey＋facts/resume/exact-version/applied 完成；49/49 | 專用身份／workspace／provider 前提不足；live collector journey 未跑 |
| T-16 | offline corpus 完成；live manifest 完成 | dataset／budget／model／reviewer 不足 |
| T-17 | action 375px／三語登入 375/1440／report keyboard/metrics 通過 | HK field 未執行 |
| T-18 | 本人狀態入口 unit＋DB；no_access browser 重跑已通過 | 無自動 membership；hosted 未驗收 |
| T-19 | migrations／measurement／readiness 正反 fixture 完成 | independent DB target／journal／privileges 未觀察 |
| T-20 | feature off/on／scope/quota/recovery fixture matrix 完成；unit＋DB＋49-case browser | 現有 flags 未變，hosted enablement 未驗收 |
| T-21 | 隔離 restore runbook／RTO-RPO 模板完成 | source／target／retention／授權不足；沒有 restore |

## 外部 blocker 與 rollback

T-05 已觀察 main protection 404、rulesets []、Vercel automatic custom-domain assignment true／checks empty；GitHub collaborator 及 Vercel team roles 已讀，effective promotion/bypass 與 integration token 權限仍未證實。請先審閱 [gate 提案與失敗演練](../operations/release-gates.md)，外部設定與 dedicated test-alias drill 需另外授權。

T-19 production DATABASE_URL 為 sensitive；未取得獨立 Neon project/branch/host/database binding、direct metadata 與 application-role readiness 存取。[migration checklist](../operations/migration-readiness.md) 已備妥，正式 journal／checksum／column／privileges 仍為未觀察，不能宣稱已套用。

T-15/T-20 hosted 需要專用 synthetic workspace、owner/scoped manager/viewer/nonmember、同 SHA 的部署／DB readiness、受准許 providers；任何 publish 要精確 version／target 授權。T-16 live 要 approved dataset/budget/model/pricing/quality thresholds/reviewer。T-17 需要實際 HK participants/devices/networks；沒有把 fixture timing 當 field 結果。

T-02 已唯讀核對 team 為 active Pro，建議五分鐘 cadence 符合當時平台規則；仍需要 DEC-10 決定變更、operating budget、owner/alert destination、T-19 和受控三次 ticks／missing-tick drill。[activation runbook](../operations/maintenance-activation.md) 未執行。T-21 需要 recovery point／retention 證據、全新明確 target、成本／restore／cleanup 授權及交接 owner；[restore runbook](../operations/restore-drill.md) 的 RTO/RPO 都未量度。

本地 rollback 使用各批次 `git revert <commit>`，按相依關係反向處理；不要 reset／清除使用者工作。程式回退不刪除合法 assignments 或 immutable versions。0015 indexes 可保留；任何移除都須新增 forward migration 及獨立授權，不能改舊 SQL/journal。維護或 publishing rollback 保留未知 provider receipt／delivery／completion ledger，先 reconcile，不能盲重送。由於沒有本次 production 變更，沒有宣稱已執行正式 rollback。
