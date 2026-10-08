# SMEAssistant 本地整改交付

所有未受阻的本地整改已實作及驗證。本分支共 20 個本地提交，包含原整改、一次獨立審閱的修復、evidence-only 紀錄、只讀 target／Auth metadata 及本整改分支的本地 Preview hold。最新程式／fixture SHA `efd51ca1a68ba9f9d3c56ea726b008b97d400328` 的十一項 local gates 全部 exit 0；之後的程式／fixture 未變，新增的分支部署配置另有 targeted 驗證。外部／hosted 前提仍未齊備，沒有本分支遠端 CI、production 部署或啟用。這份文件記錄實作，不代替原 implementation plan。

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

大型列表 fixture：1,000 actions、每項 10 versions／5 runs，由 3 queries／16,000 rows／26,739,928 bytes 降至 2 queries／27 rows／23,133 bytes（本輪加入 bounded accepted-member label 後）。這是本地 serialized-result 成本，非 hosted p95。新增 0015 的三個索引只在 disposable DB 套用；舊 migration 和 legacy catalog 保留。

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
| c58bc01 | 前一輪 evidence-only 交付 | 保存 76404c4／6941ed7 source binding、21 項狀態及未執行外部項 |
| efd51ca | T-06 括號年份；T-12 calendar cursor；T-13 指派名稱／三語 fallback／mobile | RED → targeted GREEN；126 selected unit、13 DB、3 browser；fresh 全部十一項 gate exit 0 |
| 1305565 | 最新 source 的完整 gates／review／21-task evidence-only 交付 | 5,352 unit／565 DB／31 E2E／49 acceptance；程式與 fixture 未變 |

接續的第 18 個提交 `1d28c8f` 只補 T-19/T-21 metadata 與相應文件。候選 Neon project/branch/host/database 及 6 小時 retention 已由只讀 API 核對，正式 DB binding 仍未確認，沒有 SQL 或 restore。第 19 個提交再補 Auth configuration association；SHA 以本地 HEAD／聊天交付為準，程式與 fixture 未變。

第 20 個提交為 T-05/F-03/UC-13 的本地 publication guard：在 `vercel.json` 原有 branch map 只加入 `codex/smeassistant-audit-remediation-20261007: false`，原有兩個 hold 保留。RED 確認未有此 hold（exit 1），GREEN 用官方 self-contained `deploymentEnabled` schema 驗證 branch map／wrong-type negative control、核對只新增一個 key、其餘程式／fixture／lockfile／CI／migration／flags 與 `efd51ca` 相同（exit 0）。[可讀證據](remediation-evidence/T05-branch-preview-hold.json) 記錄 command、schema checksum、工具限制及 rollback；完整 Draft-04 root 未編譯，沒有把 property 檢查說成整份 schema 驗證。`main` 保持未列出／平台預設，cron 仍沒有配置。這是尚未 push 的本地 hold；正式 gate gap／外部 failed-candidate drill 未解，沒有 hosted 停用部署的直接觀察，沒有為此配置重跑未變的 application heavy gates。

最新完整驗證的產品程式和 fixture 都是 `efd51ca1a68ba9f9d3c56ea726b008b97d400328`，tree `6650a61c31826d044d0f9fe572b031aa031220a8`。本輪只有一位 fresh-context 唯讀 reviewer；兩項 Important/P2 及使用者 scope 內的 cursor P3 均先 RED，再做同一輪最小修復。沒有 Critical、declined-to-judge 或留下的本地 review 缺陷；沒有第二輪 reviewer。[獨立審閱](final-independent-review.md) 與 [targeted commands](remediation-evidence/final-review-targeted-commands.json) 記錄 provenance、severity ruling、真函式／DB／browser 驗證及 rollback。

之前 `76404c4` 的 application、`6941ed7` 的 fixture 完整驗證仍保留為歷史紀錄；它們不代替本輪 source 的驗證。最後 evidence-only 提交只整理 docs/logs/tracker；最新交付 SHA 隨聊天交付，亦可在此本地分支以 `git rev-parse HEAD` 取得。所有提交均未 push。

## 實際 gates

本輪 [final-review-gates.jsonl](remediation-evidence/final-review-gates.jsonl) 按 CI 順序記錄全部十一項 command／exit code／時間／log，全部綁定 `efd51ca`；重型 gate 沒有併發。[verification-summary.json](remediation-evidence/verification-summary.json) 是最新完整結果；[pre-review summary](remediation-evidence/pre-review-verification-summary.json)、原 `final-gates.jsonl` 和舊 raw logs 是保留的歷史證據。每項 command 是對應的 `pnpm <gate>`，全部 exit 0，沒有 final failed／skipped tests。

| Gate | 實際結果 |
|---|---|
| lint | exit 0，0 errors／40 warnings |
| typecheck | root＋四 packages，exit 0 |
| unit | root 4,765＋safe-media 62；四 packages 23＋183＋20＋299；合共 **5,352 passed** |
| secret boundary | 61 public artifacts，exit 0 |
| no-supabase | exit 0，既有 pinned auth-js 例外保留 |
| no-self-service-claim | exit 0 |
| disposable DB verification | 0001–0015；replay []；41 tables／491 columns／204 constraints／111 indexes／8 triggers／23 functions；zero seeded rows，exit 0 |
| integration | **52 files／565 passed**，exit 0，no skips |
| build | exit 0 |
| general E2E | **31/31 passed**，exit 0 |
| required acceptance | **49/49 passed**，exit 0 |

新 regression 覆蓋括號年份與 cross-year、真正 list 函式／三語 assigned fallback、pending／foreign／revoked membership label、scope-matching impossible cursor，以及實際 named assignment apply → refresh → filter → DB audit／375px overflow。Counts、IANA month、exact-version approval、CAS、unknown-result recovery 與既有 security gates 仍通過。這些是本地合成／隔離測試，不是 hosted journey 或 production 部署。

本輪最初完整 unit 程序中斷，未有完成 footer／exit code；[interrupted metadata](remediation-evidence/final-review-interrupted-attempt.json) 和獨立 raw log 保留，沒有算作 pass。確認無 owned runner 後由同一 SHA 接續重跑 unit 和剩餘 gates。首次 fresh DB verification 因本地 Docker daemon 未運行而在 fixture 建立前退出 1；原 log 保留，恢復同一 engine／cached image 後用新的 retry log 接續，沒有改 migration 或測試要求。Targeted DB setup timeout 在 assertions 前中止；首個 GREEN fixture 嘗試保留了 `owner_removal_forbidden`，只修正可移除的 synthetic member role，實際 guard 未改。之前 cold-start／junction／fixture／command quoting 的失敗及 traces 亦全部保留；沒有聲稱 framework cold-start 根因已修好。

首次本輪 required acceptance 為 **48 passed／1 failed**，unavailable LLM case 的本地 `/run` request 在收到 HTTP 回應前 `ECONNRESET`；server log 沒有該 request 的完成紀錄。[failure metadata](remediation-evidence/final-review-acceptance-econnreset.json)、server log、context 和 trace 均保留。原因未確證；既有 CI diagnostics 亦記錄過相同 symptom，但不能據此判定原因。原 source／原 assertion 的 isolated case 1/1 passed（37.6 秒）後，完整 49-case 重跑通過。沒有增加 request retry、改 assertion、改 server/transport/config/source 或跳過 case；**不宣稱 reset 根因已修復**。這是交付的驗證限制，並非另一個已修好的 production bug。

## 全部 21 項

原 audit_status 保留原文；T-14/T-18 的歷史「進行中」不代表本次成果。此表與 CSV 分開 implementation_status／hosted_status。

| 任務 | 本地結果 | Hosted／營運 |
|---|---|---|
| T-01 | 保留已結案 baseline：cron 已撤下 | 有意關閉，非維護啟用證據 |
| T-02 | auth/deadline/lease fixtures；activation／heartbeat／backlog／missing-tick 設計 | DEC-10 維持 off；待明確啟用前提 |
| T-03 | slug parser／unit/DB；精確 slug browser case 已通過 | 未 hosted 驗收 |
| T-04 | 保留同 audit SHA 的成功 CI 證據 | 不代表本分支新 CI |
| T-05 | 唯讀 gate/roles 證據、具體提案及本整改分支 local Preview hold 完成 | 正式 gate gap；設定與 failed-candidate drill 受阻；hold 未 hosted 驗證 |
| T-06 | currency／dates／years／visible warnings；括號年份 regression 完成 | Beta／flags 未變；未驗收 |
| T-07 | 真實 collector outcome／unknown 誠實顯示完成 | live scan 未跑 |
| T-08 | URL 前後端、真 DB 完成；早期 timeout 已解 | live scan 未跑 |
| T-09 | faithful mock＋真 DB counts scope 完成 | 未驗收 |
| T-10 | IANA local month＋DST 真 DB 完成 | 正式資料未讀 |
| T-11 | shared deadline／cancellation／lease recovery 完成 | cron off，未觀察 hosted ticks |
| T-12 | 有界列表／calendar cursor／DB benchmark／0015；本輪沒有新 migration | 0015 正式 journal／套用未做 |
| T-13 | scope/CAS/preview/partial retry；指派名稱／refresh/filter／lost-response browser 通過 | 新 bulk flag off，未啟用 |
| T-14 | 三語 limitation mapping 完成 | hosted 三語未驗收 |
| T-15 | composed fixture journey＋facts/resume/exact-version/applied 完成；49/49 | 專用身份／workspace／provider 前提不足；live collector journey 未跑 |
| T-16 | offline corpus 完成；live manifest 完成 | dataset／budget／model／reviewer 不足 |
| T-17 | action 375px／三語登入 375/1440／report keyboard/metrics 通過 | HK field 未執行 |
| T-18 | 本人狀態入口 unit＋DB；no_access browser 重跑已通過 | 無自動 membership；hosted 未驗收 |
| T-19 | migrations／measurement／readiness 正反 fixture；候選 Neon target metadata 完成 | 正式 deployment→DB binding 未確認；journal／privileges 未觀察 |
| T-20 | feature off/on／scope/quota/recovery fixture matrix 完成；unit＋DB＋49-case browser | 現有 flags 未變，hosted enablement 未驗收 |
| T-21 | 隔離 restore runbook／模板；候選 retention 6 小時／snapshot list 0 | production source binding／可用 recovery point／新 target／授權不足；沒有 restore |

## 外部 blocker 與 rollback

T-05 已觀察 main protection 404、rulesets []、Vercel automatic custom-domain assignment true／checks empty；GitHub collaborator 及 Vercel team roles 已讀，effective promotion/bypass 與 integration token 權限仍未證實。請先審閱 [gate 提案與失敗演練](../operations/release-gates.md)，外部設定與 dedicated test-alias drill 需另外授權。

本整改分支的本地 hold 依 [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration) 使用 exact branch false；未列出的分支維持平台預設。擬議 Draft PR 保留 GitHub pull-request CI，Preview 與 production 發佈另待明確授權。回退此 hold commit 會移除此分支抑制配置；若仍未獲部署授權，任何後續推送前須重新保留 hold。沒有更改 hosted project 設定、alias 或正式資料。

T-19 production DATABASE_URL 為 sensitive。2026-10-07 12:12 UTC 的只讀 continuation 已取得候選 project `morning-hill-92255530`／production branch `br-wandering-field-azdc91yj`／host `ep-tiny-forest-azzm8bni.c-3.ap-southeast-1.aws.neon.tech`／database `neondb`；它與 Vercel production DATABASE_URL 的獨立 binding 仍未確認。Connector env-list 403、connector-project 404；既有 CLI 成功取得 decrypt=false metadata，沒有取得 DB URL 值。仍需確認上述 binding 及配置好的 application-role／獨立只讀存取位置；不要求貼密碼或連線字串。[migration checklist](../operations/migration-readiness.md) 與 [metadata evidence](remediation-evidence/T19-T21-continuation-target-metadata.json) 已備妥，沒有向候選 DB 發 SQL，正式 journal／checksum／column／privileges 仍為未觀察，不能宣稱已套用。

2026-10-07 12:53 UTC 再確認 project 目前 production-scoped Auth 配置與候選 Neon Better Auth endpoint／database path 相符；[Auth evidence](remediation-evidence/T19-auth-association.json) 只記錄 hostname／比對結果。這不證明 deployed frozen environment、DATABASE_URL binding、application DB role 或 hosted 登入。正確 repo／worktree 的標準 .env/context 檔及 process DB/readiness inputs 均不存在，不能自行取得缺少的 runtime connection。正式 alias 的最新只讀回覆仍為 audit SHA；T-19 資料問題待回覆。

T-15/T-20 hosted 需要專用 synthetic workspace、owner/scoped manager/viewer/nonmember、同 SHA 的部署／DB readiness、受准許 providers；任何 publish 要精確 version／target 授權。T-16 live 要 approved dataset/budget/model/pricing/quality thresholds/reviewer。T-17 需要實際 HK participants/devices/networks；沒有把 fixture timing 當 field 結果。

T-02 已唯讀核對 team 為 active Pro，建議五分鐘 cadence 符合當時平台規則；仍需要 DEC-10 決定變更、operating budget、owner/alert destination、T-19 和受控三次 ticks／missing-tick drill。[activation runbook](../operations/maintenance-activation.md) 未執行。T-21 候選 project 的 history retention 設定為 6 小時，完整 snapshot list 回覆 0；這不證明 backup 缺失、可用 recovery point 或 restore 成功。仍需要正式 source binding、當下可用 point／expiry、全新明確 target、成本／restore／cleanup 授權及交接 owner；[restore runbook](../operations/restore-drill.md) 的 RTO/RPO 都未量度。

本輪三項 review 修復可先 `git revert efd51ca1a68ba9f9d3c56ea726b008b97d400328`；這不做 schema/data/flag/provider mutation。本地 rollback 使用各批次 `git revert <commit>`，按相依關係反向處理；不要 reset／清除使用者工作。程式回退不刪除合法 assignments 或 immutable versions。0015 indexes 可保留；任何移除都須新增 forward migration 及獨立授權，不能改舊 SQL/journal。維護或 publishing rollback 保留未知 provider receipt／delivery／completion ledger，先 reconcile，不能盲重送。由於沒有本次 production 變更，沒有宣稱已執行正式 rollback。
