import { randomUUID } from "node:crypto";
import { test, expect, signIn } from "../../test/e2e/fixtures";
import { sql } from "../../test/e2e/environment";

/**
 * P4.1 acceptance (docs/superpowers/plans/2026-10-01-offer-promotion-copy.md Task 12):
 * one confirmed offer becomes three channel drafts; one approved export counts
 * once; editing the offer makes the other drafts unapprovable; the existing
 * review-reply flow still drafts.
 */
function hkDate(offsetDays: number): string {
  const day = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).format(day);
}

test("one confirmed offer: three drafts, one counted export, stale drafts blocked after an edit", async ({ page, merchant, environment }) => {
  test.setTimeout(240000);
  // One photo with confirmed rights, so the Instagram draft is not left waiting on a photo choice.
  const assetId = randomUUID();
  sql(environment.db, `insert into assets(id,workspace_id,location_id,kind,storage_path,filename,alt_text,rights_status,rights_confirmed_at) values ('${assetId}','${merchant.workspaceId}','${merchant.locationId}','image','fixture/${assetId}.jpg','lunch-set.jpg','A lunch set on a wooden table','approved',now());`);
  await signIn(page, environment, merchant);

  // 1. Offers is reachable from More.
  await page.goto(`/en/owner/${merchant.slug}/more`);
  await page.getByRole("link", { name: /^Offers/ }).click();
  await expect(page).toHaveURL(new RegExp(`/en/owner/${merchant.slug}/offers`));

  // 2. Create the offer.
  await page.getByRole("link", { name: /New offer/ }).click();
  await page.locator("#offer-title").fill("Weekday lunch set");
  await page.locator("#offer-details").fill("Soup, main and drink, Monday to Friday.");
  await page.locator("#offer-price").fill("88");
  await page.locator("#offer-starts").fill(hkDate(0));
  await page.locator("#offer-ends").fill(hkDate(30));
  await page.locator("#offer-terms").fill("Dine-in only. Not with other offers.");
  await page.locator("#offer-location").selectOption(merchant.locationId);
  await page.locator(`#offer-photo-${assetId}`).click();
  await page.getByRole("button", { name: /Save as draft/ }).click();
  await expect(page).toHaveURL(/\/offers\/[a-f0-9-]{36}$/);
  const offerUrl = page.url();
  const offerId = offerUrl.split("/").pop()!;

  // 3. Confirm.
  await page.locator("#offer-confirm").click();
  await page.getByRole("button", { name: /Confirm offer/ }).click();
  await expect(page.getByTestId("delivery-notice")).toBeVisible();
  expect(sql(environment.db, `select status||':'||revision from offers where id='${offerId}';`)).toBe("confirmed:1");

  // 4. All three channels are checked; the notice states 3 and 0 of 3 before anything is prepared.
  for (const key of ["offer-gbp-post", "offer-social-post", "offer-chat-message"]) await expect(page.locator(`#channel-${key}`)).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("delivery-notice")).toContainText("This prepares 3 separate drafts");
  await expect(page.getByTestId("delivery-notice")).toContainText("0 of 3 used");

  // 5–6. Prepare; every row reaches Ready to review.
  await page.getByRole("button", { name: /Prepare drafts/ }).click();
  for (const key of ["offer-gbp-post", "offer-social-post", "offer-chat-message"]) await expect(page.locator(`[data-template="${key}"] [data-status]`)).toHaveText("Ready to review", { timeout: 90000 });
  expect(sql(environment.db, `select count(*) from actions where offer_id='${offerId}';`)).toBe("3");
  expect(sql(environment.db, `select count(*) from output_versions v join actions a on a.id=v.action_id where a.offer_id='${offerId}' and v.meta->'offer'->>'revision'='1';`)).toBe("3");
  const actionFor = (template: string) => sql(environment.db, `select id from actions where offer_id='${offerId}' and template_key='${template}';`);

  // 7. Approve and export the Google draft: usage becomes 1 of 3.
  const google = actionFor("offer-gbp-post");
  await page.goto(`/en/owner/${merchant.slug}/actions/${google}`);
  await expect(page.locator(".action-detail-page")).toBeVisible();
  await page.getByRole("button", { name: /^Approve Version 1$/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Approve/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export approved version/ }).click();
  await downloadPromise;
  expect(sql(environment.db, `select approved_deliveries from workspace_usage where workspace_id='${merchant.workspaceId}';`)).toBe("1");
  await page.goto(offerUrl);
  await expect(page.getByTestId("delivery-notice")).toContainText("1 of 3 used");

  // 8. Copying the same approved version again counts nothing.
  const version = sql(environment.db, `select id from output_versions where action_id='${google}' and approval_state='approved';`);
  const copy = await page.request.post(`/api/versions/${version}/export`, { data: { mode: "copy", idempotency_key: randomUUID() } });
  expect(copy.status()).toBe(200);
  expect((await copy.json()).counted).toBe(false);
  expect(sql(environment.db, `select approved_deliveries from workspace_usage where workspace_id='${merchant.workspaceId}';`)).toBe("1");
  await page.reload();
  await expect(page.getByTestId("delivery-notice")).toContainText("1 of 3 used");

  // 9. Edit the price to 98: the offer goes back to draft, then is confirmed again.
  await page.getByRole("button", { name: /^Edit$/ }).click();
  await page.locator("#offer-price").fill("98");
  await page.getByRole("button", { name: /Save changes/ }).click();
  await expect.poll(() => sql(environment.db, `select status||':'||revision||':'||price_amount from offers where id='${offerId}';`)).toBe("draft:2:98.00");
  await page.goto(offerUrl);
  await page.locator("#offer-confirm").click();
  await page.getByRole("button", { name: /Confirm offer/ }).click();
  await expect.poll(() => sql(environment.db, `select status from offers where id='${offerId}';`)).toBe("confirmed");

  // 10. The chat draft was written from revision 1: the changed banner shows and approval is refused.
  const chat = actionFor("offer-chat-message");
  await page.goto(`/en/owner/${merchant.slug}/actions/${chat}`);
  await expect(page.locator('[data-binding="changed"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /^Approve Version 1$/ })).toBeDisabled();
  const chatVersion = sql(environment.db, `select id from output_versions where action_id='${chat}';`);
  const refused = await page.request.post(`/api/versions/${chatVersion}/approve`, { data: {} });
  expect(refused.status()).toBe(409);
  expect((await refused.json()).error).toBe("offer_changed");
  // The exported Google version stays copyable, still without counting.
  const recopy = await page.request.post(`/api/versions/${version}/export`, { data: { mode: "copy", idempotency_key: randomUUID() } });
  expect(recopy.status()).toBe(200);
  expect(sql(environment.db, `select approved_deliveries from workspace_usage where workspace_id='${merchant.workspaceId}';`)).toBe("1");

  // 11. The existing review-reply flow still drafts.
  await page.goto(`/en/owner/${merchant.slug}/actions/${merchant.actionId}`);
  await page.getByRole("button", { name: /Generate a draft|Regenerate/ }).click();
  await page.getByRole("tab", { name: "Version & audit history" }).click();
  await expect(page.locator(".version-list button")).toHaveCount(1, { timeout: 90000 });
});
