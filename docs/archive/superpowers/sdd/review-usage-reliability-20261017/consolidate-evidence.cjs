const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const root = ".superpowers/sdd/review-usage-reliability-20261017";
const runs = ["live-2026-10-17T09-50-00-122Z", "live-2026-10-17T09-54-10-647Z"];
const read = (run, name) => JSON.parse(fs.readFileSync(`${root}/${run}/${name}.json`, "utf8"));
const results = runs.flatMap(run => read(run, "real-ai-results").results.map(result => ({ ...result, evidenceRun: run })));
assert.deepEqual(results.map(result => result.case), [1, 2, 3, 4, 5]);
const ledger = runs.flatMap(run => read(run, "provider-ledger").map(entry => ({ ...entry, evidenceRun: run })));
const receipts = runs.flatMap(run => read(run, "final-database-receipts"));
const appRuns = receipts.flatMap(receipt => receipt.runs);
const attempts = appRuns.flatMap(run => Object.values(run.provider_usage?.attempts ?? {}));
assert.equal(ledger.length, 10);
assert.equal(attempts.length, 10);
assert.equal(new Set(ledger.map(entry => entry.responseId)).size, 10);
for (const entry of ledger) {
  assert.equal(entry.status, 200);
  assert.equal(entry.requestedModel, "longcat-2.5-preview-free");
  assert.equal(entry.responseModel, "longcat-2.5-preview-free");
  assert.equal(entry.freeGate.budgetUsd, 0);
  assert.equal(entry.freeGate.fallbackAllowed, false);
  assert.ok(entry.reportedCostUsd === null || entry.reportedCostUsd === 0);
  const attempt = attempts.find(attempt => attempt.providerRequestId === entry.responseId);
  assert.ok(attempt);
  assert.equal(attempt.state, "reported");
  assert.equal(attempt.usage.inputTokens, entry.usage.prompt_tokens);
  assert.equal(attempt.usage.outputTokens, entry.usage.completion_tokens);
  assert.ok(Date.parse(attempt.startedAt) <= Date.parse(entry.startedAt));
}
assert.ok(appRuns.every(run => Number.isSafeInteger(run.input_tokens) && Number.isSafeInteger(run.output_tokens)));
assert.ok(appRuns.every(run => run.provider_usage ? run.provider_usage.status === "complete" : run.input_tokens === 0 && run.output_tokens === 0));
assert.ok(appRuns.every(run => run.cost_usd === 0));
assert.ok(receipts.every(receipt => receipt.deliveries === 0 && receipt.deliveryUsage === 0
  && receipt.versions.every(version => version.approved_at === null && version.first_exported_at === null
    && ["draft", "superseded"].includes(version.approval_state))));
const sum = (rows, value) => rows.reduce((total, row) => total + value(row), 0);
const providerInput = sum(ledger, entry => entry.usage.prompt_tokens);
const providerOutput = sum(ledger, entry => entry.usage.completion_tokens);
assert.equal(sum(appRuns, run => run.input_tokens), providerInput);
assert.equal(sum(appRuns, run => run.output_tokens), providerOutput);
const cleanup = runs.map(run => read(run, "cleanup-live"));
assert.ok(cleanup.every(receipt => receipt.stopped && receipt.remaining === ""));
assert.equal(new Set(cleanup.map(receipt => receipt.exactContainerId)).size, 2);
const late = read(runs[1], "real-late-usage");
assert.equal(late.result, "PASS");
assert.equal(late.retryStatus, 409);
assert.equal(late.inferenceCalls, 1);
assert.equal(late.receipt.versions.length, 1);
assert.equal(late.receipt.runs[0].state, "failed");
assert.ok(late.outputElapsedMs >= 45000 && late.outputElapsedMs < 55000);
const applicationSha = "d153c4a3e4c614de0377f055ee24b10d7b5cb655";
assert.equal(cp.execFileSync("git", ["diff", applicationSha, "HEAD", "--", "app", "components", "lib", "test", "e2e"], { encoding: "utf8" }), "");
const manifest = JSON.parse(fs.readFileSync(`${root}/candidate-source.json`, "utf8"));
const drift = manifest.files.filter(entry =>
  crypto.createHash("sha256").update(fs.readFileSync(entry.file)).digest("hex") !== entry.sha256).map(entry => entry.file);
assert.deepEqual(drift, [`${root}/live-relay.ts`]);
const stages = fs.readFileSync(`${root}/candidate-stages.jsonl`, "utf8").trim().split(/\r?\n/).map(line => JSON.parse(line));
assert.equal(stages.length, 8);
assert.ok(stages.every(stage => stage.exitCode === 0));
const cases = results.map(result => ({
  case: result.case, evidenceRun: result.evidenceRun, version: result.version.version_no,
  versionId: result.version.id, firstSaveMs: result.firstSaveMs, language: result.language, voice: result.voice,
  body: result.version.body, originalReview: result.review, factScope: result.factScope,
  reload: result.persistedAndReloaded, newFixtureSession: result.freshFixtureSessionReadback,
  repeatedKnownReviewConfirmation: result.repeatedKnownReviewConfirmation,
  manualTailAdded: result.manualTailAdded, humanRating: "PENDING_USER",
}));
assert.ok(cases.every(result => result.reload && result.newFixtureSession && !result.repeatedKnownReviewConfirmation));
const evidence = {
  observedAt: new Date().toISOString(), applicationSha,
  diagnosticRunnerSha: cp.execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  applicationBytesIdenticalAcrossRuns: true,
  preservedFailure: {
    run: runs[0], case: 2, reason: "Business fact guard refused the completion; no version",
    originalProviderBodyRetained: false, exactOffendingTextOrFalsePositive: "UNVERIFIED",
    usageCompleteBeforeContinuation: true,
  },
  model: "longcat-2.5-preview-free", endpoint: "https://opencode.ai/inference/go/v1/chat/completions",
  budgetUsd: 0, fallback: false, providerRequests: ledger.length, providerInput, providerOutput,
  applicationInput: sum(appRuns, run => run.input_tokens), applicationOutput: sum(appRuns, run => run.output_tokens),
  unmatchedProviderResponses: 0, unresolvedAttempts: 0, applicationEstimatedCostUsd: 0,
  invoiceVerified: false, deliveries: 0, approvedVersions: 0, cases, lateUsage: late,
  cleanup, testStages: stages, deployed: false, productionDataChanged: false, humanQuality: "PENDING_USER",
};
fs.writeFileSync(`${root}/final-verification.json`, JSON.stringify(evidence, null, 2));
const absolute = file => path.resolve(file).replaceAll("\\", "/");
const cards = cases.map(result => {
  const screenshot = absolute(`${root}/${result.evidenceRun}/draft-${result.case}-readback.png`);
  assert.ok(fs.existsSync(screenshot));
  const manual = result.manualTailAdded
    ? "\n**Case 5 最後一句是衝突／明確另存測試的人手追加，並非模型原文；請分開評核。**\n" : "";
  return `## 草稿 ${result.case}\n\n語言：${result.language}；品牌語氣：${result.voice}；已保存版本：${result.version}。\n\n原評論：${result.originalReview}\n\n資料及限制：${result.factScope}\n\n正文：\n\n\`\`\`text\n${result.body}\n\`\`\`\n${manual}\n保存、重載及新 fixture session 讀回：PASS。生成觸發至首版保存：${(result.firstSaveMs / 1000).toFixed(3)} 秒（不含登入／設定／真人操作）。\n\n[讀回畫面](${screenshot})\n\n評核：□ 可直接使用　□ 只需少量修改　□ 需大幅修改　□ 不可用\n\n需要修改的文字／事實／語氣：＿＿＿＿\n`;
}).join("\n");
fs.writeFileSync(`${root}/five-drafts-for-user-review.md`,
  `# 五份真實 LongCat 草稿：請使用者評核\n\n只使用隔離合成商戶及本機 Auth/mail；真實免費模型回覆。已保存及重讀，全部未批准、未發佈。兩個 owned containers 已清理，正文及畫面保留於此評核包。\n\nApplication source：${applicationSha}。後續 runner 只增加合成回覆診斷，應用程式內容完全相同。\n\n首批 Case 2 被事實保護規則拒絕，沒有保存，原始正文未留存，故不猜測具體原因。當時用量已完整對帳及 fixture 已清理後，才明確由 Case 2 接續；沒有重複要求已有評論、改守則或切換模型。這不是單次五例全綠的首試紀錄。\n\n真人品質門檻：PENDING_USER；未以模型自評計分。至少四份獲你評為「可直接使用」或「只需少量修改」才可關閉該門檻；評核文件不會批准應用程式內的草稿。\n\n${cards}\n\n## 用量及安全範圍\n\n兩批共 ${ledger.length} 次真實請求（包括一個被守則拒絕及一個刻意延遲交付的回覆），${providerInput} input／${providerOutput} output tokens，與應用程式逐 response ID 對上，差額及 unresolved attempts 都為 0。每次免費 gate 通過，只有指定 Go endpoint／exact model，無 fallback。Application cost 0 是免費費率估算；provider 沒有 monetary cost，帳單未獨立查核。\n\n未驗證：真人 4/5 內容品質、完整真人 5 分鐘旅程、hosted Google／OTP、Safari／WebKit 及真手機。390px Chromium 只是 viewport。沒有變更 Eldage、正式資料、認證設定或部署。\n`);
console.log(JSON.stringify({
  cases: cases.length, providerRequests: ledger.length, providerInput, providerOutput, unresolvedAttempts: 0,
  versions: cases.map(result => result.version), lateOutputMs: late.outputElapsedMs, cleanupContainers: cleanup.length,
  verification: `${root}/final-verification.json`, reviewPack: `${root}/five-drafts-for-user-review.md`,
}));
