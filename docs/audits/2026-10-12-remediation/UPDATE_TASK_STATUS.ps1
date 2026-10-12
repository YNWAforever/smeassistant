param([int[]]$Task,[string]$Implementation='code-only',[string]$Hosted='not-tested',[string]$Result,[string]$Evidence,[string]$Blocker='matching deployment and authorized fixture unavailable',[string]$ImplementedSha='')
$taskStatusPath=Join-Path $PSScriptRoot 'TASK_STATUS.csv'
$taskStatusRows=Import-Csv -LiteralPath $taskStatusPath
foreach($taskNumber in $Task){
 $taskId='T-20261011-'+$taskNumber.ToString('00')
 $taskStatusRow=$taskStatusRows | Where-Object task_id -eq $taskId
 if(!$taskStatusRow){throw "Unknown task ID: $taskId"}
 $taskStatusRow.implementation_status=$Implementation
 $taskStatusRow.hosted_status=$Hosted
 $taskStatusRow.result=$Result
 $taskStatusRow.evidence_path=$Evidence
 $taskStatusRow.blocker=$Blocker
 $taskStatusRow.verification_kind='local fixture/source; hosted separate'
 if($ImplementedSha){$taskStatusRow.implemented_sha=$ImplementedSha}
 $taskStatusRow.status=if($Hosted -eq 'blocked'){'受阻'}elseif($Implementation -eq 'documentation-verified'){'已驗證完成'}elseif($Implementation -match 'in-progress'){'進行中'}else{'待驗收'}
 $taskStatusRow.next_action=if($Hosted -eq 'blocked'){$Blocker}else{'matching candidate deployment and scoped hosted verification'}
}
$taskStatusRows | Export-Csv -LiteralPath $taskStatusPath -NoTypeInformation
