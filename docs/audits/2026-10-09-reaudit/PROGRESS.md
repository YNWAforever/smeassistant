# 進度 checkpoint（2026-10-09 re-audit）

下一個 session 由這裡續做。完整說明見 [REAUDIT-REPORT.md](REAUDIT-REPORT.md)，任務表見 [tracker-2026-10-09.csv](tracker-2026-10-09.csv)，操作清單見 [operation-inventory.csv](operation-inventory.csv)。

## 位置

- worktree：`C:\Users\laich\Documents\smeassistant\.claude\worktrees\audit-fix-1009`
- branch：`claude/audit-fix-20261009`（基於 origin/main `cb0b546`），**未推送**
- 最終程式 SHA：`1bbb69d`；之後只有文件 commit
- production：`d1cbc7b`（`dpl_ARepQExFa36hUt1PzYcCzW4ECzCE`）；main 自動部署被 `vercel.json` hold

## 批次

| 批 | 內容 | commit | 證據 |
|---|---|---|---|
| 0 | 基準核對、E32 重跑、Codex 修復讀碼重驗 | — | `evidence/E32-rerun.json` |
| 1 | F-14 AI 生成進行中防重複收費 | `9677918` | `evidence/F14-red.txt`、`batch1-*-green.txt` |
| 1 | F-13 掃描開始／重掃重送安全 | `e9a6f9b` | `evidence/F13-red.txt`、`batch1-*-green.txt` |
| 2 | F-15 沒填 IG 即時顯示「未提供」 | `db7f844` | status route／collector-outcomes／integration |
| 3 | F-16 SQLSTATE log、readiness 全欄核對；F-14 import 修正 | `1bbb69d` | `evidence/F16-red.txt`、`F16-readiness-green.txt` |
| 4 | 完整 gates（CI 次序）：10/11 exit 0；unit exit 1（2 個 Windows 負載 timeout，單獨 3/3 通過）；integration 578、e2e 31、acceptance 52 全過 | `1bbb69d` | `evidence/gates/gates.jsonl`、`gates/unit-timeout-isolated-rerun.txt` |

## 2026-10-09 下午更新

- #45（`f647b30`）及 #46（`69750c6`）已合併；`69750c6` 已部署到 production。
- F-16 已結案：正式 DB 只到 0008；店主補套 `apply-0009`～`apply-0014` 後首頁正常。
- 下表「未解項」第 1–3 項已完成；套用後 `check-missing-columns.sql` 為 0 行（journal 14）。仍待：記錄正式 DB 的 branch／endpoint id、0015（只是 index）、第 4–6 項。

## 未解項（按優先，上午版本）

1. **F-16 production owner 首頁失敗**：需 Willy 以唯讀身份對部署 DB 跑 `corepack pnpm neon:readiness`，回報 `status`／`category`。若缺 0011 欄位，另行授權補套。
2. 推送本分支、開 PR、跑 CI（需同意）。
3. 部署（解除 main hold 或 promote）需授權，應在 F-16 之後。
4. hosted 驗收需要專用測試身份及 workspace。
5. F-18 助理起草防重複（flag off，啟用前處理）。
6. T-02／T-05／T-16／T-17／T-21 維持 blocked（見 tracker）。

## 已知環境限制

- Windows 全套 unit 時 `tests/scan-claim-single-path.test.ts`、`tests/scan-events-single-writer.test.ts` 偶爾超過 5 秒；單獨跑通過。
- 在 Windows 上 `TaskStop` 不會殺掉背景 bash 的子程序；中止 gate 時要用 `taskkill /T` 殺整棵 process tree，並清理帶 `com.sme-scanner.integration` label 的 fixture container。
