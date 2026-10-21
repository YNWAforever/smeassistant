import type { Page } from "@playwright/test";
import type { Role, VisualStack } from "./shared";

/**
 * One captured screen state. `path` starting with "~" is relative to the workspace
 * (`/{locale}/owner/{slug}`). `sql` runs before the capture and `undo` after it, so a
 * state that needs different rows leaves the shared stack as it found it.
 */
export interface VisualState {
  name: string; role: Role; path: string;
  setup?: (page: Page, stack: VisualStack) => Promise<void>;
  sql?: (stack: VisualStack) => string; undo?: (stack: VisualStack) => string;
  /** Only at these widths (default: all requested). */
  widths?: number[];
}

const tab = (index: number) => async (page: Page) => {
  await page.locator(".detail-tab-list [role=tab]").nth(index).click();
  await page.waitForTimeout(300);
};
const period = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);

export function visualStates(stack: VisualStack): VisualState[] {
  const { ids } = stack;
  return [
    // Today and the shell
    { name: "today", role: "owner", path: "~" },
    { name: "today-viewer", role: "viewer", path: "~" },
    { name: "assistant", role: "owner", path: "~", setup: async (page) => { await page.locator(".workspace-topbar .assistant-launcher").first().click(); await page.waitForTimeout(600); } },
    // Actions queue
    { name: "actions", role: "owner", path: "~/actions" },
    { name: "actions-due", role: "owner", path: "~/actions?view=due" },
    { name: "actions-fixpack", role: "owner", path: "~/actions?view=fixpack" },
    { name: "actions-empty", role: "owner", path: "~/actions?channel=instagram&status=completed" },
    { name: "actions-viewer", role: "viewer", path: "~/actions" },
    { name: "actions-panel", role: "owner", path: `~/actions?open=${ids.draft}`, widths: [1440] },
    // Action detail: approved with two versions and a failed run, a draft, missing inputs
    { name: "action-approved", role: "owner", path: `~/actions/${ids.approved}` },
    { name: "action-evidence", role: "owner", path: `~/actions/${ids.approved}`, setup: tab(1) },
    { name: "action-workflow", role: "owner", path: `~/actions/${ids.approved}`, setup: tab(2) },
    { name: "action-history", role: "owner", path: `~/actions/${ids.approved}`, setup: tab(3) },
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
    { name: "insights", role: "owner", path: "~/insights" },
    { name: "new", role: "owner", path: "~/actions/new" },
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
  ];
}
