# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: merchant-loop.spec.ts >> unavailable LLM output cannot create or approve a version or charge usage
- Location: e2e\acceptance\merchant-loop.spec.ts:73:68

# Error details

```
Error: apiRequestContext.post: read ECONNRESET
Call log:
  - → POST http://localhost:61156/api/actions/90e71732-ee1c-46dd-b1cc-331e93e20b53/run
    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.7827.55 Safari/537.36
    - accept: */*
    - accept-encoding: gzip,deflate,br
    - content-type: application/json
    - content-length: 15
    - cookie: sme_local_fixture_session=lsAdMGQp52gHAG1qvjuZPr1AcQSVy1kyAlN3jYbdE_4

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e5]:
        - link "Visibility Workspace" [ref=e6] [cursor=pointer]:
          - /url: /en/owner/acceptance-hk-5021b276
          - img [ref=e8]
          - generic [ref=e11]:
            - strong [ref=e12]: Visibility
            - generic [ref=e13]: Workspace
        - link "Switch workspace or location" [ref=e14] [cursor=pointer]:
          - /url: /en/owner/select-workspace
          - generic [ref=e15]: A
          - generic [ref=e16]:
            - strong [ref=e17]: Acceptance HK
            - generic [ref=e18]: Primary
          - img [ref=e19]
      - generic [ref=e21]:
        - generic [ref=e22]:
          - generic [ref=e23]: Operate
          - list [ref=e25]:
            - listitem [ref=e26]:
              - link "Home" [ref=e27] [cursor=pointer]:
                - /url: /en/owner/acceptance-hk-5021b276?location=primary
                - img [ref=e28]
                - generic [ref=e31]: Home
            - listitem [ref=e32]:
              - link "Actions" [ref=e33] [cursor=pointer]:
                - /url: /en/owner/acceptance-hk-5021b276/actions?location=primary
                - img [ref=e34]
                - generic [ref=e39]: Actions
            - listitem [ref=e40]:
              - link "Create" [ref=e41] [cursor=pointer]:
                - /url: /en/owner/acceptance-hk-5021b276/create?location=primary
                - img [ref=e42]
                - generic [ref=e45]: Create
            - listitem [ref=e46]:
              - link "Insights" [ref=e47] [cursor=pointer]:
                - /url: /en/owner/acceptance-hk-5021b276/insights?location=primary
                - img [ref=e48]
                - generic [ref=e50]: Insights
        - generic [ref=e51]:
          - generic [ref=e52]: Manage
          - list [ref=e54]:
            - listitem [ref=e55]:
              - link "Assets" [ref=e56] [cursor=pointer]:
                - /url: /en/owner/acceptance-hk-5021b276/assets?location=primary
                - img [ref=e57]
                - generic [ref=e61]: Assets
            - listitem [ref=e62]:
              - link "Offers" [ref=e63] [cursor=pointer]:
                - /url: /en/owner/acceptance-hk-5021b276/offers?location=primary
                - img [ref=e64]
                - generic [ref=e67]: Offers
            - listitem [ref=e68]:
              - link "Calendar" [ref=e69] [cursor=pointer]:
                - /url: /en/owner/acceptance-hk-5021b276/calendar?location=primary
                - img [ref=e70]
                - generic [ref=e72]: Calendar
            - listitem [ref=e73]:
              - link "Activity" [ref=e74] [cursor=pointer]:
                - /url: /en/owner/acceptance-hk-5021b276/activity?location=primary
                - img [ref=e75]
                - generic [ref=e77]: Activity
            - listitem [ref=e78]:
              - link "Brand profile" [ref=e79] [cursor=pointer]:
                - /url: /en/owner/acceptance-hk-5021b276/settings/brand?location=primary
                - img [ref=e80]
                - generic [ref=e83]: Brand profile
            - listitem [ref=e84]:
              - link "Integrations" [ref=e85] [cursor=pointer]:
                - /url: /en/owner/acceptance-hk-5021b276/settings/integrations?location=primary
                - img [ref=e86]
                - generic [ref=e89]: Integrations
            - listitem [ref=e90]:
              - link "Team & roles" [ref=e91] [cursor=pointer]:
                - /url: /en/owner/acceptance-hk-5021b276/settings/team?location=primary
                - img [ref=e92]
                - generic [ref=e97]: Team & roles
            - listitem [ref=e98]:
              - link "Plan & billing" [ref=e99] [cursor=pointer]:
                - /url: /en/owner/acceptance-hk-5021b276/settings/billing?location=primary
                - img [ref=e100]
                - generic [ref=e103]: Plan & billing
      - generic [ref=e104]:
        - generic [ref=e105]:
          - generic [ref=e106]:
            - generic [ref=e107]: Approved deliveries
            - strong [ref=e108]: 0 / 3
          - text: Generation, revisions and rejection use no allowance
        - button "O owner-5021b276-2b4f-4193-9101-6824d0cfddc6 Owner" [ref=e110]:
          - generic [ref=e111]: O
          - generic [ref=e112]:
            - strong [ref=e113]: owner-5021b276-2b4f-4193-9101-6824d0cfddc6
            - generic [ref=e114]: Owner
          - img [ref=e115]
    - main [ref=e119]:
      - generic [ref=e120]:
        - 'generic "Current section: Today" [ref=e121]':
          - generic [ref=e122]: Owner workspace/
          - strong [ref=e123]: Today
        - button "Ask operator" [ref=e124]:
          - img
          - generic [ref=e125]: Ask operator
        - link "Notifications, no unread" [ref=e126] [cursor=pointer]:
          - /url: /en/owner/acceptance-hk-5021b276/settings/notifications
          - img
        - combobox "Language" [ref=e127]:
          - generic: English
          - img
      - main [ref=e128]:
        - generic [ref=e129]:
          - generic [ref=e130]:
            - generic [ref=e131]:
              - paragraph [ref=e132]: No snapshot yet
              - heading "Your next visibility win is ready." [level=1] [ref=e133]
              - paragraph [ref=e134]: One clear action for today, backed by evidence and ready for your approval.
            - generic [ref=e135]:
              - generic [ref=e136]:
                - button "Rescan" [disabled]:
                  - img
                  - text: Rescan
                - generic [ref=e137]:
                  - text: Rescans are part of the Growth Workspace plan.
                  - link "See plans" [ref=e138] [cursor=pointer]:
                    - /url: /en/owner/acceptance-hk-5021b276/settings/billing
              - combobox "Choose location" [ref=e139]:
                - img
                - generic: Primary
                - img
          - region "AI Visibility Team status" [ref=e140]:
            - generic [ref=e141]:
              - img [ref=e143]
              - generic [ref=e146]:
                - generic [ref=e147]: Free plan
                - heading "AI Visibility Team finished the analysis · 0 decisions for you" [level=2] [ref=e148]
                - paragraph [ref=e149]: Specialists coordinate backstage; you review one priority action.
            - list [ref=e150]:
              - listitem [ref=e151]:
                - generic [ref=e152]: "1"
                - strong [ref=e153]: Scout complete
              - listitem [ref=e154]:
                - img [ref=e156]
                - strong [ref=e158]: Priority ready
              - listitem [ref=e159]:
                - generic [ref=e160]: "3"
                - strong [ref=e161]: 0 drafts prepared
              - listitem [ref=e162]:
                - generic [ref=e163]: "4"
                - strong [ref=e164]: Awaiting approval
            - generic [ref=e165]:
              - img [ref=e166]
              - text: Never auto-published · one delivery counts only after exact-version approval and export
          - region "Today's operating brief" [ref=e169]:
            - article [ref=e170]:
              - generic [ref=e171]:
                - generic [ref=e172]:
                  - img [ref=e173]
                  - text: Today’s priority
                - generic [ref=e176]: High
              - heading "Reply to reviews" [level=2] [ref=e177]
              - paragraph [ref=e178]: Fixture review
              - generic [ref=e179]:
                - generic [ref=e180]: Observed
                - generic [ref=e181]:
                  - strong [ref=e182]: Why now
                  - generic [ref=e183]: Observed 7 Oct 2026, 09:27 ·
              - generic [ref=e184]:
                - generic [ref=e185]:
                  - img [ref=e186]
                  - text: about 10 minutes owner time
                - generic [ref=e189]:
                  - img [ref=e190]
                  - text: Recommended
              - generic [ref=e195]:
                - link "Review drafts" [ref=e196] [cursor=pointer]:
                  - /url: /en/owner/acceptance-hk-5021b276/actions/90e71732-ee1c-46dd-b1cc-331e93e20b53?location=primary
                  - text: Review drafts
                  - img
                - button "Ask why this comes first" [ref=e197]:
                  - img
                  - generic [ref=e198]: Ask why this comes first
            - article [ref=e199]:
              - generic [ref=e200]:
                - generic [ref=e201]:
                  - img [ref=e202]
                  - text: What changed
                - generic [ref=e205]: Not comparable
              - generic [ref=e206]:
                - img [ref=e207]
                - heading "No snapshot yet" [level=2] [ref=e209]
                - paragraph [ref=e210]: Score and coverage appear here after the first scan completes.
              - link "Review comparable evidence" [ref=e211] [cursor=pointer]:
                - /url: /en/owner/acceptance-hk-5021b276/insights?location=primary
                - text: Review comparable evidence
                - img [ref=e212]
            - article [ref=e214]:
              - generic [ref=e215]:
                - generic [ref=e216]:
                  - img [ref=e217]
                  - text: Previous action outcome
                - generic [ref=e220]: Nothing measured yet
              - heading "Proof appears after an action is completed and a comparable scan lands" [level=2] [ref=e221]
              - paragraph [ref=e222]: The workspace only cites the difference between two comparable snapshots; it never infers unmeasured change.
              - link "Inspect before and after" [ref=e223] [cursor=pointer]:
                - /url: /en/owner/acceptance-hk-5021b276/insights?location=primary
                - text: Inspect before and after
                - img [ref=e224]
          - region "Small actions, visible momentum." [ref=e226]:
            - generic [ref=e227]:
              - generic [ref=e228]:
                - paragraph [ref=e229]: This month
                - heading "Small actions, visible momentum." [level=2] [ref=e230]
              - generic [ref=e231]:
                - img [ref=e232]
                - generic [ref=e236]:
                  - text: Rescan cadence
                  - strong [ref=e237]: None yet
            - generic [ref=e238]:
              - article [ref=e239]:
                - img [ref=e241]
                - generic [ref=e244]:
                  - strong [ref=e245]: "0"
                  - generic [ref=e246]: issues resolved
                - generic [ref=e247]: Across comparable scans
              - article [ref=e248]:
                - img [ref=e250]
                - generic [ref=e253]:
                  - strong [ref=e254]: "0"
                  - generic [ref=e255]: new regressions
                - generic [ref=e256]: None recorded
              - article [ref=e257]:
                - img [ref=e259]
                - generic [ref=e264]:
                  - strong [ref=e265]: "0"
                  - generic [ref=e266]: awaiting approval
                - generic [ref=e267]: Draft versions
              - article [ref=e268]:
                - img [ref=e270]
                - generic [ref=e273]:
                  - strong [ref=e274]: "0"
                  - generic [ref=e275]: actions completed
                - generic [ref=e276]: 0 measured
          - generic [ref=e277]:
            - generic [ref=e278]:
              - generic [ref=e279]:
                - generic [ref=e280]:
                  - paragraph [ref=e281]: Decision queue
                  - heading "Open actions" [level=2] [ref=e282]
                - link "View all" [ref=e283] [cursor=pointer]:
                  - /url: /en/owner/acceptance-hk-5021b276/actions?location=primary
                  - text: View all
                  - img
              - generic [ref=e284]:
                - paragraph [ref=e285]: 1 open actions; priority items shown below.
                - link "Reply to reviews Primary · Recommended about 10 minutes" [ref=e286] [cursor=pointer]:
                  - /url: /en/owner/acceptance-hk-5021b276/actions/90e71732-ee1c-46dd-b1cc-331e93e20b53?location=primary
                  - generic [ref=e288]:
                    - strong [ref=e289]: Reply to reviews
                    - generic [ref=e290]: Primary · Recommended
                  - generic [ref=e291]: about 10 minutes
                  - img [ref=e292]
            - generic [ref=e294]:
              - generic [ref=e295]:
                - generic [ref=e296]:
                  - paragraph [ref=e297]: Source reliability
                  - heading "Integration health" [level=2] [ref=e298]
                - link "Manage" [ref=e299] [cursor=pointer]:
                  - /url: /en/owner/acceptance-hk-5021b276/settings/integrations
              - generic [ref=e300]:
                - generic [ref=e301]:
                  - img [ref=e303]
                  - generic [ref=e305]:
                    - strong [ref=e306]: Google Business Profile
                    - text: Requires connection
                - generic [ref=e307]:
                  - img [ref=e309]
                  - generic [ref=e314]:
                    - strong [ref=e315]: Instagram public evidence
                    - text: Unavailable
                - generic [ref=e316]:
                  - img [ref=e318]
                  - generic [ref=e323]:
                    - strong [ref=e324]: Public website
                    - text: Unavailable
          - generic [ref=e325]:
            - generic [ref=e326]:
              - generic [ref=e327]:
                - paragraph [ref=e328]: Visibility starter pack
                - heading "Start your visibility starter pack" [level=2] [ref=e329]
              - img [ref=e330]
            - list [ref=e334]:
              - listitem [ref=e335]:
                - generic [ref=e336]:
                  - strong [ref=e337]: Reply to unanswered Google reviews
                  - generic [ref=e338]: Drafts follow your brand voice and each review's content, ready for one review pass.
              - listitem [ref=e339]:
                - generic [ref=e340]:
                  - strong [ref=e341]: Add clear FAQ answers for search and AI
                  - generic [ref=e342]: Answer the three questions search and AI surfaces could not find on your site.
              - listitem [ref=e343]:
                - generic [ref=e344]:
                  - strong [ref=e345]: Fix the website basics
                  - generic [ref=e346]: Title, description and heading copy that describes the business plainly.
            - paragraph [ref=e347]: "Creates up to 3 drafts. Nothing is counted until you approve and export a draft; each one you export counts as 1 delivery. This month: 0 of 3 used."
            - button "Start the pack" [ref=e349]:
              - img
              - text: Start the pack
          - generic [ref=e350]:
            - generic [ref=e351]:
              - generic [ref=e352]:
                - paragraph [ref=e353]: Recent change ledger
                - heading "Evidence before charts" [level=2] [ref=e354]
              - generic [ref=e355]: No scan yet
            - article [ref=e357]:
              - generic [ref=e358]: Unknown
              - generic [ref=e359]:
                - heading "Comparison unavailable" [level=3] [ref=e360]
                - paragraph [ref=e361]: No second comparable scan yet
                - text: Coverage gap · Not scored
              - link "Check source" [ref=e362] [cursor=pointer]:
                - /url: /en/owner/acceptance-hk-5021b276/settings/integrations
          - generic [ref=e363]:
            - img [ref=e364]
            - generic [ref=e367]: Every number comes from a stored scan snapshot; unmeasured sources lower coverage and are never scored as zero.
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e373] [cursor=pointer]:
    - img [ref=e374]
  - alert [ref=e377]: Today · SME Scanner
```

# Test source

```ts
  1  | import { readFileSync } from "node:fs";
  2  | import { randomUUID } from "node:crypto";
  3  | import { test, expect, signIn } from "../../test/e2e/fixtures";
  4  | import { sql } from "../../test/e2e/environment";
  5  | import { seedMerchant } from "../../test/e2e/seed";
  6  | 
  7  | for (const market of ["hk", "tw"] as const) test(`${market}: local fixture link redemption, exact draft approval/download, repeat usage and fresh edit`, async ({ page, environment }) => {
  8  |   const merchant = await seedMerchant(environment, market);
  9  |   const link = await signIn(page, environment, merchant);
  10 |   expect(sql(environment.db, `select count(*) from workspace_members where workspace_id='${merchant.workspaceId}' and accepted_at is not null;`)).toBe("1");
  11 |   sql(environment.db, `update actions set action_state='needs_input', required_inputs='["brand_voice","reviews_without_response","language"]'::jsonb, provided_inputs=provided_inputs-'brand_voice' where id='${merchant.actionId}';`);
  12 |   await page.goto(`/en/owner/${merchant.slug}/actions/${merchant.actionId}`);
  13 |   await expect(page.locator(".action-detail-page")).toBeVisible();
  14 |   await expect(page.locator("#input-brand_voice")).toBeVisible();
  15 |   await page.locator("#input-brand_voice").fill("warm");
  16 |   const savedInputs = page.waitForResponse(response => response.url().endsWith(`/api/actions/${merchant.actionId}`) && response.request().method() === "PATCH");
  17 |   await page.getByRole("button", { name: "Save inputs and generate", exact: true }).click();
  18 |   expect((await savedInputs).status()).toBe(200);
  19 |   expect(sql(environment.db, `select provided_inputs->>'brand_voice' from actions where id='${merchant.actionId}';`)).toBe("warm");
  20 |   expect(sql(environment.db, `select count(*) from audit_events where entity_id='${merchant.actionId}' and event='action.updated';`)).toBe("1");
  21 |   await page.getByRole("tab", { name: "Version & audit history" }).click();
  22 |   await expect(page.locator(".version-list button")).toHaveCount(1, { timeout: 90000 });
  23 |   await page.getByRole("tab", { name: "Draft & approval" }).click();
  24 |   await page.locator("#draft-content").fill("Edited version two: fixture acceptance.");
  25 |   await page.getByRole("button", { name: /Save manual edits/ }).click();
  26 |   await page.getByRole("tab", { name: "Version & audit history" }).click();
  27 |   await expect(page.locator(".version-list button")).toHaveCount(2);
  28 |   await page.getByRole("tab", { name: "Draft & approval" }).click();
  29 |   await page.getByRole("button", { name: /^Approve Version 2$/ }).click();
  30 |   await page.getByRole("dialog").getByRole("button", { name: /Approve/ }).click();
  31 |   const downloadPromise = page.waitForEvent("download");
  32 |   await page.getByRole("button", { name: /Export approved version/ }).click();
  33 |   const download = await downloadPromise;
  34 |   expect(download.suggestedFilename()).toMatch(/-v2\.md$/);
  35 |   expect(readFileSync((await download.path())!, "utf8")).toContain("Edited version two: fixture acceptance.");
  36 |   const version = sql(environment.db, `select id from output_versions where action_id='${merchant.actionId}' and version_no=2 and approval_state='approved';`);
  37 |   expect(version).toMatch(/^[a-f0-9-]{36}$/);
  38 |   const key = randomUUID();
  39 |   const deliveries: string[] = [];
  40 |   for (let i = 0; i < 2; i++) {
  41 |     const response = await page.request.post(`/api/versions/${version}/export`, { data: { mode: "copy", idempotency_key: key } });
  42 |     expect(response.status()).toBe(200);
  43 |     const result = await response.json(); expect(result.counted).toBe(false); deliveries.push(result.deliveryId);
  44 |   }
  45 |   expect(deliveries[0]).toMatch(/^[a-f0-9-]{36}$/);
  46 |   expect(deliveries[1]).toBe(deliveries[0]);
  47 |   expect(sql(environment.db, `select approved_deliveries from workspace_usage where workspace_id='${merchant.workspaceId}';`)).toBe("1");
  48 |   expect(sql(environment.db, `select count(*) from deliveries where id='${deliveries[0]}' and version_id='${version}' and mode='copy';`)).toBe("1");
  49 |   const appliedIds: string[] = [];
  50 |   for (let i = 0; i < 2; i++) {
  51 |     const response = await page.request.post(`/api/actions/${merchant.actionId}/applied`, { data: { output_version_id: version, note: "Synthetic local application; no external publication" } });
  52 |     expect(response.status()).toBe(i === 0 ? 201 : 200);
  53 |     appliedIds.push((await response.json()).applicationId);
  54 |   }
  55 |   expect(appliedIds[0]).toMatch(/^[a-f0-9-]{36}$/);
  56 |   expect(appliedIds[1]).toBe(appliedIds[0]);
  57 |   expect(sql(environment.db, `select id from action_applications where action_id='${merchant.actionId}' and output_version_id='${version}' and retracted_at is null;`)).toBe(appliedIds[0]);
  58 |   expect(sql(environment.db, `select action_state from actions where id='${merchant.actionId}';`)).toBe("completed");
  59 |   expect(sql(environment.db, `select count(*) from action_applications where action_id='${merchant.actionId}' and output_version_id='${version}' and retracted_at is null;`)).toBe("1");
  60 |   expect(sql(environment.db, `select count(*) from audit_events where entity_id='${merchant.actionId}' and event='action.applied';`)).toBe("1");
  61 |   const edit = await page.request.post(`/api/actions/${merchant.actionId}/versions`, { data: { body: "Fresh edit requires approval", base_version_id: version } });
  62 |   expect(edit.status()).toBe(201);
  63 |   const v3 = await edit.json() as { versionId: string; versionNo: number };
  64 |   expect(v3.versionNo).toBe(3);
  65 |   expect((await page.request.post(`/api/versions/${v3.versionId}/export`, { data: { mode: "copy", idempotency_key: randomUUID() } })).status()).toBe(409);
  66 |   await page.goto(`/zh-HK/owner/${merchant.slug}/settings/billing`);
  67 |   expect(sql(environment.db, `select market from workspaces where id='${merchant.workspaceId}';`)).toBe(market);
  68 |   if (market === "tw") await expect(page.locator("body")).toContainText(/TWD|NT\$/);
  69 |   await page.goto(link);
  70 |   await expect(page).toHaveURL(/error=/);
  71 | });
  72 | 
  73 | for (const mode of ["missing", "invalid", "unavailable"] as const) test(`${mode} LLM output cannot create or approve a version or charge usage`, async ({ page, merchant, environment }) => {
  74 |   await signIn(page, environment, merchant);
  75 |   await fetch(`${environment.llm}/mode`, { method: "POST", body: mode });
  76 |   try {
> 77 |     const response = await page.request.post(`/api/actions/${merchant.actionId}/run`, { data: { locale: "en" } });
     |                                         ^ Error: apiRequestContext.post: read ECONNRESET
  78 |     expect(response.status()).toBe(200);
  79 |     const body = await response.json();
  80 |     expect(body.versionId).toBeUndefined();
  81 |     expect(sql(environment.db, `select count(*) from output_versions where action_id='${merchant.actionId}';`)).toBe("0");
  82 |     expect(sql(environment.db, `select coalesce(sum(approved_deliveries),0) from workspace_usage where workspace_id='${merchant.workspaceId}';`)).toBe("0");
  83 |   } finally { await fetch(`${environment.llm}/mode`, { method: "POST", body: "success" }); }
  84 | });
  85 | 
```