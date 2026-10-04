import { randomUUID } from "node:crypto";
import { test, expect } from "../../test/e2e/fixtures";
import { sql } from "../../test/e2e/environment";

import { copy } from "@/lib/copy";
import { interpolate } from "@/lib/share";

/**
 * P4.5 acceptance: a visitor who unlocked a report through the real unlock form
 * gets one unsaved AI review-reply draft from the fixture model, and a second
 * try for the same grant is refused. The only rows the preview writes are
 * preview_events; nothing reaches the workspace tables, and no text is stored.
 */

const LOCALE = "en";
const c = copy[LOCALE].funnel;
const p = c.preview;

// Exactly 40 characters: the visitor's pasted review. It must never reach the database.
const REVIEW = "Lovely noodles but the wait was too long";

// Tables the preview must never write to (constraints: "No writes outside preview_events").
const UNTOUCHED = ["actions", "action_runs", "output_versions", "deliveries", "workspace_usage"] as const;

test("an unlocked viewer gets one unsaved reply draft", async ({ page, browser, environment }) => {
  const db = environment.db;
  expect([...REVIEW]).toHaveLength(40);
  // The literal spec §3 strings, so a copy edit cannot quietly pass this journey.
  expect(p.cardTitle).toBe("Try one AI reply draft (not saved)");
  expect(p.badge).toBe("Unclaimed draft · not saved");
  expect(copy["zh-HK"].funnel.preview.badge).toBe("未認領草稿 · 未儲存");

  // A finished public report (no workspace), as a fixture scan leaves it.
  const jobId = randomUUID();
  const slug = `preview-${jobId.slice(0, 12)}`;
  sql(db, `insert into audit_jobs(id,share_slug,business_name,region,status,overall_score,score_coverage,module_results,completed_at) values ('${jobId}','${slug}','Acceptance preview fixture','hk','done',62,0.35,'{"ig":{"status":"unavailable","score":null},"gbp":{"status":"measured","score":70,"confidence":"high"}}',now());`);
  const counts = () => Object.fromEntries(UNTOUCHED.map((table) => [table, sql(db, `select count(*) from ${table};`)]));
  const before = counts();

  // 1. The public report carries no preview card; unlock it through the real form.
  await page.goto(`/${LOCALE}/r/${slug}`);
  const unlockCta = page.getByRole("link", { name: c.report.unlockButton }).first();
  await expect(unlockCta).toBeVisible();
  await expect(page.getByRole("link", { name: p.cardTitle })).toHaveCount(0);
  await unlockCta.click();
  await page.waitForURL(new RegExp(`/unlock/${slug}`));

  const emailChannel = page.getByRole("radio", { name: c.unlock.channels.email, exact: true });
  if (await emailChannel.isVisible().catch(() => false)) await emailChannel.click();
  await page.getByPlaceholder(c.unlock.placeholders.email).fill("preview-viewer@example.com");
  await page.getByRole("checkbox", { name: c.unlock.deliveryTitle }).check();
  const unlocked = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/api/report-access/unlock"));
  await page.getByRole("button", { name: c.unlock.submit, exact: true }).click();
  expect((await unlocked).status()).toBe(200);
  await page.waitForURL(/\/(r|owner)\//, { timeout: 30_000 });

  // 2. The unlocked report shows the card; it opens /start for this report.
  await page.goto(`/${LOCALE}/r/${slug}`);
  const card = page.getByRole("link", { name: p.cardTitle });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("href", `/${LOCALE}/start/${slug}`);
  await card.click();
  await page.waitForURL(new RegExp(`/${LOCALE}/start/${slug}$`));
  await expect(page.getByText(p.badge).first()).toBeVisible();

  /** Paste the review and choose four stars, once the form is hydrated (the counter only moves after hydration). */
  async function fillForm() {
    const field = page.getByLabel(p.reviewLabel);
    await expect(async () => {
      await field.fill("");
      await field.fill(REVIEW);
      await expect(page.getByTestId("preview-count")).toHaveText(interpolate(p.count, { count: 40 }), { timeout: 2000 });
    }).toPass({ timeout: 60_000 });
    const four = page.getByRole("radio", { name: interpolate(p.ratingOption, { rating: 4 }) });
    await four.click();
    await expect(four).toBeChecked();
  }

  /** Submit and return the route's JSON answer. */
  async function submit() {
    const answered = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes(`/api/start/${slug}/preview`));
    await page.getByRole("button", { name: p.submit }).click();
    const response = await answered;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toEqual({ review: REVIEW, rating: 4, locale: LOCALE });
    return (await response.json()) as { state: string; reason?: string; body?: string };
  }

  // 3–4. One draft: the badge, a non-empty body, the not-kept line and the claim CTA.
  await fillForm();
  const first = await submit();
  expect(first.state).toBe("generated");
  const result = page.getByTestId("preview-result");
  await expect(result).toBeVisible();
  await expect(result.getByText(p.badge)).toBeVisible();
  expect(first.body).toMatch(/\S/);
  await expect(result.getByText(first.body!)).toBeVisible();
  await expect(result.getByText(p.notKept)).toBeVisible();
  await expect(result.getByRole("button", { name: p.copy })).toBeVisible();
  const cta = result.getByRole("link", { name: p.cta });
  await expect(cta).toHaveAttribute("href", `/${LOCALE}/owner/sign-in?claim=${slug}`);
  // The result replaces the form: there is no way to regenerate from it.
  await expect(page.getByRole("button", { name: p.submit })).toHaveCount(0);

  // 5. A second try for the same grant is refused as already used.
  await page.goto(`/${LOCALE}/start/${slug}`);
  await fillForm();
  const second = await submit();
  expect(second).toEqual({ state: "refused", reason: "already_used" });
  // (Next's empty route announcer is also role=alert, so pick the form's alert by its text.)
  await expect(page.getByRole("alert").filter({ hasText: p.refusals.already_used })).toBeVisible();
  await expect(page.getByRole("alert").getByRole("link", { name: p.cta })).toHaveAttribute("href", `/${LOCALE}/owner/sign-in?claim=${slug}`);
  await expect(page.getByTestId("preview-result")).toHaveCount(0);

  // 6. Without the grant cookie, /start is a plain 404.
  const fresh = await browser.newContext({ baseURL: environment.app });
  try {
    const anonymous = await fresh.newPage();
    const response = await anonymous.goto(`/${LOCALE}/start/${slug}`);
    expect(response?.status()).toBe(404);
    await expect(anonymous.getByText(p.badge)).toHaveCount(0);
  } finally {
    await fresh.close();
  }

  // The database: nothing outside preview_events, one generated and one refused row, and no text anywhere.
  expect(counts()).toEqual(before);
  expect(sql(db, `select count(*) from preview_events where job_id='${jobId}';`)).toBe("2");
  expect(sql(db, `select count(*) from preview_events where job_id='${jobId}' and outcome='generated' and reason is null;`)).toBe("1");
  expect(sql(db, `select count(*) from preview_events where job_id='${jobId}' and outcome='refused' and reason='already_used';`)).toBe("1");
  const rows = sql(db, `select coalesce(json_agg(p)::text, '[]') from preview_events p where job_id='${jobId}';`);
  expect(JSON.parse(rows)).toHaveLength(2);
  for (const fragment of [REVIEW, "Lovely noodles", "wait was too long", first.body!]) expect(rows).not.toContain(fragment);
});
