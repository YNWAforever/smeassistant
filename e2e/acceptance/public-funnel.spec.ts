import { type Locator, type Page } from "@playwright/test";
import { test, expect } from "../../test/e2e/fixtures";
import { sql } from "../../test/e2e/environment";

import { copy } from "@/lib/copy";

/** Required local fixture funnel; never runs against a shared project. */



for (const MARKET of ["hk", "tw"] as const) {
const LOCALE = MARKET === "hk" ? "zh-HK" : "zh-TW";
const BUSINESS = "錦汶館";
const c = copy[LOCALE].funnel;

/**
 * Industry values come from `INDUSTRIES_HK`; 餐飲 is offered verbatim.
 * 天后 is a neighbourhood, not one of the 18 administrative districts in
 * `DISTRICTS_HK`, so the walk prefers it if the picker ever offers it and
 * otherwise takes 東區 — the district Tin Hau actually sits in.
 */
const PREFERRED_OPTIONS = MARKET === "hk" ? ["香港", "餐飲", "天后", "東區"] : ["台灣", "餐飲", "台北", "臺北"];

/** The first of the given locators that is actually on the page. */
async function firstVisible(...locators: Locator[]): Promise<Locator | null> {
  for (const locator of locators) {
    const candidate = locator.first();
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
}

/**
 * Pick a value in every select on the current step. The design system uses
 * Radix `Select` (role=combobox + a role=listbox popup), but a native <select>
 * is handled too so the spec does not depend on which primitive a field uses.
 */
async function answerSelects(page: Page): Promise<void> {
  const combos = page.locator(".flow-card").getByRole("combobox");
  for (let index = 0; index < (await combos.count()); index += 1) {
    const combo = combos.nth(index);
    if (!(await combo.isVisible().catch(() => false))) continue;

    const isNativeSelect = (await combo.evaluate((node) => node.tagName)) === "SELECT";
    if (isNativeSelect) {
      const labels = await combo.locator("option").allInnerTexts();
      const wanted = labels.findIndex((label) => PREFERRED_OPTIONS.some((option) => label.includes(option)));
      await combo.selectOption({ index: wanted >= 0 ? wanted : Math.min(1, labels.length - 1) });
      continue;
    }

    await combo.click();
    const options = page.getByRole("option");
    await options.first().waitFor({ state: "visible" });
    const labels = await options.allInnerTexts();
    const wanted = labels.findIndex((label) => PREFERRED_OPTIONS.some((option) => label.includes(option)));
    await options.nth(wanted >= 0 ? wanted : 0).click();
    await expect(options.first()).toBeHidden();
  }
}

/** Advance the wizard: the final step's button is "start", every other one "continue". */
async function advance(page: Page): Promise<void> {
  const button = await firstVisible(
    page.getByRole("button", { name: c.scan.start, exact: true }),
    page.getByRole("button", { name: c.scan.continue, exact: true }),
  );
  expect(button, "the scan wizard should offer a continue or start button").not.toBeNull();
  await button!.click();
}

test.describe(`${MARKET} public funnel`, () => {

  test("manual scan reaches a report and unlocks it", async ({ page, environment }) => {
    // --- Step 1: confirm business, manual entry (never calls the paid search) ---
    await page.goto(`/${LOCALE}/scan?market=${MARKET}&business=${encodeURIComponent(BUSINESS)}`);

    const businessField = page.getByLabel(c.scan.businessLabel);
    await expect(businessField).toBeVisible();
    await businessField.fill(BUSINESS);
    await page.getByRole("button", { name: c.scan.manualEntry, exact: true }).click();
    await expect(page.getByText(c.scan.manualTitle)).toBeVisible();

    // --- Steps 1→4: market, industry, district, objective, optional channels, consent ---
    for (let step = 0; step < 4; step += 1) {
      await answerSelects(page);
      const consent = page.getByRole("checkbox", { name: c.scan.consentTitle });
      if (await consent.isVisible().catch(() => false)) await consent.check();
      await advance(page);
      await page.waitForTimeout(250);
    }

    // --- Scanning ---
    await page.waitForURL(/\/scanning\//, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: c.scanning.title })).toBeVisible();

    // The page auto-navigates ~1.5s after the job reaches done|partial; the
    // explicit link is the fallback when the redirect is missed. Fixture scans
    // finish in seconds, but the poll allows the full live budget.
    await expect(async () => {
      const ready = page.getByRole("link", { name: c.scanning.readyButton });
      if (await ready.isVisible().catch(() => false)) await ready.click();
      expect(page.url(), "the scan should reach a report").toMatch(/\/r\//);
    }).toPass({ timeout: 120_000, intervals: [1_000, 2_000, 3_000] });

    const slug = new URL(page.url()).pathname.split("/r/")[1]!.replace(/\/$/, "");
    expect(slug).not.toHaveLength(0);

    // --- Public report: a score, or the withheld state — never a fake number ---
    const scored = page.getByText(/\d+\s*\/\s*100/).first();
    const withheld = page.getByText(c.report.withheldTitle).first();
    await expect(async () => {
      const shown = await firstVisible(scored, withheld);
      expect(shown, "the report should show a score or say why it is withheld").not.toBeNull();
    }).toPass({ timeout: 15_000 });

    // The locked preview always carries the unlock banner.
    const unlockCta = page.getByRole("link", { name: c.report.unlockButton }).first();
    await expect(unlockCta).toBeVisible();
    await unlockCta.click();
    await page.waitForURL(new RegExp(`/unlock/${slug}`));

    // --- Unlock: email delivery, delivery consent only (never bundled marketing) ---
    const emailChannel = await firstVisible(
      page.getByRole("radio", { name: c.unlock.channels.email, exact: true }),
      page.getByRole("tab", { name: c.unlock.channels.email, exact: true }),
      page.getByRole("button", { name: c.unlock.channels.email, exact: true }),
    );
    if (emailChannel) await emailChannel.click();

    const contact = await firstVisible(
      page.getByPlaceholder(c.unlock.placeholders.email),
      page.locator('input[type="email"]'),
      page.getByLabel(c.unlock.contactLabels.email, { exact: true }),
    );
    expect(contact, "the unlock form should offer an email field").not.toBeNull();
    await contact!.fill("owner@example.com");

    const delivery = page.getByRole("checkbox", { name: c.unlock.deliveryTitle });
    await delivery.check();
    const unlockRequest = page.waitForRequest((request) => request.method() === "POST" && request.url().includes("/api/report-access/unlock"));
    await page.getByRole("button", { name: c.unlock.submit, exact: true }).click();
    const payload = (await unlockRequest).postDataJSON();

    // --- Full report ---
    await page.waitForURL(/\/(r|owner)\//, { timeout: 30_000 });
    await page.goto(`/${LOCALE}/r/${slug}`);
    await expect(page.getByRole("link", { name: c.report.unlockButton })).toHaveCount(0);
    const full = await firstVisible(
      page.getByText(c.report.fullBadge).first(),
      page.getByText(c.report.viewerNote).first(),
    );
    expect(full, "the unlocked report should render the full view").not.toBeNull();
    expect((await page.request.post("/api/report-access/unlock", { data: payload })).status()).toBe(200);
    const job = JSON.parse(sql(environment.db, `select row_to_json(j) from (select id,status,overall_score,score_coverage,module_results from audit_jobs where share_slug='${slug}') j;`));
    expect(["done", "partial"]).toContain(job.status);
    expect(job.score_coverage).toBeLessThan(100);
    expect(job.module_results.ig.status).not.toBe("measured");
    expect(job.module_results.ig.score ?? null).toBeNull();
    expect(sql(environment.db, `select count(*) from leads where job_id='${job.id}';`)).toBe("1");
    expect(sql(environment.db, `select count(*) from consent_records where job_id='${job.id}' and consent_type='report_delivery' and granted;`)).toBe("1");
    expect(sql(environment.db, `select count(*) from consent_records where job_id='${job.id}' and consent_type='marketing' and granted;`)).toBe("0");
  });
});




}
