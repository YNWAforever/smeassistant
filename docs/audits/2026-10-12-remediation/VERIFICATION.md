# 驗證紀錄 — 2026-10-12

已完整驗證的 runtime/test source SHA 是 `6ac091365fe5cf0aa9be1fd658b7a1ca72ce22f1`。`COMMITS.csv`列20個本地implementation/tool commits；最後只提交audit文件的commit另由Git及交付訊息識別，不能冒認gate曾在該documentation SHA執行。`SOURCE_BINDING.json`保存runtime/test/config Git object及evidence工具bytes hashes，供核對兩者等價。所有新測試均本地 fixture；SQL 使用 owned Docker PostgreSQL，network guard拒絕外網，E2E使用loopback Auth／LLM／mail transport，拒絕ambient `.env*`。沒有執行 `e2e:live`、`e2e:neon-auth`或收費 `eval:workflows` CLI。後者須EVAL_LIVE及budget，是paid evaluation，不能誤當本地fixture命令。

每個gate的命令、exit、環境及證據見 `GATES.csv`。首輪完整unit發現15個fixture／歷史packet相容失敗，原log保留。已修正：schema fixture新增0016資料；歷史reown仍只比對0001–0015 checksum；offline生成missing-column SQL；品牌按鈕文案；no_model_output僅一次，而transient network recovery仍兩次。229項focused回歸通過。不得把中斷或失敗的初次run合計為pass。

## 新增反例及SQL

| 任務 | 可查證行為 | 本地證據 |
|---|---|---|
| T19 | 未配置零fetch，401/403不重試，429/5xx分類、body deadline、blank/schema區分、unknown usage | T19-llm-red/green及run red/green、`lib/llm-outcome.test.ts` |
| T02 | known identity/membership依賴503 no-store；401/403/404保留，零模型／write，程式bug不吞 | 原ZIP兩份outage反例及route regression |
| T22 | user＋report SQL join；A較新不遮B較舊；pending/approved/rejected/closed、另一user、不重建申請 | onboarding反例；`neon-assisted-assignment.integration.test.ts`10項 |
| T01 | 真action row lock先於LLM，雙assistant及ordinary競爭最多1call；settlement/reaper/revoked fencing、不自動version；deadline耗完不呼叫 | T01 red/unit/SQL logs；`neon-artifact-runtime`、`neon-assistant-live` |
| T03/T09 | recovery429/網絡失敗保留email及alert；app-session switch保留claim/returnTo，明確Google手動選帳戶／email替代 | recovery反例及sign-in/action tests；Google原生chooser能力未由hosted驗證 |
| T11/T12/T13 | fact分類保留；SQL先scope再group模板，26/50/51、1000筆仍有界；secondary cadence保留店 | B3-unit／B4-sql；maintenance反例及pagination SQL |
| T04/T14/T20 | 三語taxonomy、0–4 finding不固定三項、free目前價格0與upgrade價格分開、market不變 | B5-related-unit／report／billing tests |
| T21 | 0016已知baseline、CAS競爭、不可變history及runtime權限、save失敗rollback；0017捕捉兩個migration之間及legacy claim写入、新workspace生成snapshot；prompt/run讀同revision；可讀舊revision內容 | T21-red／B4-sql；capture反例3 RED→3 GREEN，81個schema/readiness cases及35個binding/capture cases；0016 checksum不變 |
| T16 | browser headers/body30秒有界、取消可分類；manual/skip既有流程回歸 | bounded-request與scan-page/ig-search tests；未確認歷史Nadagogo provider timeout root cause |
| T17 | 單一asset錯誤最多一次自動重簽；document開啟時授權，owned成功及foreign拒絕；60秒不擴大 | AssetPreview/preview-route tests；尚無真storage延遲瀏覽fixture，audit原n=0保留 |
| T07 | 唯讀Vercel cron definitions=[]、manual保留；dispatch auth/lease/deadline/mail fixtures | T07 metadata、完整unit/SQL；不代表正式tick或告警成功 |

T14最初RED檔有重複import造成parse failure，這不是有效行為RED。已補用baseline ca9ecb34的 `copy.ts` 投射同一測試（finally還原候選精確bytes）：5項assertion RED，修復5項 GREEN，見 `T14-baseline-red.log`／`T14-title-green.log`；36項非目標skip不計pass。T04/T20同批其餘assertion失敗及後續GREEN另列。T16最初新增API未存在造成module failure；只聲稱後續deadline行為fixture已驗證，未冒認供應商根因。

## 十頁 controls

此表列相關本地證據入口；正式候選未部署，所有hosted controls均 **not-tested**。頁面可開不等於完成操作；既有 UC25/30 的後段owner成功登入／十頁可讀不被早段 UC05/16 blocked覆蓋。

| 頁面 | Controls及核對重點 | 本地fixture入口 | hosted |
|---|---|---|---|
| actions | search/filter、頁面/跨頁選取、preview/apply、補facts、分派、approval/export、response丟失對帳 | action-list-remediation、merchant-loop、permissions、bulk/action SQL | not-tested |
| create | owner objective、Recommended/Observed、模板推薦完整及scope、單筆/批量preview與失敗重試 | maintenance反例、create unit、action-list SQL、workflow corpus | not-tested |
| insights | secondary/all scope、comparable coverage、applied/rescan/measurement、禁止因果宣稱 | measurement/scan integration、workspace queries、merchant-loop | not-tested |
| assets | upload、rights、lazy image、on-demand document、到期重簽、owner/manager/viewer scope | assets routes、preview route/component、rights SQL | not-tested |
| calendar | cadence、manual notify、due scope、secondary成效link | calendar unit、maintenance/dispatch/lease fixtures | not-tested |
| activity | actor、workspace timezone、entity link、真run/version終態、未知cost | activity unit、artifact runtime/assistant SQL | not-tested |
| brand | save/reload、current revision、history內容、CAS409保留輸入、only owner edit | brand unit、phase6 UI、brand revisions SQL | not-tested |
| integrations | connect/disconnect、OAuth取消/expiry/revocation、缺credentials如實 | integration route/OAuth unit fixtures；原生OAuth未測 | not-tested |
| team | invite/accept/expired、role/location scope、revoked、禁止remove owner | membership/invitation SQL、permissions acceptance | not-tested |
| billing | free/growth/grace、currency、first-approved-delivery一次用量、unknown usage、通知off/held | billing/entitlement unit+SQL、merchant-loop、permissions | not-tested |

## 38個原UC及近期PR

`USER_CASE_STATUS.csv`保留原38行全部原始欄位及result，另追加current local/hosted/source/task/evidence/blocker欄位。沒有將suite綠直接套為每個真商戶UC pass；local fixture mapping與hosted replay分開。UC05/16歷史blocked只描述早段，UC25/30後段成功證據保留。

T10：candidate baseline包含PR63、PR64、PR65；本次讀回production只有PR64 SHA301be115，PR65 ca9ecb34尚不能在該deployment驗收。Offer stale/fresh、0000年400、已用/expired link、新link/context及429 countdown以既有owned fixture測試覆蓋；原生Google/email/不同browser/OAuth取消仍需匹配部署及授權transport，沒有寄真mail撞限流。

AI quality：既有workflow corpus119案例涵蓋12個workflow，真run pipeline接canned model。reference facts、prohibited terms、locale/market、malicious review、missing facts、invalid output及unknown cost檢查保留；不聲稱模型實際品質或provider latency。真模型樣本為0、真付費呼叫0，T18和T05/T15相應子項仍blocked。

T12原始效能及EXPLAIN(JSON)見 `evidence/T12-performance-final.jsonl`。10/100/1000筆均只做1個application摘要query，返回1個fixture模板摘要，payload885/886/886 bytes；完整舊loader返回160/1600/16000 rows，新列表返回11/27/27 rows。fixture只有一種template，跨模板完整性另由26/50/51 cases驗證。`createSummary.latencyMs`包括EXPLAIN讀回，不把它冒認純application query或production SLA；server執行時間可直接讀該JSON的Execution Time。

固定source `1ce84a1674653840da1deefd70a0ae34e0352a12` 的首輪unbounded-worker unit為5094 pass/1 timeout，保留 `B7-final-test.log`。沿既有CI `VITEST_MAX_WORKERS=1`重跑，完整5682 cases通過，未改assertion、retry或timeout。最終逐gate命令與exit見 `FINAL_GATES.csv`，不得混用早期48e的611 integration結果。新增receipt工具只寫本地synthetic IDs，不保存email、cookies或magic-link token；相關原UC hosted仍未測。

0017完整SQL首輪612pass/2fail（614 cases）保留。兩個失敗是fixture合約：legacy捕捉後owner save須提交current revision；immutable history不容runtime cleanup刪workspace。修正30/30 SQL綠；沒有刪assertion或新增runtime grants。receipt工具首輪typecheck的Playwright型別推斷錯誤及修正log亦保留。修正後source8bb8a825256e364187196a1233ff372d5a531129及原1ce結果只屬先前snapshot。

T19 aggregate follow-up:4 assertion RED→4 GREEN;82 runtime cases（含78既有controls）及12 provider cases，共94；另3份corpus檔126 cases（其中119 workflow案例）通過。任何已嘗試但未報的token維度保留null；兩次均完整報數時仍加總。最後候選source6ac091365fe5cf0aa9be1fd658b7a1ca72ce22f1；8bb的5682unit/614SQL是補修前snapshot，不能當新source的完整gate結果。

## 最後同source結果

下列11個gate均在6ac091365fe5cf0aa9be1fd658b7a1ca72ce22f1開始及結束，exit=0。HK時間2026-10-12 05:11:56–05:36:23；命令、實際時間及完整stdout/stderr見`FINAL_GATES.csv`／同內容`GATES.csv`，早期失敗行保留，不作pass分子。環境Node24.18.0／pnpm9.12.0／VITEST_MAX_WORKERS=1／本地disposable fixtures。

| gate（corepack pnpm） | 最後結果 |
|---|---|
| typecheck | PASS |
| lint | PASS；0 errors／41 warnings |
| test | 5686 PASS／476 files；5099 root＋62 safe-media＋23 region＋183 scoring＋20 contracts＋299 scan-engine |
| test:integration | 614 PASS／57 files |
| db:verify | 17 migrations applied；replay0／seed0；42 tables／498 columns／211 constraints／114 indexes／10 triggers／27 functions |
| test:no-supabase | PASS |
| test:no-self-service-claim | PASS；self-service未啟用 |
| test:secret-boundary | PASS；62 public artifacts |
| build | PASS |
| e2e | 31 PASS |
| e2e:acceptance | 52 PASS |

另以同source完成兩項補充證據，均exit0：HK/TW收據2份，以及T12 benchmark11 cases。這些不是额外真模型或hosted樣本，也不重複計入上述5686／614。

`evidence/B6-workflow-receipts.json`逐份保存synthetic run/version/event/delivery/application IDs：run succeeded且brand_revision_id非null；preview0version；v1明確redeem後v2編輯核准；首次export counted=true、相同key重複=false、usage1；applied後v3 draft及export409。每份9個audit events。搜索／分派等controls及rescan/measurement由分開的既有acceptance/integration fixtures驗證，這兩份收據沒有执行真商戶rescan或外部發布。

T12最新同source原始JSON在`evidence/T12-performance-release.jsonl`：10/100/1000筆的create summary均1個application query、1個fixture模板row、885/886/886 bytes；EXPLAIN server Execution Time為3.124／2.843／10.857ms。舊loader160/1600/16000rows（3queries），新列表11/27/27rows（2queries）。fixture timings包含本地噪音，不作production SLA或真資料效能保證；summary wall latency仍包括EXPLAIN讀回。跨模板完整性另有26/50/51 controls。

最終TASK_STATUS：1項documentation verified（T08）、13項待hosted驗收、8項hosted受阻；全部22項均有同source本地verified_sha及獨立hosted_status。13 findings尚未用本地PASS關閉，38個原UC hosted candidate仍not-tested。main及production最後唯讀核對見`FINAL_READBACK.json`：ca9ecb34／301be115未變。正式配置有效性、Google原生選帳戶、paid model、真mail、storage到期、實際scheduler tick樣本均0。

Source-only `git diff --check`通過；package/lock/scorer及0001–0015 migrations相對baseline零差異，0016自首次提交後未修改。原樣保存的console evidence logs含工具原有尾隨空白／尾空行，未為diff whitespace檢查改寫歷史輸出。

另逐欄比較原audit：38個UC及13個findings全部原始欄位零改動；22tasks的ID/FID/acceptance/UC/evidence欄位零改動。6張local fixture截圖移入`evidence/screenshots`，source/gate/時間/digest見`SCREENSHOTS.csv`；其他自動browser診斷仍保留本地，沒有作hosted證據。`EVIDENCE_MANIFEST.csv`記錄封存時raw working bytes SHA256，Git newline conversion可令另一次checkout的文字檔bytes不同。

Diff artifact首輪反向檢查exit1：PowerShell pipeline把native Git patch轉成CRLF。已改用`git diff --binary --output=IMPLEMENTATION.patch`直接输出，canonical index `git apply --reverse --check --cached` exit0；原錯誤及修復見`PATCH_CHECK.json`及兩份logs。只修交付artifact，runtime/test source未變，11個已通過gates不受影響。
