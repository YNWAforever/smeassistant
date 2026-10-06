# T-05 / F-03 — release gate evidence and proposed change

Read-only snapshot, 2026-10-07. No GitHub/Vercel setting was changed. Repository: YNWAforever/smeassistant; Vercel project prj_Hbox4o4NhM3p0yxRxmY8Xq1mjtb5.

Observed: `main/protection` returns HTTP 404 "Branch not protected"; repository rulesets are `[]`. The exact GitHub Actions check is `verify`, app id 15368 (`github-actions`). Baseline d1cbc7bd8a2bc7989c774d15001f7971274bed8d passed [run 37401133680](https://github.com/YNWAforever/smeassistant/actions/runs/37401133680). A later PR SHA daace535ff12b3d8f73fbee65c4119b2912c640d failed [run 37412773979](https://github.com/YNWAforever/smeassistant/actions/runs/37412773979); this does not reopen the historical T-04 baseline fix and is not this local remediation's CI result.

The production alias currently resolves to dpl_ARepQExFa36hUt1PzYcCzW4ECzCE / smeassistant-e41x3xysg-ynwaforevers-projects.vercel.app, main SHA d1cbc7bd8a2bc7989c774d15001f7971274bed8d. Vercel `autoAssignCustomDomains=true`, `productionDeploymentsFastLane=true`; project checks and available native checks are empty. The latest project deployment can be a preview, so its READY state is not used as production evidence. Read-only GitHub collaborator inventory returns YNWAforever (admin); Vercel team membership returns ynwaforever (OWNER) and verna-fimmicktw (DEVELOPER). These role snapshots do not prove effective project promotion/bypass permissions or integration-token privileges; an authorized denial drill and project access inventory remain required. The safe inventories exclude email addresses and secrets.

Reviewable minimal GitHub proposal is `branch-protection-proposal.json`: require up-to-date `verify` from the observed GitHub Actions app, enforce for admins, require PR path without introducing a mandatory extra human approval, disallow force push/deletion. Apply only after explicit external setting authorization; confirm the API supports the proposal in this repository and reread the effective settings. Keep existing CI steps and pinned dependencies.

Vercel proposal: first disable automatic production domain assignment for candidate releases and restrict manual promotion permissions to the named release owner; then install a blocking check tied to the exact candidate SHA and all existing CI gates. Do not assume a GitHub protection rule alone gates Vercel aliases. Keep a manual promotion hold as an alternative protection until an actual failed-candidate test proves the replacement. No change payload is applied here; the check integration/permission mechanism and account entitlement need owner selection.

Failure drill (requires authorization for push, PR and a dedicated non-production project/alias):

1. Save current effective GitHub and Vercel settings, bypass actors, alias/deployment/SHA and rollback target. Use a new isolated fixture branch and test alias that cannot route customer traffic.
2. Add one intentional deterministic CI failure to that branch, push and create a draft PR. Record failed `verify` at its exact SHA.
3. Attempt merge and test-alias promotion through the ordinary release identity. Capture actual API/UI denial, check state and unchanged alias. An unattempted promotion is insufficient evidence.
4. Correct the failure, get the complete green gate for the new SHA, promote only the authorized test alias, and prove the alias SHA matches. Repeat with a stale successful SHA to test binding.
5. Restore test-only resources/settings under the same explicit authorization. Production remains held until independent DB readiness and scoped hosted journey evidence pass.

Rollback: restore the saved settings only while retaining an effective promotion hold. Do not remove an existing gate until its replacement is proved. T-05 remains blocked: hosted setting-change/drill authorization, chosen check integration, exact bypass-role evidence and dedicated test alias are missing.

Platform reference: [Vercel Checks lifecycle](https://vercel.com/docs/checks) describes registering checks before readiness and delaying aliases until their conclusions. A matching integration is required; an empty project check list does not implement that gate.

Raw evidence: `../audits/remediation-evidence/T05-*`, plus hosted environment name/target metadata. These files contain no secret values.
