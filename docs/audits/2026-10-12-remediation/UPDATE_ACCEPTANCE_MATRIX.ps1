$ErrorActionPreference='Stop'
$binding=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'SOURCE_BINDING.json') -Raw | ConvertFrom-Json
$candidate=$binding.candidate_sha
$tasks=Import-Csv -LiteralPath (Join-Path $PSScriptRoot 'TASK_STATUS.csv')
$cases=Import-Csv -LiteralPath (Join-Path $PSScriptRoot 'USER_CASE_STATUS.csv')
$findings=Import-Csv -LiteralPath (Join-Path $PSScriptRoot 'FINDING_STATUS.csv')
if($tasks.Count -ne 22 -or $cases.Count -ne 38 -or $findings.Count -ne 13){throw 'Audit denominator mismatch'}
$gates=Import-Csv -LiteralPath (Join-Path $PSScriptRoot 'FINAL_GATES.csv')
$required=@('typecheck','lint','test','test:integration','db:verify','test:no-supabase','test:no-self-service-claim','test:secret-boundary','build','e2e','e2e:acceptance')
$allPassed=$true
foreach($name in $required){$last=$gates | Where-Object command -eq ('corepack pnpm '+$name) | Select-Object -Last 1;if(!$last -or $last.result -ne 'PASS' -or $last.execution_sha -ne $candidate){$allPassed=$false}}
$evidence='FINAL_GATES.csv; VERIFICATION.md; evidence/B6-workflow-receipts.json'
$extraTasks=@{1=@(15);2=@(15,16);4=@(15);6=@(22);11=@(15);14=@(9,15);16=@(2);21=@(16);25=@(9,10,15);29=@(5);30=@(15);31=@(5,15);32=@(10);34=@(5,15);35=@(6,7,15);36=@(9,15,22);38=@(7)}
$fixtureMap=@{
 1='public-funnel / canned scan; genuine provider not exercised';2='scan-page invalid input and bounded-request';3='report routes / locale taxonomy';4='public-funnel required consent';5='guided/returning sign-in / claim fixtures';6='chooser/onboarding report scope';7='merchant-loop / preview version cycle; separate rescan SQL';8='shared-lock SQL / assistant HTTP409';9='known auth/membership outage controls';10='recovery429/offline UI';11='invitation expiry SQL/permissions';12='dispatch lease/deadline/mail fixtures';13='readiness catalog/privilege controls; runtime binding unknown';14='managed Auth stand-in; native Google not exercised';15='explicit app signout and contextual return; native account chooser unknown';16='ten-page related fixtures; original owner scenario not replayed';17='factType/owner objective regression';18='26/50/51 recommendation controls and10/100/1000 SQL';19='secondary calendar destination';20='brand/assets outage controls';21='canned public scan; real audit business not scanned';22='bounded finder headers/body/cancel; real provider cause unknown';23='0..4 finding title across3locales';24='fake-clock image retry / document reauthorization; real expiry n=0';25='fixture owner membership acceptance; native Google not exercised';26='typed provider fixtures / actual paid model n=0';27='owner brand save/CAS/history; no unadvertised restore function';28='free current-price0 / separate upgrade';29='template explanation with stored coverage; no model call';30='ten-page related fixtures; page access not operational acceptance';31='missing facts / schema / empty input controls';32='source includes PR65; production remainsPR64';33='immutable revision SQL and prompt/run same snapshot';34='owned HK/TW workflow receipt; real model/hosted rescan not exercised';35='mail off/held and notification fixtures; external receipt n=0';36='chooser/claim request scope and contextual signin';37='same user plus current report request SQL';38='platform definitions empty; external executor unknown; no real tick'
}
foreach($case in $cases){
 $number=[int]($case.user_case_id -replace '^UC-20261011-','')
 $taskNumbers=@($tasks | Where-Object {$_.user_case_ids -match [regex]::Escape($case.user_case_id)} | ForEach-Object {[int]($_.task_id -replace '^T-20261011-','')})+@($extraTasks[$number])
 $case.current_tasks=($taskNumbers | Where-Object {$_} | Sort-Object -Unique | ForEach-Object {'T-20261011-'+$_.ToString('00')}) -join ' '
 $case.current_sha=$candidate
 $case.current_hosted_result='not-tested candidate'
 $case.current_local_result=$(if($allPassed){'related local fixtures passed; original hosted UC not-tested'}else{'related fixture mapping prepared; final gates incomplete'})
 $case.current_local_evidence=$fixtureMap[$number]+'; '+$evidence
 $case.current_blocker=if($number -in @(5,16)){'Historical early blocked state retained; later owner success in UC25/30 remains valid. Candidate replay unavailable.'}else{'candidate not deployed; authorized hosted fixture/provider/transport unavailable'}
}
foreach($finding in $findings){
 $related=$tasks | Where-Object {$_.finding_ids -match [regex]::Escape($finding.finding_id)}
 $finding.current_tasks=($related.task_id | Sort-Object -Unique) -join ' '
 $finding.candidate_sha=$candidate
 $finding.current_local_status=if($allPassed){'code/related local fixtures verified; see per-task scope'}else{'source/related fixture verification; final gates incomplete'}
 $finding.current_hosted_status='not-tested candidate'
 $finding.current_evidence=$evidence+'; '+($related.evidence_path -join '; ')
 $finding.closure='open pending applicable hosted acceptance'
}
$cases | Export-Csv -LiteralPath (Join-Path $PSScriptRoot 'USER_CASE_STATUS.csv') -NoTypeInformation
$findings | Export-Csv -LiteralPath (Join-Path $PSScriptRoot 'FINDING_STATUS.csv') -NoTypeInformation
$pages=@{
 actions='search/filter; selection/bulk; input; draft/approve/export; reconciliation';create='objective/factType; per-template scoped recommendation; preview/bulk/retry';insights='location scope; comparable coverage; applied/rescan/measurement';assets='upload/rights; lazy image; on-demand document; renewed preview; role denial';calendar='cadence; due actions; manual notification; secondary destination';activity='actor/timezone/entity; terminal run/version; unknown cost';brand='save/reload; immutable snapshot/history; CAS409; owner permission';integrations='connect/disconnect; credentials absent; OAuth cancel/expiry/revoke';team='invite/accept/expired; role/location scope; revocation; owner-removal denial';billing='free/growth/grace/currency; delivery counted once; unknown usage; mail off/held'
}
$controls=foreach($pageName in $pages.Keys | Sort-Object){[pscustomobject]@{page=$pageName;controls=$pages[$pageName];candidate_sha=$candidate;local_result=if($allPassed){'related local fixtures passed; control-specific scope in VERIFICATION.md'}else{'final gates incomplete'};hosted_result='not-tested';evidence_path=$evidence;blocker='matching candidate deployment and authorized fixtures unavailable'}}
$controls | Export-Csv -LiteralPath (Join-Path $PSScriptRoot 'CONTROL_STATUS.csv') -NoTypeInformation
