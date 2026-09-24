import type { ValueReport } from "./value-queries";

/** Counts only: no emails, business names or workspace slugs, by construction. */
const OFFSET_MS = 8 * 60 * 60 * 1000;
const hkt = (iso: string) => new Date(Date.parse(iso) + OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
// padEnd never truncates, so a label or value at or past its width would run
// into the next column. The explicit gap keeps columns apart at any width.
const LABEL_WIDTH = 28;
const VALUE_WIDTH = 28;
const GAP = "  ";
const line = (label: string, value: string, note = "") =>
  `  ${label.padEnd(LABEL_WIDTH)}${GAP}${value.padEnd(VALUE_WIDTH)}${GAP}${note}`.trimEnd();
const gap = (have: number, of: number) => `(gap ${of - have})`;

export function formatText(r: ValueReport): string {
  return [
    `Weekly value report · ${r.week.label} · ${r.week.timezone}`,
    `Window: ${hkt(r.week.start)} → ${hkt(r.week.end)} HKT (end exclusive)`,
    `Excluded: ${r.exclusions.demoWorkspaces} demo, ${r.exclusions.internalWorkspaces} internal workspace(s)`,
    "",
    "PRIMARY — businesses completing a useful approved delivery",
    line("Locations", `${r.primary.locations} of ${r.primary.eligibleLocations} eligible`, "deliveries.counted: first export of an approved version"),
    line("Workspaces", `${r.primary.workspaces} of ${r.primary.eligibleWorkspaces} eligible`, "account metric, reported separately"),
    line("Deliveries with no location", `${r.primary.deliveriesWithoutLocation}`, "workspace-wide actions; in the workspace count only"),
    "",
    "SCANS — cohort started this week, status as of now (audit_jobs)",
    line("Started", `${r.scans.started}`),
    line("Completed, full", `${r.scans.completedFull} of ${r.scans.started}`),
    line("Completed, partial", `${r.scans.completedPartial} of ${r.scans.started}`),
    line("Failed", `${r.scans.failed} of ${r.scans.started}`),
    line("Still in progress", `${r.scans.inProgress} of ${r.scans.started}`),
    "",
    "OWNERS",
    line("First sign-ins", `${r.signIns.first}`, "app_users"),
    line("Claims, supported", `${r.claims.supported}`, "workspace_claim_events (Google-verified)"),
    line("Claims, assisted", `${r.claims.assisted}`, "audit_events workspace.assigned"),
    "",
    "WORK — per location",
    line("First real draft", `${r.deliveryFunnel.firstDraft}`, "earliest output_versions row falls in the week"),
    line("First approved export", `${r.deliveryFunnel.firstApprovedExport}`, "earliest counted delivery falls in the week"),
    line("Repeat weekly export", `${r.deliveryFunnel.repeatWeeklyExport}`, "counted this week and in an earlier week"),
    line("Task runs failed", `${r.tasks.failed} of ${r.tasks.runs}`, "action_runs failed or timed out"),
    line("Missing input (now)", `${r.tasks.missingInputNow}`, "snapshot at report time"),
    line("Paid conversion", `not measurable — ${r.paidConversion.reason}`),
    "",
    "RECONCILIATION — every job created this week, internal included",
    line("scan_started", `${r.reconciliation.startedEvents} of ${r.reconciliation.jobsStarted} jobs ${gap(r.reconciliation.startedEvents, r.reconciliation.jobsStarted)}`),
    line("scan_completed", `${r.reconciliation.completedEvents} of ${r.reconciliation.jobsTerminal} terminal jobs ${gap(r.reconciliation.completedEvents, r.reconciliation.jobsTerminal)}`),
    "",
    "LIMITATIONS",
    ...r.limitations.map((text) => `  - ${text}`),
    "",
    "No targets: there is no measured baseline yet.",
  ].join("\n");
}
