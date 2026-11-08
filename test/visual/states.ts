import type { Page } from "@playwright/test";
import type { Role, VisualStack } from "./shared";

/**
 * One captured screen state. `path` starting with "~" is relative to the workspace
 * (`/{locale}/owner/{slug}`). `sql` runs before the capture and `undo` after it, so a
 * state that needs different rows leaves the shared stack as it found it.
 */
export interface VisualState {
  /** "guest" captures without a session. */
  name: string; role: Role | "guest"; path: string;
  /** Runs before navigation, for request stubs. */
  before?: (page: Page, stack: VisualStack) => Promise<void>;
  setup?: (page: Page, stack: VisualStack) => Promise<void>;
  sql?: (stack: VisualStack) => string; undo?: (stack: VisualStack) => string;
  /** Only at these widths (default: all requested). */
  widths?: number[];
  /** Only in these colour schemes (default: all requested). */
  schemes?: string[];
}

const tab = (index: number) => async (page: Page) => {
  await page.locator(".detail-tab-list [role=tab]").nth(index).click();
  await page.waitForTimeout(300);
};
// Waits until the DOM has been quiet for 700 ms (at most 10 s), for content that arrives in stages.
const settle = (page: Page) => page.evaluate(() => new Promise<void>((resolve) => {
  let timer = setTimeout(done, 700);
  const observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(done, 700); });
  const cap = setTimeout(done, 10_000);
  function done() { observer.disconnect(); clearTimeout(cap); resolve(); }
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
}));

// Opens every closed disclosure in the page body, so content styled only when expanded is captured.
const openAll = async (page: Page) => {
  await page.locator("main details:not([open])").evaluateAll((all) => all.forEach((d) => d.setAttribute("open", "")));
  await page.waitForTimeout(300);
};
// Fixed scan status answers: the scanning page polls, and a real job would move on or redirect.
const scanStatus = (body: Record<string, unknown>) => async (page: Page) => {
  // A fixed clock keeps the elapsed time identical; the first poll is released in the setup step.
  await page.clock.install({ time: new Date("2026-10-12T02:00:00Z") });
  await page.route("**/api/scan/process", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "already_claimed" }) }));
  await page.route("**/api/scan/status**", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ shareSlug: null, processingStage: null, coverage: null, failureCorrelationId: null, ...body }) }));
};
const poll = async (page: Page) => {
  await page.clock.runFor(5_000);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
};
const click = (selector: string, nth = 0) => async (page: Page) => {
  await page.locator(selector).nth(nth).click();
  // Park the pointer: if the page scrolls after the click, whatever lands under it would show its hover style.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
};
// Dark mode exists only in the owner workspace, so public pages are captured in light only.
const LIGHT = ["light"];
const period = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);

export function visualStates(stack: VisualStack): VisualState[] {
  const { ids } = stack;
  return [
    // Today and the shell
    { name: "today", role: "owner", path: "~" },
    { name: "today-open", role: "owner", path: "~", setup: openAll },
    { name: "today-viewer", role: "viewer", path: "~" },
    { name: "assistant", role: "owner", path: "~", setup: async (page) => {
      await page.locator(".workspace-topbar .assistant-launcher").first().click();
      // The sheet loads its suggested question groups in more than one request.
      await page.waitForLoadState("networkidle");
      await settle(page);
    } },
    // Actions queue
    { name: "actions", role: "owner", path: "~/actions" },
    { name: "actions-due", role: "owner", path: "~/actions?view=due" },
    { name: "actions-fixpack", role: "owner", path: "~/actions?view=fixpack" },
    { name: "actions-empty", role: "owner", path: "~/actions?channel=instagram&status=completed" },
    { name: "actions-viewer", role: "viewer", path: "~/actions" },
    { name: "actions-panel", role: "owner", path: `~/actions?open=${ids.draft}`, widths: [1440] },
    // Action detail: approved with two versions and a failed run, a draft, missing inputs
    { name: "action-approved", role: "owner", path: `~/actions/${ids.approved}` },
    { name: "action-approved-open", role: "owner", path: `~/actions/${ids.approved}`, setup: openAll },
    { name: "action-evidence", role: "owner", path: `~/actions/${ids.approved}`, setup: tab(1) },
    { name: "action-workflow", role: "owner", path: `~/actions/${ids.approved}`, setup: async (page) => { await page.locator("details.owner-workflow-disclosure summary").click(); await page.waitForTimeout(300); } },
    { name: "action-history", role: "owner", path: `~/actions/${ids.approved}`, setup: tab(2) },
    { name: "action-draft", role: "owner", path: `~/actions/${ids.draft}` },
    { name: "action-needs-input", role: "owner", path: `~/actions/${ids.needsInput}` },
    { name: "action-viewer", role: "viewer", path: `~/actions/${ids.draft}` },
    { name: "action-allowance", role: "owner", path: `~/actions/${ids.approved}`,
      sql: (s) => `insert into workspace_usage(workspace_id,period,approved_deliveries,allowance) values ('${s.workspaceId}','${period()}',3,3) on conflict (workspace_id,period) do update set approved_deliveries=3, allowance=3;`,
      undo: (s) => `delete from workspace_usage where workspace_id='${s.workspaceId}';` },
    { name: "action-offline", role: "owner", path: `~/actions/${ids.draft}`, setup: async (page) => { await page.context().setOffline(true); await page.waitForTimeout(400); } },
    { name: "action-conflict", role: "owner", path: `~/actions/${ids.draft}`, setup: async (page) => {
      await page.route("**/api/actions/*/versions", (route) => route.request().method() === "POST"
        ? route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "version_conflict" }) }) : route.continue());
      const editor = page.locator(".draft-layout textarea").first();
      await editor.fill(`${await editor.inputValue()} Edited.`);
      await page.locator(".draft-editor-actions button").filter({ hasText: /save|儲存/i }).first().click();
      await page.locator(".conflict-state").first().waitFor({ timeout: 10_000 });
    } },
    // Insights, New, Business, Settings
    { name: "insights", role: "owner", path: "~/insights", setup: openAll },
    { name: "new", role: "owner", path: "~/actions/new" },
    { name: "new-offer", role: "owner", path: "~/actions/new?mode=offer" },
    { name: "new-pack", role: "owner", path: "~/actions/new?mode=pack" },
    { name: "business", role: "owner", path: "~/business" },
    { name: "profile", role: "owner", path: "~/business/profile" },
    { name: "locations", role: "owner", path: "~/business/locations" },
    { name: "assets", role: "owner", path: "~/business/assets" },
    { name: "integrations", role: "owner", path: "~/business/integrations" },
    { name: "integrations-viewer", role: "viewer", path: "~/business/integrations" },
    { name: "settings", role: "owner", path: "~/settings" },
    { name: "team", role: "owner", path: "~/settings/team" },
    { name: "plan", role: "owner", path: "~/settings/plan" },
    { name: "notifications", role: "owner", path: "~/settings/notifications" },
    { name: "activity", role: "owner", path: "~/settings/activity" },
    // Public site
    { name: "pub-landing", role: "guest", path: "", schemes: LIGHT },
    { name: "pub-scan", role: "guest", path: "/scan", schemes: LIGHT },
    { name: "pub-scan-error", role: "guest", path: "/scan", schemes: LIGHT, setup: click(".flow-card-footer button", 1) },
    { name: "pub-scan-manual", role: "guest", path: "/scan?business=Kam%20Man%20House", schemes: LIGHT, setup: async (page) => {
      // The name in the link starts a search; choose manual entry once its answer has arrived.
      await page.waitForLoadState("networkidle");
      await settle(page);
      await page.locator("button").filter({ hasText: /not my business|manual|手動|不是我的/i }).first().click();
      await page.waitForTimeout(400);
    } },
    { name: "pub-scanning", role: "guest", path: "/scanning/00000000-0000-4000-8000-000000000001", schemes: LIGHT,
      before: scanStatus({ status: "collecting", processingStage: "collecting_aeo" }), setup: poll },
    { name: "pub-scanning-failed", role: "guest", path: "/scanning/00000000-0000-4000-8000-000000000001", schemes: LIGHT,
      before: scanStatus({ status: "failed", processingStage: "failed", failureCorrelationId: "visual-fixture" }), setup: poll },
    { name: "pub-report", role: "guest", path: `/r/${stack.shareSlug}`, schemes: LIGHT },
    { name: "pub-report-member", role: "owner", path: `/r/${stack.shareSlug}`, schemes: LIGHT, setup: openAll },
    { name: "pub-unlock", role: "guest", path: `/unlock/${stack.shareSlug}`, schemes: LIGHT },
    { name: "pub-unlock-error", role: "guest", path: `/unlock/${stack.shareSlug}`, schemes: LIGHT, setup: async (page) => {
      // Submitting empty moves focus to the first missing field once the error renders.
      await click(".unlock-form-card button.w-full", -1)(page);
      await settle(page);
    } },
    { name: "pub-sample-report", role: "guest", path: "/sample-report", schemes: LIGHT, setup: openAll },
    { name: "pub-demo", role: "guest", path: "/demo-workspace", schemes: LIGHT },
    { name: "pub-pricing", role: "guest", path: "/pricing", schemes: LIGHT },
    { name: "pub-methodology", role: "guest", path: "/methodology", schemes: LIGHT },
    { name: "pub-trust", role: "guest", path: "/trust", schemes: LIGHT },
    { name: "pub-privacy", role: "guest", path: "/legal/privacy", schemes: LIGHT },
    { name: "pub-terms", role: "guest", path: "/legal/terms", schemes: LIGHT },
    { name: "pub-unsubscribe", role: "guest", path: "/unsubscribe", schemes: LIGHT },
    { name: "pub-sign-in", role: "guest", path: "/owner/sign-in", schemes: LIGHT },
    { name: "pub-onboarding", role: "owner", path: "/owner/onboarding", schemes: LIGHT },
    { name: "pub-select-workspace", role: "owner", path: "/owner/select-workspace", schemes: LIGHT },
    { name: "pub-404", role: "guest", path: "/no-such-page", schemes: LIGHT },
  ];
}
