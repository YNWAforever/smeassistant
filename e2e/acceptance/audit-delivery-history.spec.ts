import { mkdirSync, writeFileSync } from "node:fs";
import { test, expect, signIn, waitForHydration } from "../../test/e2e/fixtures";
import { sql } from "../../test/e2e/environment";

const evidence = ".superpowers/sdd/review-usage-reliability-20261017/browser";
mkdirSync(evidence, { recursive: true });

test("shows every version, approval, and repeated delivery audit without double-counting usage", async ({
  page,
  environment,
  merchant,
}) => {
  await signIn(page, environment, merchant);

  const first = await page.request.post(`/api/actions/${merchant.actionId}/versions`, {
    data: { body: "Original acceptance draft.", base_version_id: null },
  });
  expect(first.status()).toBe(201);
  const version1 = await first.json() as { versionId: string };

  const second = await page.request.post(`/api/actions/${merchant.actionId}/versions`, {
    data: { body: "Accepted review reply. Please leave another comment if we can help.", base_version_id: version1.versionId },
  });
  expect(second.status()).toBe(201);
  const version2 = await second.json() as { versionId: string; versionNo: number };

  const approved = await page.request.post(`/api/versions/${version2.versionId}/approve`, {
    data: { comment: "Approved after reviewing the exact saved version." },
  });
  expect(approved.status()).toBe(200);

  const firstKey = "audit-browser-first-export-20261017";
  const secondKey = "audit-browser-second-export-20261017";
  const firstExport = await page.request.post(`/api/versions/${version2.versionId}/export`, {
    data: { mode: "export", idempotency_key: firstKey },
  });
  expect(firstExport.status()).toBe(200);
  const delivery = await firstExport.json() as { deliveryId: string; counted: boolean; usage: { approved_deliveries: number } };
  expect(delivery).toMatchObject({ counted: true, usage: { approved_deliveries: 1 } });

  const replay = await page.request.post(`/api/versions/${version2.versionId}/export`, {
    data: { mode: "export", idempotency_key: firstKey },
  });
  expect(replay.status()).toBe(200);
  expect(await replay.json()).toMatchObject({
    deliveryId: delivery.deliveryId,
    counted: false,
    usage: { approved_deliveries: 1 },
  });

  const repeat = await page.request.post(`/api/versions/${version2.versionId}/export`, {
    data: { mode: "export", idempotency_key: secondKey },
  });
  expect(repeat.status()).toBe(200);
  const freshDelivery = await repeat.json() as { deliveryId: string; counted: boolean; usage: { approved_deliveries: number } };
  expect(freshDelivery.deliveryId).not.toBe(delivery.deliveryId);
  expect(freshDelivery).toMatchObject({ counted: false, usage: { approved_deliveries: 1 } });

  const auditCounts = JSON.parse(sql(environment.db, `select json_build_object(
    'saved', count(*) filter (where event='version.created'),
    'approved', count(*) filter (where event='version.approved'),
    'exported', count(*) filter (where event='delivery.exported'),
    'published', count(*) filter (where event in ('delivery.published','content.published','version.published'))
  ) from audit_events where workspace_id='${merchant.workspaceId}';`));
  expect(auditCounts).toEqual({ saved: 2, approved: 1, exported: 2, published: 0 });

  const deliveryUsage = JSON.parse(sql(environment.db, `select json_build_object(
    'deliveries', (select count(*) from deliveries where workspace_id='${merchant.workspaceId}'),
    'counted', (select count(*) from deliveries where workspace_id='${merchant.workspaceId}' and counted),
    'usage', (select approved_deliveries from workspace_usage where workspace_id='${merchant.workspaceId}')
  );`));
  expect(deliveryUsage).toEqual({ deliveries: 2, counted: 1, usage: 1 });

  await page.goto(`/en/owner/${merchant.slug}/actions/${merchant.actionId}`);
  await waitForHydration(page);
  await expect(page.locator("#draft-content")).toHaveValue(
    "Accepted review reply. Please leave another comment if we can help.",
  );
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await page.locator(".history-layout > details").locator(":scope > summary").click();
  const auditList = page.locator(".audit-mini");
  await expect(auditList).toBeVisible();
  await expect(auditList.getByText("Version saved", { exact: true })).toHaveCount(2);
  await expect(auditList.getByText("Version approved", { exact: true })).toHaveCount(1);
  await expect(auditList.getByText("Export recorded", { exact: true })).toHaveCount(2);
  const usage = page.locator(".usage-mini");
  await expect(usage.getByText("Used this month", { exact: true })).toBeVisible();
  await expect(usage.getByText("1 / 3", { exact: true })).toBeVisible();
  await page.screenshot({ path: `${evidence}/audit-delivery-history.png`, fullPage: true });

  writeFileSync(`${evidence}/audit-delivery-history.json`, JSON.stringify({
    environment: "owned local DB/Auth/model fixtures; no model request",
    result: "PASS",
    version1Id: version1.versionId,
    version2,
    firstDelivery: delivery,
    repeatedDelivery: freshDelivery,
    auditCounts,
    deliveryUsage,
  }, null, 2));
});

test("bilingual completed-page reloads preserve exact version, approval, delivery, application, audit and monthly usage", async ({
  page,
  browser,
  environment,
  merchant,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, environment, merchant);
  const savedBody = "Synthetic saved review reply. Thank you for your feedback.";
  const first = await page.request.post(`/api/actions/${merchant.actionId}/versions`, {
    data: { body: "Synthetic original reply.", base_version_id: null },
  });
  expect(first.status()).toBe(201);
  const version1 = await first.json() as { versionId: string };
  const second = await page.request.post(`/api/actions/${merchant.actionId}/versions`, {
    data: { body: savedBody, base_version_id: version1.versionId },
  });
  expect(second.status()).toBe(201);
  const version2 = await second.json() as { versionId: string };
  expect((await page.request.post(`/api/versions/${version2.versionId}/approve`, { data: {} })).status()).toBe(200);
  expect((await page.request.post(`/api/versions/${version2.versionId}/export`, {
    data: { mode: "export", idempotency_key: "fixture-bilingual-reload-export" },
  })).status()).toBe(200);
  expect((await page.request.post(`/api/actions/${merchant.actionId}/applied`, {
    data: { output_version_id: version2.versionId },
  })).status()).toBe(201);

  // All setup mutations above target this test's owned Docker fixture.
  // From this point, navigating and reloading must leave the durable records unchanged.
  const snapshot = () => JSON.parse(sql(environment.db, `select json_build_object(
    'action', (select row_to_json(a) from (select action_state,completed_at from actions where id='${merchant.actionId}') a),
    'versions', (select coalesce(json_agg(v order by v.version_no),'[]') from
      (select id,version_no,body,approval_state,delivery_state,first_exported_at from output_versions where action_id='${merchant.actionId}') v),
    'approvals', (select coalesce(json_agg(v order by v.version_no),'[]') from
      (select id,version_no,approved_by,approved_at,reviewer_comment from output_versions where action_id='${merchant.actionId}') v),
    'deliveries', (select coalesce(json_agg(d order by d.id),'[]') from
      (select id,version_id,mode,state,counted,idempotency_key from deliveries where workspace_id='${merchant.workspaceId}') d),
    'applications', (select coalesce(json_agg(a order by a.id),'[]') from
      (select id,action_id,output_version_id,source,asserted_by,asserted_at,retracted_at from action_applications where workspace_id='${merchant.workspaceId}') a),
    'audit', (select coalesce(json_agg(e order by e.id),'[]') from
      (select id,event,entity_type,entity_id,payload,created_at from audit_events where workspace_id='${merchant.workspaceId}') e),
    'usage', (select coalesce(json_agg(u order by u.period),'[]') from
      (select period,approved_deliveries,allowance from workspace_usage where workspace_id='${merchant.workspaceId}') u)
  );`)) as {
    action: { action_state: string };
    versions: { id: string; version_no: number; approval_state: string }[];
    applications: { output_version_id: string; source: string }[];
    usage: { period: string; approved_deliveries: number; allowance: number }[];
  };
  const before = snapshot();
  expect(before.action.action_state).toBe("completed");
  expect(before.versions).toHaveLength(2);
  expect(before.versions[1]).toMatchObject({ id: version2.versionId, version_no: 2, approval_state: "approved" });
  expect(before.applications).toEqual([expect.objectContaining({ output_version_id: version2.versionId, source: "owner_asserted" })]);
  expect(before.usage).toEqual([expect.objectContaining({ approved_deliveries: 1, allowance: 3 })]);
  const period = before.usage[0].period;
  const mutations: string[] = [];
  const pageErrors: string[] = [];
  const hydrationErrors: string[] = [];
  const requestErrors: string[] = [];
  const reads: Array<{ locale: string; route: string; load: string; width: number; scrollWidth: number }> = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && /hydration|hydrating|did not match/i.test(message.text())) hydrationErrors.push(message.text());
  });
  page.on("requestfailed", request => {
    const error = request.failure()?.errorText ?? "unknown";
    // RSC prefetch cancellation during an intentional navigation is distinct
    // from a failed loaded page. Keep real failures, without query parameters.
    if (!/ERR_ABORTED|cancelled|canceled|NS_BINDING_ABORTED/i.test(error)) {
      requestErrors.push(`${request.method()} ${new URL(request.url()).pathname}: ${error}`);
    }
  });
  page.on("response", response => {
    if (response.status() >= 500) requestErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      mutations.push(`${request.method()} ${path}`);
    }
  });

  const locales = ["en", "zh-HK", "en"] as const;
  for (const [localeIndex, locale] of locales.entries()) {
    const chinese = locale !== "en";
    const base = `/${locale}/owner/${merchant.slug}`;
    for (const route of ["action", "billing", "completed"] as const) {
      const path = route === "action" ? `${base}/actions/${merchant.actionId}`
        : route === "billing" ? `${base}/settings/plan` : `${base}/actions?view=completed`;
      expect((await page.goto(path))?.status()).toBe(200);
      for (const load of ["initial", "reload"] as const) {
        if (load === "reload") expect((await page.reload())?.status()).toBe(200);
        await waitForHydration(page);
        const dimensions = await page.evaluate(() => ({
          width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(dimensions.scrollWidth, `${locale} ${route} ${load} overflow`).toBeLessThanOrEqual(dimensions.width);
        reads.push({ locale, route, load, ...dimensions });
        await expect(page).toHaveURL(new RegExp(`/${locale}/owner/${merchant.slug}/`));
        if (route === "action") {
          await expect(page.locator("#draft-content")).toHaveValue(savedBody);
          const why = page.locator("details.owner-workflow-disclosure");
          await why.locator(":scope > summary").click();
          await expect(why.locator(".action-detail-badges")).toContainText(chinese ? "已套用（店主回報）" : "Applied (reported)");
          await expect(why.locator(".action-verification-result")).toContainText(chinese ? "到 Google 核對回覆" : "Check the reply in Google");
          await expect(page.locator(".action-verification-result")).toContainText(chinese
            ? "目前來源無法核實這則 Google 評論的指定回覆。"
            : "Current sources cannot verify this specific Google review reply.");
          await page.getByRole("tab", { name: chinese ? "紀錄" : "History", exact: true }).click();
          await page.locator(".history-layout > details").locator(":scope > summary").click();
          const audit = page.locator(".audit-mini");
          await expect(audit).toBeVisible();
          await expect(audit.getByText(chinese ? "版本已確認" : "Version approved", { exact: true })).toHaveCount(1);
          await expect(audit.getByText(chinese ? "已記錄匯出" : "Export recorded", { exact: true })).toHaveCount(1);
          await expect(audit.getByText(chinese ? "標記為已套用" : "Marked as applied", { exact: true })).toHaveCount(1);
          await expect(audit.locator("p").filter({ hasText: chinese ? "版本已確認" : "Version approved" })).toContainText(chinese ? "第 2 版" : "Version 2");
          await expect(audit.locator("p").filter({ hasText: chinese ? "已記錄匯出" : "Export recorded" })).toContainText(chinese ? "第 2 版" : "Version 2");
          if (load === "reload") await page.screenshot({ path: testInfo.outputPath(`${locale}-mobile-completed.png`), fullPage: true });
        } else if (route === "billing") {
          await expect(page.locator(".usage-large")).toContainText("1 / 3");
          await expect(page.locator(".usage-large")).toContainText(period);
        } else {
          const card = page.locator(".action-card").filter({ has: page.getByRole("heading", { name: chinese ? "回覆評論" : "Reply to reviews", exact: true }) });
          await expect(card).toBeVisible();
          const why = card.locator("details.trust-disclosure");
          await expect(why).not.toHaveAttribute("open");
          const summary = why.locator(":scope > summary");
          await expect(summary).toHaveText(chinese ? "睇證據" : "See the evidence");
          // The state is on the card itself; the disclosure holds the evidence.
          await expect(card.getByText(chinese ? "已套用（店主回報）" : "Applied (reported)", { exact: true })).toBeVisible();
          await summary.click();
          await expect(why).toHaveAttribute("open", "");
        }
        expect(snapshot(), `${locale} ${route} ${load} must not mutate durable records`).toEqual(before);
        expect(mutations).toEqual([]);
      }
    }
    const nextLocale = locales[localeIndex + 1];
    if (nextLocale) {
      await page.getByRole("combobox", { name: chinese ? "介面語言" : "Language", exact: true }).click();
      await page.getByRole("option", { name: nextLocale === "en" ? "English" : "繁體中文（香港）", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${nextLocale}/owner/${merchant.slug}/actions\\?view=completed`));
      await waitForHydration(page);
      expect(snapshot(), "language picker must preserve durable records").toEqual(before);
      expect(mutations).toEqual([]);
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/en/owner/${merchant.slug}/actions/${merchant.actionId}`);
  await waitForHydration(page);
  const why = page.locator("details.owner-workflow-disclosure");
  await why.locator(":scope > summary").click();
  await expect(why.locator(".action-detail-badges")).toContainText("Applied (reported)");
  await page.screenshot({ path: testInfo.outputPath("en-desktop-completed.png"), fullPage: true });
  expect(snapshot()).toEqual(before);
  expect(mutations).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(hydrationErrors).toEqual([]);
  expect(requestErrors).toEqual([]);
  writeFileSync(testInfo.outputPath("read-only-reload-result.json"), JSON.stringify({
    layer: "Owned local PostgreSQL + synthetic Auth/model fixtures; not hosted Google acceptance",
    browser: browser.browserType().name(), version: browser.version(),
    mobileViewport: { width: 390, height: 844 }, desktopViewport: { width: 1440, height: 900 },
    period, usage: before.usage, reads, mutations, pageErrors, hydrationErrors, requestErrors,
    durableRecordsUnchanged: true,
  }, null, 2));
});
