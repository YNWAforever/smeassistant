import { test, expect, signIn } from "../../test/e2e/fixtures";
import { sql } from "../../test/e2e/environment";

test("switching branches from an action leaves the old branch's editor and clears stale selection", async ({ page, merchant, environment }) => {
  await signIn(page, environment, merchant);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/en/owner/${merchant.slug}/actions/${merchant.actionId}?location=primary&version=old&open=${merchant.actionId}`);
  await page.locator(".workspace-mobile-brand").getByRole("combobox").click();
  await page.getByRole("option", { name: "Other", exact: true }).click();
  await expect(page).toHaveURL(`${environment.app}/en/owner/${merchant.slug}/actions?location=other`);
  await expect(page.locator(".action-detail-page")).toHaveCount(0);
  await expect(page.locator(".action-card")).toHaveCount(0);
});

for (const item of [
  { locale: "en", labels: ["Today", "To do", "Better?", "Shop"], more: "More", due: "Due", drafts: "Fimmick drafts", other: "Other ways to write", waiting: "Something is waiting for you", noScan: "No scan yet", trust: "Why you can trust this" },
  { locale: "zh-HK", labels: ["今日", "待辦", "好啲？", "舖"], more: "更多", due: "到期", drafts: "Fimmick 嘅稿", other: "其他寫法", waiting: "有一件等你", noScan: "未掃過", trust: "點解咁講" },
  { locale: "zh-TW", labels: ["今天", "待辦", "有好一點？", "店裡"], more: "更多", due: "到期", drafts: "Fimmick 準備的稿", other: "其他寫法", waiting: "有件事等你", noScan: "還沒掃過", trust: "為何可信" },
] as const) {
  test(`four mobile destinations, reachable settings and branch switching (${item.locale})`, async ({ page, merchant, environment }) => {
    await signIn(page, environment, merchant);
    await page.setViewportSize({ width: 375, height: 812 });
    const base = `/${item.locale}/owner/${merchant.slug}`;
    await page.goto(base);
    const nav = page.locator(".mobile-bottom-nav");
    await expect(nav.getByRole("link")).toHaveText([...item.labels]);
    const switcher = page.locator(".workspace-topbar .workspace-mobile-brand").getByRole("combobox");
    await expect(switcher).toHaveText("Primary");
    await switcher.click();
    await page.getByRole("option", { name: "Other", exact: true }).click();
    await expect(page).toHaveURL(/location=other/);
    await expect(switcher).toHaveText("Other");
    await nav.getByRole("link", { name: item.labels[3], exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/business\\?location=other$`));
    const rows = page.locator(".destination-list");
    for (const suffix of ["team", "plan", "notifications", "activity"]) {
      await expect(rows.locator(`a[href="${base}/settings/${suffix}?location=other"]`)).toHaveCount(1);
    }
    await expect(rows.locator(`a[href="/${item.locale}/owner/select-workspace"]`)).toHaveCount(1);
    await rows.locator(`a[href="${base}/settings/team?location=other"]`).click();
    await expect(nav.getByRole("link", { name: item.labels[3], exact: true })).toHaveAttribute("aria-current", "page");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // A one-branch shop has its name, with no redundant location control in the top bar.
    sql(environment.db, `delete from locations where id='${merchant.otherLocationId}';`);
    await page.goto(base);
    await expect(page.locator(".workspace-topbar .workspace-mobile-brand").getByRole("combobox")).toHaveCount(0);
  });

  test(`one waiting list, secondary views and three visible writing goals (${item.locale})`, async ({ page, merchant, environment }) => {
    await signIn(page, environment, merchant);
    const base = `/${item.locale}/owner/${merchant.slug}`;
    await page.goto(`${base}/actions`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(item.labels[1]);
    await expect(page.locator(".action-tab-list")).toHaveCount(0);
    await expect(page.locator(".filter-bar").getByRole("combobox")).toHaveCount(0);
    await expect(page.getByRole("searchbox")).toBeVisible();
    await expect(page.locator(".action-card .cap-live, .action-card .cap-beta, .action-card .cap-connection, .priority-reason")).toHaveCount(0);
    await expect(page.locator(".action-card .action-evidence")).toBeHidden();
    await page.locator(".action-card details > summary").first().click();
    await expect(page.locator(".action-card .action-evidence")).toBeVisible();
    const more = page.locator("details.queue-more");
    await expect(more).not.toHaveAttribute("open");
    await more.locator("summary").click();
    await more.getByRole("link", { name: item.due, exact: true }).click();
    await expect(page).toHaveURL(/view=due/);
    await page.goto(`${base}/actions?location=primary`);
    await page.locator("details.queue-more summary").click();
    await page.getByRole("link", { name: item.drafts, exact: true }).click();
    await expect(page).toHaveURL(/location=primary&view=fixpack/);
    await page.goto(`${base}/actions/new?location=primary`);
    await expect(page.locator(".goal-card:visible")).toHaveCount(3);
    const other = page.locator("details.other-goals");
    await expect(other).not.toHaveAttribute("open");
    await other.getByText(item.other, { exact: true }).click();
    expect(await page.locator(".goal-card:visible").count()).toBeGreaterThan(3);
    await other.locator(".goal-card").first().click();
    await expect(other.locator(".goal-card[aria-pressed=true]")).toHaveCount(1);
  });

  test(`choosing a shop shows work without exposing scores and opens its primary branch (${item.locale})`, async ({ page, merchant, environment }) => {
    // Waiting is based on all open work, including a medium-priority task before its first scan.
    sql(environment.db, `update actions set priority='medium' where id='${merchant.actionId}';`);
    await signIn(page, environment, merchant);
    await page.goto(`/${item.locale}/owner/select-workspace`);
    const card = page.getByRole("region", { name: "Acceptance HK", exact: true });
    await expect(card).toContainText(item.waiting);
    await expect(card).toContainText(item.noScan);
    await expect(card).not.toContainText(/Score|coverage|評分|覆蓋率|分數|涵蓋率/);
    await expect(card.locator(".ws-card-head")).toHaveAttribute("href", `/${item.locale}/owner/${merchant.slug}?location=primary`);
    await card.locator(".ws-card-head").click();
    await expect(page).toHaveURL(/location=primary/);
    await expect(page.locator(".brief-priority-card")).toBeVisible();
    await expect(page.locator("details.trust-disclosure > summary")).toHaveText(item.trust);
  });
}
