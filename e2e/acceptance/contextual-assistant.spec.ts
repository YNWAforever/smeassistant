import { test, expect, signIn } from "../../test/e2e/fixtures";
import { sql } from "../../test/e2e/environment";

/**
 * The owner assistant sheet was removed on owner surfaces. Every owner entry is
 * now the single Kinnso link with an allowlisted `ask` key; it carries context
 * in the URL and never free text, a model call, or an approval/export action.
 * The action header only renders that link when the conversation flags are on,
 * so this spec needs the same prerequisite as the Studio acceptance suite.
 */
const STUDIO_ENABLED = process.env.CONVERSATION_STUDIO_ENABLED === "true";

test("owner surfaces expose only allowlisted Kinnso links, never the old assistant sheet", async ({ page, merchant, environment }) => {
  test.skip(!STUDIO_ENABLED, "requires CONVERSATION_STUDIO_ENABLED=true in the acceptance app env");

  await signIn(page, environment, merchant);
  const requested: string[] = [];
  page.on("request", (request) => { requested.push(`${request.method()} ${new URL(request.url()).pathname}`); });

  // Today: no inline assistant, no dialog; three concrete Kinnso suggestions.
  await page.goto(`/en/owner/${merchant.slug}?location=primary`);
  await expect(page.locator(".assistant-launcher")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const suggestions = page.locator(".home-v2-ask a[href*='ask=']");
  await expect(suggestions).toHaveCount(3);
  for (const key of ["write_ig", "reply_reviews", "plan_week"]) {
    await expect(page.locator(`.home-v2-ask a[href*="ask=${key}"]`)).toHaveCount(1);
  }

  // The task page keeps the exact action context and the allowlisted ask key,
  // but no free-text field and no authority route.
  await page.goto(`/en/owner/${merchant.slug}/actions/${merchant.actionId}?location=primary`);
  await expect(page.locator(".action-detail-page")).toBeVisible();
  const kinnso = page.getByRole("link", { name: "Ask Kinnso", exact: true }).first();
  await expect(kinnso).toBeVisible();
  const href = await kinnso.getAttribute("href");
  expect(href).toContain(`/owner/${merchant.slug}/conversation?`);
  expect(href).toContain(`action=${merchant.actionId}`);
  expect(href).toContain("ask=revise_action");
  expect(href).not.toMatch(/(?:^|[?&])(q|prompt|message|text)=/);

  expect(requested.some((entry) => entry.startsWith("POST /api/assistant/"))).toBe(false);
  expect(requested.filter((entry) => /\/api\/versions\/[^/]+\/(approve|request-changes|reject|export)/.test(entry))).toEqual([]);
  expect(sql(environment.db, `select count(*) from output_versions where workspace_id='${merchant.workspaceId}';`)).toBe("0");
  expect(sql(environment.db, `select approved_deliveries from workspace_usage where workspace_id='${merchant.workspaceId}';`)).toBe("0");
});
