# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: merchant-loop.spec.ts >> tw: local fixture link redemption, exact draft approval/download, repeat usage and fresh edit
- Location: e2e\acceptance\merchant-loop.spec.ts:7:45

# Error details

```
Test timeout of 180000ms exceeded.
```

```
Error: locator.fill: Test timeout of 180000ms exceeded.
Call log:
  - waiting for locator('#input-brand_voice')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e5]:
        - link "Visibility Workspace" [ref=e6] [cursor=pointer]:
          - /url: /en/owner/acceptance-tw-8faa563a
          - img [ref=e8]
          - generic [ref=e11]:
            - strong [ref=e12]: Visibility
            - generic [ref=e13]: Workspace
        - link "Switch workspace or location" [ref=e14] [cursor=pointer]:
          - /url: /en/owner/select-workspace
          - generic [ref=e15]: A
          - generic [ref=e16]:
            - strong [ref=e17]: Acceptance TW
            - generic [ref=e18]: Primary
          - img [ref=e19]
      - generic [ref=e21]:
        - generic [ref=e22]:
          - generic [ref=e23]: Operate
          - list [ref=e25]:
            - listitem [ref=e26]:
              - link "Home" [ref=e27] [cursor=pointer]:
                - /url: /en/owner/acceptance-tw-8faa563a?location=primary
                - img [ref=e28]
                - generic [ref=e31]: Home
            - listitem [ref=e32]:
              - link "Actions" [ref=e33] [cursor=pointer]:
                - /url: /en/owner/acceptance-tw-8faa563a/actions?location=primary
                - img [ref=e34]
                - generic [ref=e39]: Actions
            - listitem [ref=e40]:
              - link "Create" [ref=e41] [cursor=pointer]:
                - /url: /en/owner/acceptance-tw-8faa563a/create?location=primary
                - img [ref=e42]
                - generic [ref=e45]: Create
            - listitem [ref=e46]:
              - link "Insights" [ref=e47] [cursor=pointer]:
                - /url: /en/owner/acceptance-tw-8faa563a/insights?location=primary
                - img [ref=e48]
                - generic [ref=e50]: Insights
        - generic [ref=e51]:
          - generic [ref=e52]: Manage
          - list [ref=e54]:
            - listitem [ref=e55]:
              - link "Assets" [ref=e56] [cursor=pointer]:
                - /url: /en/owner/acceptance-tw-8faa563a/assets?location=primary
                - img [ref=e57]
                - generic [ref=e61]: Assets
            - listitem [ref=e62]:
              - link "Offers" [ref=e63] [cursor=pointer]:
                - /url: /en/owner/acceptance-tw-8faa563a/offers?location=primary
                - img [ref=e64]
                - generic [ref=e67]: Offers
            - listitem [ref=e68]:
              - link "Calendar" [ref=e69] [cursor=pointer]:
                - /url: /en/owner/acceptance-tw-8faa563a/calendar?location=primary
                - img [ref=e70]
                - generic [ref=e72]: Calendar
            - listitem [ref=e73]:
              - link "Activity" [ref=e74] [cursor=pointer]:
                - /url: /en/owner/acceptance-tw-8faa563a/activity?location=primary
                - img [ref=e75]
                - generic [ref=e77]: Activity
            - listitem [ref=e78]:
              - link "Brand profile" [ref=e79] [cursor=pointer]:
                - /url: /en/owner/acceptance-tw-8faa563a/settings/brand?location=primary
                - img [ref=e80]
                - generic [ref=e83]: Brand profile
            - listitem [ref=e84]:
              - link "Integrations" [ref=e85] [cursor=pointer]:
                - /url: /en/owner/acceptance-tw-8faa563a/settings/integrations?location=primary
                - img [ref=e86]
                - generic [ref=e89]: Integrations
            - listitem [ref=e90]:
              - link "Team & roles" [ref=e91] [cursor=pointer]:
                - /url: /en/owner/acceptance-tw-8faa563a/settings/team?location=primary
                - img [ref=e92]
                - generic [ref=e97]: Team & roles
            - listitem [ref=e98]:
              - link "Plan & billing" [ref=e99] [cursor=pointer]:
                - /url: /en/owner/acceptance-tw-8faa563a/settings/billing?location=primary
                - img [ref=e100]
                - generic [ref=e103]: Plan & billing
      - generic [ref=e104]:
        - generic [ref=e105]:
          - generic [ref=e106]:
            - generic [ref=e107]: Approved deliveries
            - strong [ref=e108]: 0 / 3
          - text: Generation, revisions and rejection use no allowance
        - button "O owner-8faa563a-6eec-4ce8-a751-703cf0b2d942 Owner" [ref=e110]:
          - generic [ref=e111]: O
          - generic [ref=e112]:
            - strong [ref=e113]: owner-8faa563a-6eec-4ce8-a751-703cf0b2d942
            - generic [ref=e114]: Owner
          - img [ref=e115]
    - main [ref=e119]:
      - generic [ref=e120]:
        - 'generic "Current section: Review & approve" [ref=e121]':
          - generic [ref=e122]: Owner workspace/
          - strong [ref=e123]: Review & approve
        - button "Ask operator" [ref=e124]:
          - img
          - generic [ref=e125]: Ask operator
        - link "Notifications, no unread" [ref=e126] [cursor=pointer]:
          - /url: /en/owner/acceptance-tw-8faa563a/settings/notifications
          - img
        - combobox "Language" [ref=e127]:
          - generic: English
          - img
      - main [ref=e128]:
        - generic [ref=e129]:
          - generic [ref=e130]:
            - link "Back to actions" [ref=e131] [cursor=pointer]:
              - /url: /en/owner/acceptance-tw-8faa563a/actions?location=primary
              - img [ref=e132]
              - text: Back to actions
            - generic [ref=e134]:
              - combobox "Preview role" [ref=e135]:
                - img
                - generic: Owner
                - img
              - generic [ref=e136]:
                - img [ref=e137]
                - generic [ref=e139]: Online
          - generic [ref=e140]:
            - generic [ref=e141]:
              - generic [ref=e142]:
                - generic [ref=e143]: High
                - generic [ref=e144]: Needs input
                - generic [ref=e145]: Live
              - heading "Reply to reviews" [level=1] [ref=e146]
              - paragraph [ref=e147]: Fixture review
              - generic [ref=e148]:
                - generic [ref=e149]:
                  - img [ref=e150]
                  - text: Primary
                - generic [ref=e153]:
                  - img [ref=e154]
                  - text: about 10 minutes
                - generic [ref=e157]:
                  - img [ref=e158]
                  - text: Unassigned
            - generic [ref=e161]:
              - generic [ref=e162]: Direct next step
              - strong [ref=e163]: Generate the first draft
              - generic [ref=e164]: Due —
          - list "Action provenance and lifecycle" [ref=e165]:
            - listitem [ref=e166]:
              - img [ref=e168]
              - generic [ref=e170]:
                - strong [ref=e171]: Scan evidence
                - generic [ref=e172]: · 7 Oct 2026, 06:36
            - listitem [ref=e173]:
              - img [ref=e175]
              - strong [ref=e178]: Finding
            - listitem [ref=e179]:
              - img [ref=e181]
              - generic [ref=e183]:
                - strong [ref=e184]: Action
                - generic [ref=e185]: Priority factors recorded
            - listitem [ref=e186]:
              - img [ref=e188]
              - generic [ref=e190]:
                - strong [ref=e191]: Agent input
                - generic [ref=e192]: Inputs ready
            - listitem [ref=e193]:
              - generic [ref=e194]: "5"
              - generic [ref=e195]:
                - strong [ref=e196]: Run
                - generic [ref=e197]: Not run yet
            - listitem [ref=e198]:
              - generic [ref=e199]: "6"
              - generic [ref=e200]:
                - strong [ref=e201]: Output version
                - generic [ref=e202]: No version yet
            - listitem [ref=e203]:
              - generic [ref=e204]: "7"
              - generic [ref=e205]:
                - strong [ref=e206]: Approval
                - generic [ref=e207]: No version yet
            - listitem [ref=e208]:
              - generic [ref=e209]: "8"
              - generic [ref=e210]:
                - strong [ref=e211]: Export
                - generic [ref=e212]: Available after exact-version approval
            - listitem [ref=e213]:
              - generic [ref=e214]: "9"
              - generic [ref=e215]:
                - strong [ref=e216]: Measurement
                - generic [ref=e217]: Not eligible
          - generic [ref=e218]:
            - tablist [ref=e219]:
              - tab "Draft & approval" [selected] [ref=e220]
              - tab "Source evidence" [ref=e221]
              - tab "Workflow states" [ref=e222]
              - tab "Version & audit history" [ref=e223]
            - tabpanel "Draft & approval" [ref=e224]:
              - generic [ref=e225]:
                - generic [ref=e226]:
                  - generic [ref=e227]:
                    - generic [ref=e228]:
                      - paragraph [ref=e229]: Generated output
                      - heading "Review reply workflow" [level=2] [ref=e230]
                    - generic [ref=e232]: No version yet
                  - generic [ref=e233]:
                    - generic [ref=e234]: Observed
                    - generic [ref=e235]:
                      - strong [ref=e236]: Source finding
                      - paragraph
                      - generic [ref=e237]: 7 Oct 2026, 06:36 · Source preserved as evidence
                  - group [ref=e238]:
                    - generic "Business details used See what the next draft will use" [ref=e239]:
                      - strong [ref=e240]: Business details used
                      - text: See what the next draft will use
                  - generic [ref=e241]:
                    - generic [ref=e242]: Draft
                    - textbox "Draft" [ref=e243]:
                      - /placeholder: No draft yet. Generate one, or write here and save it as version 1.
                    - generic [ref=e245]: 0 characters
                  - generic [ref=e246]:
                    - generic [ref=e247]:
                      - img [ref=e248]
                      - generic [ref=e251]:
                        - strong [ref=e252]: Brand guardrail check
                        - text: Generated content uses owner-confirmed facts only.
                      - generic [ref=e253]: Not checked
                    - paragraph [ref=e254]:
                      - img [ref=e255]
                      - text: This version was not agent-checked (edited by hand).
                    - paragraph [ref=e258]: Do not add ingredients, allergens, pricing or offer dates unless the owner confirmed them.
                  - generic [ref=e259]:
                    - button "Revise with operator as a new version" [ref=e260]:
                      - img
                      - generic [ref=e261]: Revise with operator as a new version
                    - button "Generate a draft" [ref=e262]:
                      - img
                      - text: Generate a draft
                    - button "Save manual edits as a new version" [disabled]:
                      - img
                      - text: Save manual edits as a new version
                  - generic [ref=e263]:
                    - button "Mark as applied" [ref=e264]:
                      - img
                      - text: Mark as applied
                    - paragraph [ref=e265]: We record what you tell us; the next scan is what checks it.
                - complementary [ref=e266]:
                  - generic [ref=e267]:
                    - paragraph [ref=e268]: Approval decision
                    - heading "One safe owner decision" [level=2] [ref=e269]
                    - paragraph [ref=e270]: Approval applies only to this immutable version. Any edit must be saved as a new version and approved again.
                    - generic [ref=e271]:
                      - generic [ref=e272]: Reviewer comment
                      - textbox "Reviewer comment" [disabled] [ref=e273]:
                        - /placeholder: Optional note for the audit trail
                    - generic [ref=e274]:
                      - button "Approve No version yet" [disabled]:
                        - img
                        - text: Approve No version yet
                      - button "Request changes" [disabled]:
                        - img
                        - text: Request changes
                      - button "Reject draft" [disabled]:
                        - img
                        - text: Reject draft
                  - generic [ref=e275]:
                    - generic [ref=e276]:
                      - generic [ref=e277]:
                        - paragraph [ref=e278]: Delivery
                        - heading "Export the approved version" [level=2] [ref=e279]
                      - generic [ref=e280]: Requires connection
                    - paragraph [ref=e281]: No verified direct-publishing connector is present. One approved delivery is counted only after exact-version approval and export.
                    - button "Export approved version" [disabled]:
                      - img
                      - text: Export approved version
                    - button "Copy text" [disabled]:
                      - img
                      - text: Copy text
                    - button "Publish directly · Connection required" [disabled]:
                      - img
                      - text: Publish directly · Connection required
          - generic [ref=e282]:
            - generic [ref=e283]:
              - img [ref=e285]
              - generic [ref=e290]:
                - strong [ref=e291]: No version yet · No version yet
                - generic [ref=e292]: Approval does not publish; usage counts after export
            - generic [ref=e293]:
              - button "Save" [disabled]:
                - img
                - text: Save
              - button "Approve" [disabled]:
                - img
                - text: Approve
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e299] [cursor=pointer]:
    - img [ref=e300]
  - alert [ref=e303]
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
  11 |   sql(environment.db, `update actions set action_state='needs_input', provided_inputs=provided_inputs-'brand_voice' where id='${merchant.actionId}';`);
  12 |   await page.goto(`/en/owner/${merchant.slug}/actions/${merchant.actionId}`);
  13 |   await expect(page.locator(".action-detail-page")).toBeVisible();
> 14 |   await page.locator("#input-brand_voice").fill("warm");
     |                                            ^ Error: locator.fill: Test timeout of 180000ms exceeded.
  15 |   const savedInputs = page.waitForResponse(response => response.url().endsWith(`/api/actions/${merchant.actionId}`) && response.request().method() === "PATCH");
  16 |   await page.getByRole("button", { name: "Save inputs and generate", exact: true }).click();
  17 |   expect((await savedInputs).status()).toBe(200);
  18 |   expect(sql(environment.db, `select provided_inputs->>'brand_voice' from actions where id='${merchant.actionId}';`)).toBe("warm");
  19 |   expect(sql(environment.db, `select count(*) from audit_events where entity_id='${merchant.actionId}' and event='action.updated';`)).toBe("1");
  20 |   await page.getByRole("tab", { name: "Version & audit history" }).click();
  21 |   await expect(page.locator(".version-list button")).toHaveCount(1, { timeout: 90000 });
  22 |   await page.getByRole("tab", { name: "Draft & approval" }).click();
  23 |   await page.locator("#draft-content").fill("Edited version two: fixture acceptance.");
  24 |   await page.getByRole("button", { name: /Save manual edits/ }).click();
  25 |   await page.getByRole("tab", { name: "Version & audit history" }).click();
  26 |   await expect(page.locator(".version-list button")).toHaveCount(2);
  27 |   await page.getByRole("tab", { name: "Draft & approval" }).click();
  28 |   await page.getByRole("button", { name: /^Approve Version 2$/ }).click();
  29 |   await page.getByRole("dialog").getByRole("button", { name: /Approve/ }).click();
  30 |   const downloadPromise = page.waitForEvent("download");
  31 |   await page.getByRole("button", { name: /Export approved version/ }).click();
  32 |   const download = await downloadPromise;
  33 |   expect(download.suggestedFilename()).toMatch(/-v2\.md$/);
  34 |   expect(readFileSync((await download.path())!, "utf8")).toContain("Edited version two: fixture acceptance.");
  35 |   const version = sql(environment.db, `select id from output_versions where action_id='${merchant.actionId}' and version_no=2 and approval_state='approved';`);
  36 |   expect(version).toMatch(/^[a-f0-9-]{36}$/);
  37 |   const key = randomUUID();
  38 |   const deliveries: string[] = [];
  39 |   for (let i = 0; i < 2; i++) {
  40 |     const response = await page.request.post(`/api/versions/${version}/export`, { data: { mode: "copy", idempotency_key: key } });
  41 |     expect(response.status()).toBe(200);
  42 |     const result = await response.json(); expect(result.counted).toBe(false); deliveries.push(result.deliveryId);
  43 |   }
  44 |   expect(deliveries[0]).toMatch(/^[a-f0-9-]{36}$/);
  45 |   expect(deliveries[1]).toBe(deliveries[0]);
  46 |   expect(sql(environment.db, `select approved_deliveries from workspace_usage where workspace_id='${merchant.workspaceId}';`)).toBe("1");
  47 |   expect(sql(environment.db, `select count(*) from deliveries where id='${deliveries[0]}' and version_id='${version}' and mode='copy';`)).toBe("1");
  48 |   const appliedIds: string[] = [];
  49 |   for (let i = 0; i < 2; i++) {
  50 |     const response = await page.request.post(`/api/actions/${merchant.actionId}/applied`, { data: { output_version_id: version, note: "Synthetic local application; no external publication" } });
  51 |     expect(response.status()).toBe(200);
  52 |     appliedIds.push((await response.json()).applicationId);
  53 |   }
  54 |   expect(appliedIds[1]).toBe(appliedIds[0]);
  55 |   expect(sql(environment.db, `select action_state from actions where id='${merchant.actionId}';`)).toBe("completed");
  56 |   expect(sql(environment.db, `select count(*) from action_applications where action_id='${merchant.actionId}' and output_version_id='${version}' and retracted_at is null;`)).toBe("1");
  57 |   expect(sql(environment.db, `select count(*) from audit_events where entity_id='${merchant.actionId}' and event='action.applied';`)).toBe("1");
  58 |   const edit = await page.request.post(`/api/actions/${merchant.actionId}/versions`, { data: { body: "Fresh edit requires approval", base_version_id: version } });
  59 |   expect(edit.status()).toBe(201);
  60 |   const v3 = await edit.json() as { versionId: string; versionNo: number };
  61 |   expect(v3.versionNo).toBe(3);
  62 |   expect((await page.request.post(`/api/versions/${v3.versionId}/export`, { data: { mode: "copy", idempotency_key: randomUUID() } })).status()).toBe(409);
  63 |   await page.goto(`/zh-HK/owner/${merchant.slug}/settings/billing`);
  64 |   expect(sql(environment.db, `select market from workspaces where id='${merchant.workspaceId}';`)).toBe(market);
  65 |   if (market === "tw") await expect(page.locator("body")).toContainText(/TWD|NT\$/);
  66 |   await page.goto(link);
  67 |   await expect(page).toHaveURL(/error=/);
  68 | });
  69 | 
  70 | for (const mode of ["missing", "invalid", "unavailable"] as const) test(`${mode} LLM output cannot create or approve a version or charge usage`, async ({ page, merchant, environment }) => {
  71 |   await signIn(page, environment, merchant);
  72 |   await fetch(`${environment.llm}/mode`, { method: "POST", body: mode });
  73 |   try {
  74 |     const response = await page.request.post(`/api/actions/${merchant.actionId}/run`, { data: { locale: "en" } });
  75 |     expect(response.status()).toBe(200);
  76 |     const body = await response.json();
  77 |     expect(body.versionId).toBeUndefined();
  78 |     expect(sql(environment.db, `select count(*) from output_versions where action_id='${merchant.actionId}';`)).toBe("0");
  79 |     expect(sql(environment.db, `select coalesce(sum(approved_deliveries),0) from workspace_usage where workspace_id='${merchant.workspaceId}';`)).toBe("0");
  80 |   } finally { await fetch(`${environment.llm}/mode`, { method: "POST", body: "success" }); }
  81 | });
  82 | 
```