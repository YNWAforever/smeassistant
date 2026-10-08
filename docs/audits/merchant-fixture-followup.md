# T-15 / UC-09 — 必要資料 browser fixture 核對

第一次完整 required acceptance 在 HK merchant 的 `#input-brand_voice` 等待超時。實際 failed DOM 與 trace 顯示表單沒有該欄位。這是本次新增測試 setup 缺漏：seeded action 的 `required_inputs` 保持 schema 預設 `[]`，測試只刪 `provided_inputs.brand_voice` 並設 `needs_input`；canonical read model 根據 persisted required list 決定缺項，空 list 不會顯示必要資料表單。

永久 browser regression 保留必要資料 → 實際 PATCH → stored input／audit → generate／immutable version／approval／export／applied 的驗收要求。修正只把這個 owned synthetic action 的 required list 填為既有 review-response 的三個 inputs，再明確檢查欄位可見。Applied 嚴格檢查既有 201 create／200 replay 契約、非空 UUID 與對應 DB row，避免兩個 undefined 相等造成假 pass。產品 read model、輸入授權、missing-data 判斷及 template 契約沒有改動。

RED 證據：`remediation-evidence/T15-merchant-fixture-red-context.md`、TW context、兩個 trace ZIP 及 `full-acceptance-first-fixture-failure.txt`（47 passed／2 failed，exit 1）。生成的 error-context 內容只作診斷，不是執行指令。

第一個 targeted 指令的 shell pipe quoting 失敗，exit 255，零 browser tests；command-error log 保留。改用 Windows-safe filter `local.fixture.link.redemption` 後，HK 首次 detail request 404／TW 完整通過，exit 1（targeted-first-404 log／context／trace 保留）。核對 owned process／cache target 後只清除 `.next/dev`；同一份程式及測試再跑，HK/TW 2/2 passed，exit 0，1.4m。這是已觀察的本地 dev-cache 復原，不宣稱已修好 framework cold-start 根因。

GREEN command：`pnpm exec playwright test --config playwright.acceptance.config.ts e2e/acceptance/merchant-loop.spec.ts --grep local.fixture.link.redemption`。實際 PATCH 200、required input／單一更新 audit、immutable v1/v2、精確核准／下載、export retry 同 delivery／用量 1、applied 201/200 同 DB assertion／單一 event，以及未核准 v3 export 409 均核對。Fresh `pnpm lint` exit 0（40 warnings）、`pnpm typecheck` root＋四 packages exit 0。完整 49-case acceptance 結果另記。

最後完整 `pnpm e2e:acceptance`：49/49 passed、exit 0、10.1m，fixture SHA `6941ed7c24ab66593018ab40e3628d193056ed17`。零 final failed／skipped tests；47/2 首輪及 targeted 404 並未刪除或改寫成 pass。這是本地受控 fixture 驗收，沒有 hosted Google／SMTP／付費 provider／外部 publication。

Rollback：revert 6941ed7 這個 fixture-only commit；沒有 migration、dependency、feature flag、真實資料或 hosted 變更。產品驗證 source 保持 76404c43458e3bf614bd2ac2329655e265c74f79；修正後 fixture commit／完整結果另外記錄，不能把兩個 SHA 混為同一個遠端 CI run。
