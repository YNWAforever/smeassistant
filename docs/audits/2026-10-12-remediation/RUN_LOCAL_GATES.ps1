param([string[]]$Gate=@('typecheck','lint','test:integration','db:verify','test:no-supabase','test:no-self-service-claim','test:secret-boundary','build','e2e','e2e:acceptance'),[string]$Attempt='')
$ErrorActionPreference='Stop'
$repoRoot=(Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$allowed=@('typecheck','lint','test','test:integration','db:verify','test:no-supabase','test:no-self-service-claim','test:secret-boundary','build','e2e','e2e:acceptance')
if($Attempt -notmatch '^[a-z0-9-]{0,48}$'){throw 'Invalid local evidence attempt name'}
Push-Location $repoRoot
try {
 foreach($gateName in $Gate){
  if($gateName -notin $allowed){throw "Refusing unsupported gate: $gateName"}
  git diff --quiet -- app components lib packages scripts neon test tests e2e package.json pnpm-lock.yaml vercel.json next.config.ts tsconfig.json vitest.config.ts vitest.integration.config.ts playwright.config.ts playwright.acceptance.config.ts
  if($LASTEXITCODE -ne 0){throw 'Refusing a gate with uncommitted runtime/test source'}
  $sourceSha=(git rev-parse HEAD).Trim()
  $started=[DateTimeOffset]::Now.ToString('o')
  $logName='B7-final-'+$gateName.Replace(':','-')+$(if($Attempt){'-'+$Attempt}else{''})+'.log'
  $logPath=Join-Path $PSScriptRoot ('evidence/'+$logName)
  & corepack pnpm $gateName *> $logPath
  $gateExit=$LASTEXITCODE
  $ended=[DateTimeOffset]::Now.ToString('o')
  $gateRow=[pscustomobject]@{command=('corepack pnpm '+$gateName);execution_sha=$sourceSha;end_sha=(git rev-parse HEAD).Trim();environment=('owned local fixtures; no hosted/paid calls; VITEST_MAX_WORKERS='+$env:VITEST_MAX_WORKERS);started=$started;ended=$ended;exit_code=$gateExit;result=if($gateExit -eq 0){'PASS'}else{'FAIL'};evidence_path=('evidence/'+$logName)}
  $gateRow | Export-Csv -LiteralPath (Join-Path $PSScriptRoot 'FINAL_GATES.csv') -Append -NoTypeInformation
  Write-Output "$gateName exit=$gateExit source=$sourceSha evidence=$logName"
  Get-Content -LiteralPath $logPath -Tail 12
  if($gateExit -ne 0){exit $gateExit}
 }
} finally {Pop-Location}
