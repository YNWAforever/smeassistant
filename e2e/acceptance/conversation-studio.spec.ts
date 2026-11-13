import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { studioText } from "../../lib/studio/copy";

import { test, expect, signIn, waitForHydration } from "../../test/e2e/fixtures";
import { sql, type AcceptanceEnvironment } from "../../test/e2e/environment";

/**
 * Conversation Studio acceptance (docs/superpowers/specs/2026-11-08-conversation-studio-design.md §12).
 *
 * Prerequisites, all deliberate:
 * 1. `CONVERSATION_STUDIO_ENABLED=true` in the acceptance app environment
 *    (test/e2e/safety.ts isolatedEnv), which also enables the conversation
 *    workbench. With either flag off the page 404s by design, so the spec skips.
 * 2. Migration 0021 (studio_conversations/studio_messages) applied to the
 *    fixture database the acceptance harness starts.
 *
 * The Studio is the persistent, model-backed mode of the conversation
 * workbench: Today remains the default workspace URL, and the workbench is the
 * single entry point.
 */

const STUDIO_ENABLED = process.env.CONVERSATION_STUDIO_ENABLED === "true";
const AUTHORITY_ROUTE = /\/api\/(versions|actions\/[^/]+\/(approve|export|applied)|webhooks|publish)/;

const ANSWER = "Start with the unanswered reviews. They are the highest-priority open action.";
const TITLE = "Review replies first";

/** The fixture model answers the classifier with JSON (including a first-turn title), then streams the prose answer. */
async function setModelScript(environment: AcceptanceEnvironment) {
  const response = await fetch(`${environment.llm}/outputs`, {
    method: "POST",
    body: JSON.stringify([
      { intent: "answer", evidenceIds: [], nextStep: null, title: TITLE },
      ANSWER,
    ]),
  });
  expect(response.status).toBe(200);
}

/** The fixture model classifies a generate_social draft, then returns the agent's own JSON draft. */
async function setSocialDraftScript(environment: AcceptanceEnvironment, actionId: string) {
  const response = await fetch(`${environment.llm}/outputs`, {
    method: "POST",
    body: JSON.stringify([
      { intent: "draft", intentId: "generate_social", actionId, title: "Plan the IG post" },
      {
        title: "This week at the shop",
        body: "A warm invitation to visit this week. Text-only post: confirmed facts only.",
        alt_text: null,
        acceptance_criteria: ["Confirm the photo rights before posting"],
        warnings: ["Owner review required"],
        facts_used: [],
        facts_needed: [],
      },
    ]),
  });
  expect(response.status).toBe(200);
}

/** Adds one open social-post action the Studio can legitimately draft from. */
function seedSocialAction(environment: AcceptanceEnvironment, merchant: { workspaceId: string; locationId: string }) {
  const id = randomUUID();
  const title = JSON.stringify({ en: "Plan this week Instagram post", "zh-HK": "計劃今個星期 IG 帖文", "zh-TW": "規劃這週 IG 貼文" });
  sql(environment.db, `insert into actions(id,workspace_id,location_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key,provided_inputs)
    values ('${id}','${merchant.workspaceId}','${merchant.locationId}','social-post','${title}','{"en":"Fixture social post"}','{}','high',80,'{}',10,'Live','${id}','{"text_only":true}');`);
  return id;
}

test.describe("Conversation Studio", () => {
  test.skip(!STUDIO_ENABLED, "requires CONVERSATION_STUDIO_ENABLED=true in the acceptance app env plus migration 0021");

  for (const locale of ["en", "zh-HK", "zh-TW"] as const) {
    test(`keeps keyboard focus through sheets and streamed completion (${locale}, mobile/tablet/desktop)`, async ({ page, merchant, environment }) => {
      await signIn(page, environment, merchant);
      const copy = studioText(locale);
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      // Deterministic read-only member choices exercise focus, not sharing writes.
      await page.route(/\/api\/studio\/conversations\/[^/]+\/members(?:\?|$)/, route => route.fulfill({
        json: { members: [], candidates: [{ userId: randomUUID(), email: "keyboard-fixture@example.test", workspaceRole: "manager" }], canManage: true, accessRole: "owner" },
      }));
      for (const width of [390, 900, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const created = await page.request.post("/api/studio/conversations", { data: { workspaceId: merchant.workspaceId, locationId: merchant.locationId } });
        expect(created.status()).toBe(201);
        const { conversation } = await created.json();
        await page.goto(`/${locale}/owner/${merchant.slug}/conversation?location=primary&chat=${conversation.id}`);
        await waitForHydration(page);
        const composer = page.getByRole("textbox", { name: copy.composer.label });
        const contextTrigger = page.getByRole("button", { name: copy.header.context, exact: true });
        await contextTrigger.focus();
        await page.keyboard.press("Enter");
        const context = page.getByRole("dialog", { name: copy.context.title });
        const contextClose = context.getByRole("button", { name: copy.header.hideContext });
        await expect(contextClose).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect.poll(() => context.evaluate(node => node.contains(document.activeElement))).toBe(true);
        if (width !== 900) {
          await page.setViewportSize({ width: width === 390 ? 1440 : 390, height: 900 });
          // Let matchMedia, React and the isolation observer process the resize.
          await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
          await expect(page.locator(".studio-rail")).toHaveAttribute("inert", "");
        }
        await page.keyboard.press("Escape");
        await expect(contextTrigger).toBeFocused();
        if (width !== 900) {
          expect(await page.locator(".studio-rail").evaluate(node => node.hasAttribute("inert"))).toBe(width === 1440);
          await page.setViewportSize({ width, height: 900 });
        }
        if (width < 1200) {
          const railTrigger = page.getByRole("button", { name: copy.rail.open });
          await railTrigger.focus();
          await page.keyboard.press("Enter");
          const rail = page.getByRole("dialog", { name: copy.rail.listLabel });
          await expect(rail.getByRole("button", { name: copy.rail.close, exact: true })).toBeVisible();
          await expect(rail.getByRole("button", { name: copy.rail.close, exact: true })).toBeFocused();
          await page.keyboard.press("Escape");
          await expect(railTrigger).toBeFocused();
          await page.keyboard.press("Enter");
          await rail.locator('.studio-rail-item[data-active="true"] .studio-rail-select').focus();
          await page.keyboard.press("Enter");
          await expect(composer).toBeFocused();
          await expect(rail).toHaveCount(0);
        } else {
          await expect(page.locator(".studio-rail")).not.toHaveAttribute("aria-modal", "true");
          await expect(page.locator(".studio-drawer-close")).toBeHidden();
        }

        let release!: () => void;
        const heldResponse = new Promise<void>(resolve => { release = resolve; });
        let requested = false;
        const pattern = `**/api/studio/conversations/${conversation.id}/messages*`;
        const answer = `Keyboard fixture answer ${locale} ${width}.`;
        // Hold the browser stream boundary so completion occurs while the owner
        // operates Share. This path never calls a provider or claims persistence.
        await page.route(pattern, async route => {
          requested = true;
          await heldResponse;
          const message = (role: "user" | "assistant", seq: number, content: string) => ({ id: randomUUID(), conversationId: conversation.id, role, seq, content, parts: [{ kind: "text", text: content }], intent: null, createdAt: new Date().toISOString() });
          const frames = [
            { type: "user", message: message("user", 1, "Keyboard fixture question") },
            { type: "status", stage: "thinking" },
            { type: "delta", text: answer },
            { type: "message", message: message("assistant", 2, answer), conversation },
            { type: "done" },
          ];
          await route.fulfill({ status: 200, contentType: "text/event-stream", body: frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join("") });
        });
        try {
          await composer.fill("Keyboard fixture question");
          await page.getByRole("button", { name: copy.composer.send, exact: true }).click();
          await expect.poll(() => requested).toBe(true);
          const more = page.locator(".studio-more-toggle");
          await more.focus();
          await page.keyboard.press("Enter");
          await page.getByRole("button", { name: copy.share.action, exact: true }).focus();
          await page.keyboard.press("Enter");
          const share = page.getByRole("dialog", { name: copy.share.title });
          const close = share.getByRole("button", { name: copy.share.close });
          const role = share.getByRole("combobox", { name: copy.share.roleEditor });
          await expect(close).toBeFocused();
          await expect(role).toBeVisible();
          await page.keyboard.press("Tab");
          await expect(share.getByRole("combobox", { name: copy.share.candidates })).toBeFocused();
          await page.keyboard.press("Tab");
          await expect(role).toBeFocused();
          release();
          await expect(page.getByText(answer, { exact: true })).toBeVisible();
          await expect(role).toBeFocused();
          await page.keyboard.press("Tab");
          await expect(close).toBeFocused();
          await page.keyboard.press("Shift+Tab");
          await expect(role).toBeFocused();
          await page.keyboard.press("Escape");
          await expect(more).toBeFocused();
        } finally {
          release();
          await page.unroute(pattern);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
      }
      expect(errors).toEqual([]);
    });

    test(`preserves the history reading anchor and keyboard focus (${locale}, mobile and desktop)`, async ({ page, merchant, environment }) => {
      await signIn(page, environment, merchant);
      const copy = studioText(locale);
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const create = () => page.request.post("/api/studio/conversations", { data: { workspaceId: merchant.workspaceId, locationId: merchant.locationId } });
        const initial = await create();
        const target = await create();
        expect(initial.status()).toBe(201);
        expect(target.status()).toBe(201);
        const first = (await initial.json()).conversation;
        const second = (await target.json()).conversation;
        const title = `History fixture ${width}`;
        const renamed = await page.request.patch(`/api/studio/conversations/${second.id}`, { data: { workspaceId: merchant.workspaceId, title } });
        expect(renamed.status()).toBe(200);
        const conversation = (await renamed.json()).conversation;
        const message = (seq: number, content: string, role: "user" | "assistant" = "assistant") => ({ id: randomUUID(), conversationId: conversation.id, role, seq, content, parts: [{ kind: "text", text: content }], intent: null, createdAt: new Date().toISOString() });
        const latest = Array.from({ length: 20 }, (_, index) => message(index + 41, `Recent paragraph ${index + 41}. ` + "A saved observation for reading history. ".repeat(12)));
        const earlier = Array.from({ length: 40 }, (_, index) => message(index + 1, `Earlier paragraph ${index + 1}. ` + "An older saved observation with its original context. ".repeat(12)));
        const detail = (url: URL) => url.pathname === `/api/studio/conversations/${conversation.id}`;
        await page.route(detail, route => route.fulfill({ json: { conversation, messages: new URL(route.request().url()).searchParams.has("beforeSeq") ? earlier : latest, hasMore: !new URL(route.request().url()).searchParams.has("beforeSeq") } }));
        await page.goto(`/${locale}/owner/${merchant.slug}/conversation?location=primary&chat=${first.id}`);
        await waitForHydration(page);
        if (width < 1200) await page.getByRole("button", { name: copy.rail.open }).click();
        await page.getByRole("button", { name: title, exact: true }).click();
        const log = page.getByRole("log", { name: copy.header.title });
        await expect(log.locator(".studio-messages > li")).toHaveCount(20);
        await log.evaluate(node => { node.scrollTop = 0; });
        const load = log.getByRole("button", { name: copy.thread.loadEarlier });
        await load.focus();
        const anchor = log.getByText(latest[0].content, { exact: true });
        const before = await anchor.evaluate(node => node.getBoundingClientRect().top);
        const composer = page.getByRole("textbox", { name: copy.composer.label });
        const composerTop = await composer.evaluate(node => node.getBoundingClientRect().top);
        const pageTop = await page.evaluate(() => window.scrollY);
        await page.keyboard.press("Enter");
        await expect(log.locator(".studio-messages > li")).toHaveCount(60);
        await expect(load).toHaveCount(0);
        await expect(log).toBeFocused();
        expect(Math.abs(await anchor.evaluate(node => node.getBoundingClientRect().top) - before)).toBeLessThanOrEqual(2);
        expect(await page.evaluate(() => window.scrollY)).toBe(pageTop);
        expect(await composer.evaluate(node => node.getBoundingClientRect().top)).toBe(composerTop);

        await log.evaluate(node => { node.scrollTop = 100; });
        await expect.poll(() => log.evaluate(node => node.scrollTop)).toBe(100);
        const answer = `Appended while reading ${locale} ${width}.`;
        const pattern = `**/api/studio/conversations/${conversation.id}/messages*`;
        await page.route(pattern, route => route.fulfill({ contentType: "text/event-stream", body: [
          { type: "user", message: message(61, "Keep my reading position", "user") },
          { type: "message", message: message(62, answer), conversation },
          { type: "done" },
        ].map(frame => `data: ${JSON.stringify(frame)}\n\n`).join("") }));
        await composer.fill("Keep my reading position");
        await page.getByRole("button", { name: copy.composer.send, exact: true }).click();
        await expect(log.getByText(answer, { exact: true })).toBeAttached();
        expect(await log.evaluate(node => node.scrollTop)).toBe(100);
        expect(await page.evaluate(() => window.scrollY)).toBe(pageTop);
        await page.unroute(pattern);
        await page.unroute(detail);
      }
    });

    test(`attaches owner-provided evidence and retains its provenance after reload (${locale}, mobile and desktop)`, async ({ page, merchant, environment }) => {
      await signIn(page, environment, merchant);
      const documentId = randomUUID();
      const assetId = randomUUID();
      const versionId = randomUUID();
      const title = "owner-hours.txt";
      const text = "Owner-provided opening hours: Monday to Friday, 10am to 6pm.";
      const sha = createHash("sha256").update(text).digest("hex");
      // Seed an existing private document in the owned database. Blob upload is
      // separately tested; this fixture neither configures nor calls Blob storage.
      sql(environment.db, `begin;
        insert into assets(id,workspace_id,location_id,kind,storage_path,filename,uploaded_by)
        select '${assetId}','${merchant.workspaceId}','${merchant.locationId}','document',
          '${merchant.workspaceId}/${assetId}/__conversation_document__/${title}','${title}',user_id
        from workspace_members where workspace_id='${merchant.workspaceId}' and role='owner' and accepted_at is not null;
        insert into conversation_document_versions(id,workspace_id,location_id,document_id,asset_id,version,title,extracted_text,truncated,sha256,uploaded_by)
        select '${versionId}','${merchant.workspaceId}','${merchant.locationId}','${documentId}','${assetId}',1,'${title}','${text}',false,'${sha}',uploaded_by
        from assets where id='${assetId}';
        commit;`);
      const seededDocuments = await page.request.get(`/api/workspaces/${merchant.workspaceId}/conversation/documents?location_id=${merchant.locationId}`);
      expect(seededDocuments.status()).toBe(200);
      expect((await seededDocuments.json()).versions).toEqual(expect.arrayContaining([expect.objectContaining({ id: versionId })]));
      await setModelScript(environment);
      const copy = studioText(locale);
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/${locale}/owner/${merchant.slug}/conversation?location=primary`);
      const evidenceToggle = page.getByRole("button", { name: copy.evidence.title, exact: true });
      await evidenceToggle.focus();
      await expect(evidenceToggle).toBeFocused();
      await evidenceToggle.press("Enter");
      const documentCheckbox = page.getByRole("checkbox", { name: title, exact: true });
      await documentCheckbox.focus();
      await documentCheckbox.press("Space");
      await expect(documentCheckbox).toBeChecked();
      await expect(page.locator(".studio-evidence-chip")).toContainText(title);
      await page.locator(".studio-composer-input").fill("Summarize the owner-provided opening hours and identify the source.");
      const turnRequest = page.waitForRequest(request => request.method() === "POST" && /\/api\/studio\/conversations\/[^/]+\/messages$/.test(new URL(request.url()).pathname));
      await page.getByRole("button", { name: copy.composer.send, exact: true }).click();
      expect((await turnRequest).postDataJSON()).toMatchObject({ documentVersionIds: [versionId] });
      await expect(page.locator(".studio-message-assistant")).toContainText(ANSWER);
      const chat = new URL(page.url()).searchParams.get("chat");
      expect(chat).toMatch(/^[a-f0-9-]{36}$/);
      const persisted = await page.request.get(`/api/studio/conversations/${chat}?workspaceId=${merchant.workspaceId}`);
      expect(persisted.status()).toBe(200);
      const history = await persisted.json();
      expect(history.messages).toEqual(expect.arrayContaining([expect.objectContaining({
        role: "user", parts: expect.arrayContaining([expect.objectContaining({
          kind: "citation", refs: expect.arrayContaining([expect.objectContaining({ source: "document", documentVersionId: versionId, title })]),
        })]),
      })]));
      await expect(page.locator(".studio-citations").first()).toContainText(title);
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.reload();
        await waitForHydration(page);
        expect(new URL(page.url()).searchParams.get("chat")).toBe(chat);
        await expect(page.locator(".studio-citations").first()).toContainText(title);
        await expect(page.locator(".studio-composer-input")).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      }
      expect(errors).toEqual([]);
      expect(sql(environment.db, `select rights_status from assets where id='${assetId}';`)).toBe("needs_review");
      expect(sql(environment.db, `select count(*) from output_versions where workspace_id='${merchant.workspaceId}';`)).toBe("0");
      expect(sql(environment.db, `select approved_deliveries from workspace_usage where workspace_id='${merchant.workspaceId}';`)).toBe("0");
    });
  }

  test("an owner starts one continuous conversation from a starter and reloads back into its history", async ({ page, merchant, environment }) => {
    await setModelScript(environment);
    await signIn(page, environment, merchant);

    const requested: string[] = [];
    page.on("request", (request) => { requested.push(`${request.method()} ${new URL(request.url()).pathname}`); });

    // 1. Today remains the default workspace URL (Path A decision).
    await page.goto(`/en/owner/${merchant.slug}`);
    await waitForHydration(page);
    await expect(page).not.toHaveURL(/\/conversation/);
    // Kinnso is a primary destination, discoverable from Today.
    const conversationEntry = page.locator("[data-slot='sidebar-menu'] a").filter({ hasText: "Kinnso" });
    await expect(conversationEntry).toBeVisible();
    await expect(conversationEntry).toHaveAttribute("href", new RegExp(`/en/owner/${merchant.slug}/conversation\\?location=`));

    // Kinnso is canonical; the old Studio URL permanently redirects here.
    await page.goto(`/en/owner/${merchant.slug}/conversation`);
    expect(new URL(page.url()).pathname).toBe(`/en/owner/${merchant.slug}/conversation`);
    await expect(page.locator(".studio-root")).toBeVisible();
    await expect(page.locator(".studio-thread")).toHaveAttribute("role", "log");
    await expect(page.locator(".studio-thread")).toHaveAttribute("aria-live", "polite");
    await expect(page.getByRole("heading", { name: "What should we work on?" })).toBeVisible();
    await expect(page.getByText("Nothing is approved, exported or published from this conversation")).toBeVisible();

    // 2. A starter sends a real turn: create conversation, then stream the answer.
    const created = page.waitForResponse((response) => response.url().endsWith("/api/studio/conversations") && response.request().method() === "POST" && response.status() === 201);
    const streamed = page.waitForResponse((response) => /\/api\/studio\/conversations\/[^/]+\/messages$/.test(new URL(response.url()).pathname) && response.request().method() === "POST");
    await page.getByRole("button", { name: "What should I do first?" }).click();
    const conversation = (await (await created).json()).conversation as { id: string };
    expect(conversation.id).toMatch(/^[a-f0-9-]{36}$/);
    const streamResponse = await streamed;
    expect(streamResponse.status()).toBe(200);
    expect(streamResponse.headers()["content-type"]).toContain("text/event-stream");

    // 3. The answer is in the same thread as the optimistic question, and the
    //    URL now names the conversation (?chat=) without a full navigation.
    const thread = page.locator(".studio-thread");
    await expect(thread.locator(".studio-message-user").first()).toContainText("What should I do first");
    await expect(thread.locator(".studio-message-assistant").last()).toContainText("Start with the unanswered reviews", { timeout: 90_000 });
    // The answer is the model's prose, not the classifier's raw JSON envelope.
    await expect(thread.locator(".studio-message-assistant").last()).not.toContainText('"intent"');
    await expect(page.locator(".studio-pending")).toHaveCount(0, { timeout: 90_000 });
    await expect(page).toHaveURL(new RegExp(`/conversation\\?.*chat=${conversation.id}`));
    expect(sql(environment.db, `select count(*) from studio_messages where conversation_id='${conversation.id}';`)).toBe("2");
    expect(sql(environment.db, `select count(*) from studio_conversations where id='${conversation.id}' and workspace_id='${merchant.workspaceId}';`)).toBe("1");
    // v1.1: the first-turn classifier names the conversation; the rail shows it.
    expect(sql(environment.db, `select title from studio_conversations where id='${conversation.id}';`)).toBe(TITLE);

    // 4. Reload: the rail finds the conversation (server-loaded) and the thread
    //    resumes it, so the conversation is persistent, not a client array.
    await page.reload();
    await waitForHydration(page);
    const rail = page.locator(".studio-rail");
    await expect(rail).toContainText(TITLE);
    await expect(page.locator(".studio-message-user").first()).toContainText("What should I do first");
    await expect(page.locator(".studio-message-assistant").first()).toBeVisible();

    // 5. Reopen from the rail and read the history again.
    await rail.locator(".studio-rail-select").first().click();
    await expect(page.locator(".studio-message-assistant").last()).toContainText("Start with the unanswered reviews");
    await expect(page.getByLabel("Message Kinnso")).toBeVisible();

    // 6. The Studio never offers approve/publish/authority routes. The only
    //    export is the read-only transcript download.
    for (const name of [/approve/i, /publish/i]) {
      await expect(thread.getByRole("button", { name })).toHaveCount(0);
      await expect(thread.getByRole("link", { name })).toHaveCount(0);
    }
    expect(requested.filter((entry) => AUTHORITY_ROUTE.test(entry))).toEqual([]);
    expect(sql(environment.db, `select count(*) from output_versions where workspace_id='${merchant.workspaceId}';`)).toBe("0");

    // 7. Read-only transcript export downloads the conversation as Markdown.
    await page.locator(".studio-more-toggle").click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export transcript" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^studio-.*\.md$/);
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const exported = readFileSync(downloadPath!, "utf8");
    expect(exported).toContain(TITLE);
    expect(exported).toContain("Start with the unanswered reviews");
    expect(exported).toContain("Drafts stay drafts");
    expect(exported).not.toContain('"kind"');
  });

  test("retries a saved IG draft, approves and copies its exact version, then returns to the original chat", async ({ page, merchant, environment }) => {
    const socialActionId = seedSocialAction(environment, merchant);
    await setSocialDraftScript(environment, socialActionId);
    await signIn(page, environment, merchant);

    await page.goto(`/en/owner/${merchant.slug}/conversation?location=primary`);
    await waitForHydration(page);
    await page.getByRole("button", { name: "Plan this week's IG post" }).click();
    await expect(page.locator(".studio-artifact-card")).toBeVisible({ timeout: 90_000 });
    await expect(page.locator(".studio-artifact-card")).toContainText("This week at the shop");

    // Lose the first acknowledgement after the real server commits. Retrying
    // the same artifact must redeem the existing version, not create another.
    let committedVersion = "";
    await page.route(`**/api/actions/${socialActionId}/versions`, async route => {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      committedVersion = (await response.json()).versionId;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "unavailable" }) });
    }, { times: 1 });
    await page.getByRole("button", { name: "Save as a version" }).click();
    await expect(page.locator(".studio-artifact-error")).toBeVisible();
    expect(committedVersion).toMatch(/^[a-f0-9-]{36}$/);
    expect(sql(environment.db, `select count(*) from output_versions where action_id='${socialActionId}';`)).toBe("1");
    const saves = page.waitForResponse((response) => response.url().endsWith(`/api/actions/${socialActionId}/versions`) && response.request().method() === "POST" && response.ok());
    await page.getByRole("button", { name: "Save as a version" }).click();
    const saved = await saves;
    const { versionId } = await saved.json() as { versionId: string };
    expect(versionId).toBe(committedVersion);
    expect(sql(environment.db, `select count(*) from output_versions where action_id='${socialActionId}';`)).toBe("1");

    const originalChat = new URL(page.url()).searchParams.get("chat");
    expect(originalChat).toMatch(/^[a-f0-9-]{36}$/);
    // A newer discussion must not steal the return destination from this draft.
    const newer = await page.request.post("/api/studio/conversations", {
      data: { workspaceId: merchant.workspaceId, locationId: merchant.locationId, title: "A newer unrelated discussion" },
    });
    expect(newer.status()).toBe(201);
    const newerId = (await newer.json()).conversation.id as string;
    expect(newerId).not.toBe(originalChat);

    // The review link selects that exact version and marks the Studio handoff.
    const review = page.getByRole("link", { name: "Review version" });
    const href = await review.getAttribute("href");
    expect(href).toContain(`version=${versionId}`);
    expect(href).toContain("from=studio");
    expect(href).toContain(`chat=${originalChat}`);
    await review.click();
    await page.waitForURL(new RegExp(`/actions/${socialActionId}\\?`));
    await expect(page.getByTestId("studio-handoff-banner")).toContainText("Kinnso draft saved");
    await expect(page.getByTestId("studio-handoff-banner")).toContainText("Back to Kinnso");

    // B: approve the exact version on the action page; the Instagram delivery is
    // then available as Copy text (export-ready, never auto-published).
    await page.locator(".approval-panel").getByRole("button", { name: "Confirm this version" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Confirm this version" }).click();
    await expect.poll(() => sql(environment.db, `select approval_state from output_versions where id='${versionId}';`)).toBe("approved");
    await expect(page.getByRole("button", { name: "Copy text" })).toBeVisible();
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    for (const counted of [true, false]) {
      await page.evaluate(value => navigator.clipboard.writeText(value), `before-copy-${randomUUID()}`);
      const exported = page.waitForResponse(response => response.url().endsWith(`/api/versions/${versionId}/export`) && response.request().method() === "POST");
      await page.getByRole("button", { name: "Copy text", exact: true }).click();
      const response = await exported;
      expect(response.status()).toBe(200);
      expect(await response.json()).toMatchObject({ counted, usage: { approved_deliveries: 1 } });
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("A warm invitation to visit this week.");
      await expect(page.getByRole("button", { name: "Copy text", exact: true })).toBeEnabled();
    }
    expect(sql(environment.db, `select approved_deliveries from workspace_usage where workspace_id='${merchant.workspaceId}';`)).toBe("1");
    expect(sql(environment.db, `select count(*) from audit_events where workspace_id='${merchant.workspaceId}' and event in ('delivery.published','content.published','version.published');`)).toBe("0");

    // A refresh must retain the server-validated return context and exact version.
    await page.reload();
    await waitForHydration(page);
    expect(new URL(page.url()).searchParams.get("version")).toBe(versionId);
    await expect(page.getByTestId("studio-handoff-banner").getByRole("link", { name: "Back to Kinnso" }))
      .toHaveAttribute("href", new RegExp(`chat=${originalChat}`));
    // Returning keeps the original discussion despite a newer conversation.
    await page.getByTestId("studio-handoff-banner").getByRole("link", { name: "Back to Kinnso" }).click();
    await expect(page).toHaveURL(new RegExp(`/conversation\\?.*location=primary`));
    expect(new URL(page.url()).searchParams.get("chat")).toBe(originalChat);
    await expect(page.locator(".studio-message-user").first()).toContainText("Help me plan and draft this week's Instagram post");
    await expect(page.locator(".studio-artifact-card")).toContainText("This week at the shop");
  });

  test("promotes a browser-local note thread into a persistent Studio conversation", async ({ page, merchant, environment }) => {
    await signIn(page, environment, merchant, "owner");
    await page.goto(`/en/owner/${merchant.slug}/conversation/notes`);

    // The archived workbench keeps browser-only notes; reveal them to create one.
    await page.getByRole("button", { name: "Browser-only notes" }).click();
    await page.getByLabel("Your note").fill("First local note");
    await page.getByRole("button", { name: "Save local note" }).click();
    await expect(page.locator(".conversation-note").first()).toContainText("First local note");

    // The convergence bridge imports the notes as opening user turns.
    await page.getByRole("button", { name: "Continue with Kinnso" }).click();
    await expect(page).toHaveURL(new RegExp(`/conversation\\?.*chat=`));
    await expect(page.locator(".studio-message-user").first()).toContainText("First local note");
    const conversationId = new URL(page.url()).searchParams.get("chat")!;
    expect(sql(environment.db, `select count(*) from studio_messages where conversation_id='${conversationId}';`)).toBe("1");
    expect(sql(environment.db, `select count(*) from studio_conversations where id='${conversationId}' and workspace_id='${merchant.workspaceId}';`)).toBe("1");
  });

  test("imports all local note threads into persistent discussions in one click", async ({ page, merchant, environment }) => {
    await signIn(page, environment, merchant, "owner");
    await page.goto(`/en/owner/${merchant.slug}/conversation/notes`);

    await page.getByRole("button", { name: "Browser-only notes" }).click();
    await page.getByLabel("Your note").fill("First local note");
    await page.getByRole("button", { name: "Save local note" }).click();
    await expect(page.locator(".conversation-note").first()).toContainText("First local note");
    await page.getByRole("button", { name: "New thread" }).click();
    await page.getByLabel("Your note").fill("Second local note");
    await page.getByRole("button", { name: "Save local note" }).click();
    await expect(page.locator(".conversation-note").first()).toContainText("Second local note");

    await page.getByRole("button", { name: /Import all to Kinnso/ }).click();
    await expect(page.getByText("Local threads are now in Kinnso.")).toBeVisible();
    expect(sql(environment.db, `select count(*) from studio_messages where workspace_id='${merchant.workspaceId}' and content in ('First local note','Second local note');`)).toBe("2");

    // The persistent copies are listed and the local threads link to them.
    await page.reload();
    await waitForHydration(page);
    await expect(page.locator(".conversation-persistent li")).toHaveCount(2);
    await expect(page.getByRole("link", { name: /Open persistent copy/ }).first()).toBeVisible();
  });

  test("starts a new Studio conversation from a workbench action deep link", async ({ page, merchant, environment }) => {
    await setModelScript(environment);
    await signIn(page, environment, merchant, "owner");
    await page.goto(`/en/owner/${merchant.slug}/conversation/notes?location=primary`);

    const discuss = page.getByRole("link", { name: "Discuss with Kinnso" }).first();
    await expect(discuss).toBeVisible();
    await discuss.click();
    await expect(page).toHaveURL(new RegExp(`/en/owner/${merchant.slug}/conversation\\?action=`));
    await expect(page.getByRole("heading", { name: "What should we work on?" })).toBeVisible();

    // The action is a contextual starter, not a prefilled answer or an authority.
    await page.getByRole("button", { name: "Help with: Reply to reviews" }).click();
    await expect(page.locator(".studio-message-assistant").last()).toContainText("Start with the unanswered reviews", { timeout: 90_000 });
    expect(new URL(page.url()).searchParams.get("chat")).toMatch(/^[a-f0-9-]{36}$/);
  });

  test("shares a conversation with an accepted teammate and enforces viewer read-only", async ({ page, merchant, environment }) => {
    await setModelScript(environment);
    await signIn(page, environment, merchant, "owner");
    await page.goto(`/en/owner/${merchant.slug}/conversation`);
    await page.getByRole("button", { name: "What should I do first?" }).click();
    await expect(page.locator(".studio-message-assistant").last()).toContainText("Start with the unanswered reviews", { timeout: 90_000 });
    const conversationId = new URL(page.url()).searchParams.get("chat");
    expect(conversationId).toMatch(/^[a-f0-9-]{36}$/);

    // Make the fixture viewer an accepted member before sharing (the seed leaves
    // invitations pending; real owners share with accepted teammates).
    expect(sql(environment.db, `update workspace_members set user_id=(select id from app_users where email='${merchant.emails.viewer}'), accepted_at=now() where workspace_id='${merchant.workspaceId}' and email='${merchant.emails.viewer}'; select 'ok';`)).toBe("ok");

    await page.locator(".studio-more-toggle").click();
    await page.getByRole("button", { name: "Share", exact: true }).click();
    const dialog = page.locator(".studio-share-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("combobox").first().selectOption({ label: merchant.emails.viewer });
    await dialog.getByRole("combobox").nth(1).selectOption("viewer");
    await dialog.getByRole("button", { name: "Share" }).click();
    await expect.poll(() => sql(environment.db, `select role from studio_conversation_members where conversation_id='${conversationId}' and user_id=(select id from app_users where email='${merchant.emails.viewer}');`)).toBe("viewer");
    const membersResponse = await page.request.get(`/api/studio/conversations/${conversationId}/members?workspaceId=${merchant.workspaceId}`);
    expect(membersResponse.status()).toBe(200);
    const membersPayload = await membersResponse.json() as { members?: Array<{ user_email?: string }> };
    expect(membersPayload.members?.map((member) => member.user_email)).toContain(merchant.emails.viewer);
    await expect(dialog.locator(".studio-share-members")).toContainText(merchant.emails.viewer, { timeout: 15_000 });

    // The teammate signs in and sees the shared conversation on their rail.
    expect((await page.request.post("/api/auth/sign-out")).status()).toBe(200);
    await signIn(page, environment, merchant, "viewer");
    await page.goto(`/en/owner/${merchant.slug}/conversation`);
    await page.locator(".studio-rail-select").filter({ hasText: "Review replies first" }).click();
    await expect(page.getByText("This conversation is shared with you as read-only.")).toBeVisible();
    await expect(page.locator("#studio-composer-input")).toBeDisabled();
    const forbidden = await page.request.post(`/api/studio/conversations/${conversationId}/messages`, {
      data: { workspaceId: merchant.workspaceId, text: "Should be refused" },
    });
    expect(forbidden.status()).toBe(403);
  });

  test("conversations are private per member: a teammate in the same workspace starts with an empty rail", async ({ page, merchant, environment }) => {
    await setModelScript(environment);
    await signIn(page, environment, merchant, "owner");
    await page.goto(`/en/owner/${merchant.slug}/conversation`);
    await page.getByRole("button", { name: "What should I do first?" }).click();
    await expect(page.locator(".studio-message-assistant").last()).toContainText("Start with the unanswered reviews", { timeout: 90_000 });
    const conversation = sql(environment.db, `select id from studio_conversations where workspace_id='${merchant.workspaceId}' and created_by=(select id from app_users where email='${merchant.emails.owner}');`);
    expect(conversation).toMatch(/^[a-f0-9-]{36}$/);

    expect((await page.request.post("/api/auth/sign-out")).status()).toBe(200);
    await signIn(page, environment, merchant, "viewer");

    // The rail is the viewer's own list: the owner's conversation is absent.
    await page.goto(`/en/owner/${merchant.slug}/conversation`);
    await expect(page.getByRole("heading", { name: "What should we work on?" })).toBeVisible();
    await expect(page.locator(".studio-rail")).not.toContainText("What should I do first");

    // Reading another member's conversation is 404, never 403 (no existence leak).
    const foreign = await page.request.get(`/api/studio/conversations/${conversation}?workspaceId=${merchant.workspaceId}`);
    expect(foreign.status()).toBe(404);
    expect(await foreign.text()).not.toContain("Start with the unanswered reviews");
  });
});

test.afterEach(async ({ merchant, environment }) => {
  if (!merchant || !environment) return;
  sql(environment.db, `delete from studio_conversations where workspace_id='${merchant.workspaceId}';`);
});
