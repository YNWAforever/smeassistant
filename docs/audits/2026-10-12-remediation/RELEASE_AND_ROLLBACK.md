# 發布及回滾包 — 2026-10-12

本包是具體候選修復交接，不新增 push／PR、remote migration、配置、部署、付費生成、寄信、邀請、付款或發布授權。候選 SHA 與逐批 commit 見 `COMMITS.csv`；當前正式版本另見 `BASELINE.md`／`FINAL_READBACK.json`。原 ZIP、F/T/UC IDs 及舊 audit 歷史保留。

## 發布順序

1. 授權人綁定候選 SHA、repository／branch、preview及production project、Neon branch／database／runtime role、migration writer、fixture actor／workspace／action、時間窗及供應商預算。Push及PR、migration、部署、收費呼叫各自列明範圍。提交前檢查本次差異及 exact-SHA gates；公開PR不附私有 fixture 身份、DB endpoint或登入資料。
2. 先唯讀核對 schema journal 0001–0015 舊 checksum、expected target及ownership，保存可靠可恢復 backup。0016及0017 是新增 expand-only migrations；不修改舊 migration、不執行歷史 reown packet（該 packet 仍嚴格綁0015）。在指定 preview branch 套用 依序 `0016_brand_revisions.sql`、`0017_brand_profile_revision_capture.sql`，核對 journal/checksum、SELECT/INSERT-only grants、immutable trigger、composite FK及同 workspace revision。基線僅來自當前已知 profile，歷史 actor 未知保持 null。
3. 部署同候選 SHA 到匹配 Auth／DB preview。新 app 必須在0017之後才啟動，否則品牌／生成查詢會受控失敗。保留 pinned Neon Auth0.5.0-beta；沒有 scorer、billing、membership、ownership或發布 gate變更。
4. 按 `docs/operations/ai-readiness.md` 核對配置存在性及部署 binding。所需名稱包括 `DATABASE_URL`、`APP_ORIGIN`、`NEON_AUTH_BASE_URL`、`NEON_AUTH_COOKIE_SECRET`、選中 provider 的 `LLM_BASE_URL`／`LLM_MODEL`／key、既有成本／budget及pause設定；不輸出值。metadata有名稱不代表有效配置。Preview與production不能混合 Auth session及DB branch。
5. 首批受限驗收：T22 A較新／B較舊pending；T03 recovery429未寄出及保留輸入；T20 free card價格0；T13 secondary店日曆link；T21保存A/B／CAS409／prompt-run同revision；T01雙分頁同action及ordinary-run競爭；T18一次真模型草稿、run／usage或unknown、owner手動建立version。拒絕 controls配owned成功；沒有公開發布。
6. 版本循環：preview不建version→owner建立v1→編輯v2→核准v2→首次export計1→再次export不重扣→再編輯v3回draft。保留 run/version/event correlation，核對同店及可比較snapshot；未知或不相容 coverage不能冒認改善。
7. T10 PR63 offer stale拒絕/fresh允許/年份0000回400；PR64已用及過期magic-link與新link保留claim/returnTo；PR65指定429 transport倒數。只在包含對應提交的部署測；Google成功不代替email round-trip。
8. Preview通過後，另按正式授權在明確production DB套0016及0017、部署同SHA、讀回alias及bounded canary；T07保持manual，除非單獨授權唯一executor及真tick／告警演練。十頁 controls及38 UC仍逐項記錄，不能用HTTP200或unit PASS關閉hosted項。

## 回退

Runtime執行權須另作唯讀驗證；catalog存在和table grants不足以證明function可呼叫。以指定runtime連線（不是writer）核對下列兩個值均為true，否則保持blocked：

```sql
SELECT
 pg_catalog.has_function_privilege(current_user,'public.save_brand_revision(uuid,uuid,jsonb,uuid)','EXECUTE') AS can_save_brand,
 pg_catalog.has_function_privilege(current_user,'public.brand_snapshot_for_generation(uuid,uuid)','EXECUTE') AS can_snapshot_brand;
```

0017 trigger捕捉已知claim／舊app寫入，未知actor保持null；未有profile時，只有accepted owner/manager的生成路徑可建立現行default snapshot。重複讀取／相同legacy profile不追加revision；owner明確save繼續使用0016的CAS。

- 保存 application rollback target：目前 production `301be115702c313bdf0a3cfa984518a00b6d98da`／`dpl_4H8u4jXti2KHdT2HAVGCEYm1SMmz`（執行前再重核）。回退 app，**保留0016、0017及全部revision/run/version/audit**；不可drop不可變歷史或把profile改回假歷史。0017 trigger仍會捕捉舊app／claim的已知品牌寫入，actor未知保持null；舊app的生成沒有revision binding。回退期間停止生成，重上新app前唯讀核對history／run／current profile，不能静默覆寫。
- 遇provider失效按既有且已授權pause操作停生成。response丟失、終態寫入失敗或run未知先唯讀查running/reaper及usage；不要盲目重呼叫收費provider，不承諾跨網絡 exactly-once。
- Scheduler獨立pause；保持held mail、leases及dedupe，先對帳再恢復。保留舊配置於授權人安全vault，本包不保存secret、cookie、magic link或完整DB URL。

## 目前最小解除條件

需要 exact candidate 的 push／PR和preview發布 scope；指定可遷移的隔離Neon branch及對應Auth／owner fixtures；安全配置驗證與一次模型call的budget／時間窗；email transport／OAuth取消及到期fixtures；T07營運owner、唯一executor和告警接收人決定。未具備的子項保持 blocked/not-tested，其他本地修復照常交付。

## 已備妥的push／draft PR命令（未執行）

執行前將`git rev-parse HEAD`與使用者批准的最後交付SHA核對；並核對runtime/test/config objects與`SOURCE_BINDING.json`的已驗證source6ac091365fe5cf0aa9be1fd658b7a1ca72ce22f1相同。若main／候選／授權scope有變，先重新核對差異及適用gates。以下只推此branch及開draft PR，不包含merge、migration、secret、deploy或paid call。

```powershell
git -C C:\Users\laich\Documents\smescanner\.worktrees\smeassistant-remediation-20261012 push --set-upstream origin codex/smeassistant-remediation-20261012
gh pr create --repo YNWAforever/smeassistant --base main --head codex/smeassistant-remediation-20261012 --draft --title "Repair SMEAssistant audit generation, onboarding and management flows" --body-file C:\Users\laich\Documents\smescanner\.worktrees\smeassistant-remediation-20261012\docs\audits\2026-10-12-remediation\PR_BODY.md
```

Repository `CLAUDE.md:108-109`原文要求："Never apply a remote migration, run a live paid scan, deploy, git push, or open a PR unless Willy explicitly asks for that action in the current session. Prepare the command and stop." 本輪尚無push／PR的明確要求，因此命令只供審批，未執行。
