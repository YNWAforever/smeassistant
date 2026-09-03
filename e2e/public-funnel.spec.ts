import { expect, test, type Locator, type Page } from "@playwright/test";

import { copy } from "@/lib/copy";

/**
 * The Phase 1 acceptance walk: /zh-HK/scan → scanning → report → unlock → full
 * report, with `SCAN_SOURCES=fixture` so no paid provider is ever called
 * (playwright.config.ts sets it; CLAUDE.md §0.1 and §3.2.1).
 *
 * Manual entry is deliberate, and not just a shortcut: it is the only path
 * through step 1 that never calls `POST /api/business/search`, which is
 * SerpApi-backed and therefore a paid provider. `manual_entry: true` also
 * makes the scan reach the IG-less fixture (`resolveFixtureName`), so the walk
 * exercises the "unavailable ≠ zero" case: IG unavailable, GBP + AEO measured.
 *
 * The scan itself still inserts an `audit_jobs` row and claims it through
 * `claim_audit_job`, so the spec needs a Supabase project. Without one the
 * whole file skips rather than failing — a missing service key is a
 * configuration state, not a regression.
 */
const SUPABASE_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const SERPAPI_CONFIGURED = Boolean(process.env.SERPAPI_API_KEY);

const LOCALE = "zh-HK" as const;
const BUSINESS = "錦汶館";
const c = copy[LOCALE].funnel;

/**
 * Industry values come from `INDUSTRIES_HK`; 餐飲 is offered verbatim.
 * 天后 is a neighbourhood, not one of the 18 administrative districts in
 * `DISTRICTS_HK`, so the walk prefers it if the picker ever offers it and
 * otherwise takes 東區 — the district Tin Hau actually sits in.
 */
const PREFERRED_OPTIONS = ["香港", "餐飲", "天后", "東區"];

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
  const combos = page.getByRole("combobox");
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

test.describe("public funnel", () => {
  test.skip(
    !SUPABASE_CONFIGURED,
    "NEXT_PUBLIC_SUPABASE_URL is not configured: starting a scan needs the shared Supabase project to insert and claim the audit_jobs row.",
  );

  test("manual scan reaches a report and unlocks it", async ({ page }) => {
    // --- Step 1: confirm business, manual entry (never calls the paid search) ---
    await page.goto(`/${LOCALE}/scan?market=hk&business=${encodeURIComponent(BUSINESS)}`);

    const businessField = page.getByLabel(c.scan.businessLabel);
    await expect(businessField).toBeVisible();
    await businessField.fill(BUSINESS);
    await page.getByRole("button", { name: c.scan.manualEntry, exact: true }).click();
    await expect(page.getByText(c.scan.manualTitle)).toBeVisible();

    // --- Steps 1→4: market, industry, district, objective, optional channels, consent ---
    for (let step = 0; step < 6 && !/\/scanning\//.test(page.url()); step += 1) {
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
    await page.getByRole("button", { name: c.unlock.submit, exact: true }).click();

    // --- Full report ---
    await page.waitForURL(/\/(r|owner)\//, { timeout: 30_000 });
    await page.goto(`/${LOCALE}/r/${slug}`);
    await expect(page.getByRole("link", { name: c.report.unlockButton })).toHaveCount(0);
    const full = await firstVisible(
      page.getByText(c.report.fullBadge).first(),
      page.getByText(c.report.viewerNote).first(),
    );
    expect(full, "the unlocked report should render the full view").not.toBeNull();
  });
});

/**
 * The only live-provider surface in the funnel. It is the reason step 1 above
 * uses manual entry, and it stays opt-in behind a real SerpApi key.
 */
test("business search returns candidates from the live provider", async ({ request }) => {
  test.skip(!SERPAPI_CONFIGURED, "SERPAPI_API_KEY is not set: /api/business/search calls a paid provider.");
  test.skip(!SUPABASE_CONFIGURED, "NEXT_PUBLIC_SUPABASE_URL is not configured: the route's rate limiter needs it.");

  const response = await request.post("/api/business/search", {
    data: { query: BUSINESS, market: "HK", sessionId: crypto.randomUUID() },
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { outcome: string; candidates: unknown[] };
  expect(["SUCCESS", "NO_RESULTS"]).toContain(body.outcome);
  expect(body.candidates.length).toBeLessThanOrEqual(8);
});
