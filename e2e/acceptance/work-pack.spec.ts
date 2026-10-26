import { randomUUID } from "node:crypto";
import type { Locator } from "@playwright/test";
import { test, expect, signIn } from "../../test/e2e/fixtures";
import { sql } from "../../test/e2e/environment";

/** A click made before the page hydrates is dropped, so repeat it until the thing it should open is there. Only for controls that open things. */
async function clickUntil(target: Locator, opened: Locator) {
  await expect(async () => {
    await target.click({ timeout: 3000 });
    await expect(opened).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 60000 });
}

// zh-HK strings, from lib/copy-workspace.ts (packs) and lib/copy-action.ts.
const DISCLOSURE = "最多會建立 3 份草稿。確認並匯出草稿前不會計算用量；每份匯出的草稿計為 1 次交付。";
const DRAFT_READY = "草稿已備妥";
const NEEDS_FACTS = "需要你補充資料";
const EXPORTED = "已匯出";

const quote = (value: unknown) => "'" + JSON.stringify(value).replaceAll("'", "''") + "'";

test("the starter pack becomes drafts, one is approved and exported, and starting again returns the same pack", async ({ page, merchant, environment }) => {
  const db = environment.db;
  const ws = merchant.workspaceId;
  const used = () => sql(db, `select coalesce(sum(approved_deliveries),0) from workspace_usage where workspace_id='${ws}';`);

  // Seed: a single-location workspace whose latest scan retained one unanswered review, and a brand profile with an
  // approved claim. These are the stored facts the pre-model gate reads, so review-response and website-basics can
  // reach a draft; visibility-content still lacks its three owner facts and must stop at "needs your facts".
  sql(db, `delete from locations where id='${merchant.otherLocationId}';`);
  const jobId = randomUUID();
  const observedAt = new Date().toISOString();
  const raw = { gbp: { rating: 4.2, reviews_count: 12, reviews: [{ rating: 3, text: "The service was slow on a busy evening.", time: observedAt, owner_response: null }] } };
  const modules = { gbp: { status: "measured", score: 60, confidence: "high", evidenceCollectedAt: observedAt, limitationCode: null } };
  sql(db, `insert into audit_jobs(id,share_slug,business_name,region,status,workspace_id,location_id,overall_score,score_coverage,module_results,completed_at,summary_en,raw_data) values ('${jobId}','work-pack-${jobId}','Acceptance work pack fixture','hk','done','${ws}','${merchant.locationId}',60,0.35,${quote(modules)},'${observedAt}','Fixture summary',${quote(raw)});
    insert into scan_snapshots(job_id,workspace_id,location_id,market,observed_at,overall_score,coverage,module_states,metrics) values ('${jobId}','${ws}','${merchant.locationId}','hk','${observedAt}',60,0.35,${quote(modules)},'{}');
    insert into brand_profiles(workspace_id,voice,approved_claims,languages) values ('${ws}','warm',array['Open daily from 11am'],array['en']);`);

  await signIn(page, environment, merchant);
  expect(used()).toBe("0");

  // 1. Actions › New › Starter pack (UX Phase 4 moved the pack off Today); no pack exists yet.
  const packPage = `/zh-HK/owner/${merchant.slug}/actions/new?mode=pack`;
  await page.goto(packPage);
  const card = page.locator(".pack-card");
  await expect(card.getByText(DISCLOSURE)).toBeVisible();
  const startButton = card.getByRole("button", { name: "開始套裝", exact: true });
  await expect(startButton).toBeEnabled();
  expect(sql(db, `select count(*) from work_packs where workspace_id='${ws}';`)).toBe("0");

  // 2. Start: three items appear; two reach draft ready and the FAQ item asks for facts.
  // Start is idempotent, so a click dropped before hydration is repeated until the pack items are there.
  const rows = card.locator("li[data-template]");
  await expect(async () => {
    if ((await rows.count()) === 0) await startButton.click({ timeout: 3000 });
    await expect(rows).toHaveCount(3, { timeout: 5000 });
  }).toPass({ timeout: 60000 });
  const row = (template: string) => card.locator(`li[data-template="${template}"]`);
  await expect(row("review-response").getByText(DRAFT_READY)).toBeVisible({ timeout: 90000 });
  await expect(row("website-basics").getByText(DRAFT_READY)).toBeVisible({ timeout: 90000 });
  await expect(row("visibility-content").getByText(NEEDS_FACTS)).toBeVisible({ timeout: 90000 });
  expect(sql(db, `select count(*) from work_packs where workspace_id='${ws}' and closed_at is null;`)).toBe("1");
  expect(sql(db, `select string_agg(template_key, ',' order by position) from work_pack_items i join work_packs p on p.id=i.pack_id where p.workspace_id='${ws}';`)).toBe("review-response,visibility-content,website-basics");
  const packId = sql(db, `select id from work_packs where workspace_id='${ws}' and closed_at is null;`);
  // Drafts exist, nothing is approved or counted, and the pack stores no approval or delivery state of its own.
  expect(sql(db, `select count(*) from output_versions v join work_pack_items i on i.action_id=v.action_id where i.pack_id='${packId}' and v.approval_state='draft';`)).toBe("2");
  expect(used()).toBe("0");
  await expect(card.getByRole("button", { name: /確認|匯出/ })).toHaveCount(0);

  // 3. "Review next" opens the review-response action page, where the draft is approved and exported.
  const reviewNext = card.getByRole("link", { name: "審閱下一份" });
  await expect(reviewNext).toBeVisible();
  const reviewResponseActionId = sql(db, `select action_id from work_pack_items where pack_id='${packId}' and template_key='review-response';`);
  await reviewNext.click();
  await expect(page).toHaveURL(new RegExp(`/actions/${reviewResponseActionId}`));
  await expect(page.locator(".approval-panel").getByRole("button", { name: "確認呢一版", exact: true })).toBeEnabled();
  await clickUntil(page.locator(".approval-panel").getByRole("button", { name: "確認呢一版", exact: true }), page.getByRole("dialog"));
  await page.getByRole("dialog").getByRole("button", { name: "確認呢一版", exact: true }).click();
  const why = page.locator("details.owner-workflow-disclosure");
  await why.locator(":scope > summary").click();
  await expect(why.getByRole("button", { name: "下載文字檔", exact: true })).toBeEnabled();
  const download = page.waitForEvent("download");
  await why.getByRole("button", { name: "下載文字檔", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/-v1\.md$/);
  await expect.poll(used).toBe("1");

  // The starter pack now shows that item as exported (the other items are unchanged).
  await page.goto(packPage);
  await expect(card.locator(`li[data-template="review-response"]`).getByText(EXPORTED)).toBeVisible();
  await expect(card.locator(`li[data-template="website-basics"]`).getByText(DRAFT_READY)).toBeVisible();

  // 4. Starting again returns the same pack: the card shows the pack, not Start, so the call is made directly.
  await expect(card.getByRole("button", { name: "開始套裝", exact: true })).toHaveCount(0);
  const again = await page.request.post(`/api/workspaces/${ws}/packs`, { data: { location_id: merchant.locationId } });
  expect(again.status()).toBe(201);
  const body = await again.json() as { pack: { pack: { id: string } }; created: boolean };
  expect(body.created).toBe(false);
  expect(body.pack.pack.id).toBe(packId);
  expect(sql(db, `select count(*) from work_packs where workspace_id='${ws}' and closed_at is null;`)).toBe("1");
  expect(sql(db, `select count(*) from work_pack_items where pack_id='${packId}';`)).toBe("3");
  expect(used()).toBe("1");
});
