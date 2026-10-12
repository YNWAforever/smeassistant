$ErrorActionPreference='Stop'
$repoRoot=(Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
Push-Location $repoRoot
try {
 $candidateSha=(git rev-parse HEAD).Trim()
 $objects=[ordered]@{}
 foreach($path in @('app','components','lib','packages','scripts','neon','test','tests','e2e','package.json','pnpm-lock.yaml','vercel.json','next.config.ts','tsconfig.json','vitest.config.ts','vitest.integration.config.ts','playwright.config.ts','playwright.acceptance.config.ts')){
  $objects[$path]=(git rev-parse ($candidateSha+':'+$path)).Trim()
 }
 $migrationHashes=[ordered]@{}
 foreach($path in @('neon/migrations/0016_brand_revisions.sql','neon/migrations/0017_brand_profile_revision_capture.sql')){
  $migrationHashes[$path]=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
 }
 $evidenceTools=[ordered]@{}
 foreach($path in @('CAPTURE_LOCAL_WORKFLOW_RECEIPT.ts','RUN_LOCAL_GATES.ps1','UPDATE_SOURCE_BINDING.ps1','UPDATE_ACCEPTANCE_MATRIX.ps1','UPDATE_TASK_STATUS.ps1')){
  $toolPath='docs/audits/2026-10-12-remediation/'+$path
  $evidenceTools[$toolPath]=(Get-FileHash -LiteralPath $toolPath -Algorithm SHA256).Hash.ToLowerInvariant()
 }
 [ordered]@{candidate_sha=$candidateSha;created_hk=[DateTimeOffset]::Now.ToString('o');runtime_git_objects=$objects;evidence_tool_working_bytes_sha256=$evidenceTools;migration_working_bytes_sha256=$migrationHashes;neon_auth_sdk='0.5.0-beta';node='24.18.0';pnpm='9.12.0';environment='owned local fixtures; no hosted/paid calls'} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'SOURCE_BINDING.json')
 $commits=git log --reverse --format='%H|%s' 'ca9ecb34138aa3e0f3f330e5c03727ce4c4a9746..HEAD' | ForEach-Object {$entry=$_ -split '\|',2;[pscustomobject]@{sha=$entry[0];subject=$entry[1]}}
 $commits | Export-Csv -LiteralPath (Join-Path $PSScriptRoot 'COMMITS.csv') -NoTypeInformation
} finally {Pop-Location}
