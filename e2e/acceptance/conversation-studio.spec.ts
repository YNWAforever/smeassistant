import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

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

  test("an owner starts one continuous conversation from a starter and reloads back into its history", async ({ page, merchant, environment }) => {
    await setModelScript(environment);
    await signIn(page, environment, merchant);

    const requested: string[] = [];
    page.on("request", (request) => { requested.push(`${request.method()} ${new URL(request.url()).pathname}`); });

    // 1. Today remains the default workspace URL (Path A decision).
    await page.goto(`/en/owner/${merchant.slug}`);
    await waitForHydration(page);
    await expect(page).not.toHaveURL(/\/conversation/);
    // The persistent topbar entry makes the workbench discoverable from Today.
    const conversationEntry = page.locator(".conversation-topbar-link");
    await expect(conversationEntry).toBeVisible();
    await expect(conversationEntry).toHaveAttribute("href", new RegExp(`/en/owner/${merchant.slug}/conversation\\?location=`));

    // The conversation workbench is the single entry point to the Studio.
    await page.goto(`/en/owner/${merchant.slug}/conversation`);
    await expect(page.locator(".conversation-studio-entry")).toBeVisible();
    await page.locator(".conversation-studio-entry").click();
    await page.waitForURL(new RegExp(`/en/owner/${merchant.slug}/conversation/studio`));
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
    await expect(page).toHaveURL(new RegExp(`/conversation/studio\\?.*chat=${conversation.id}`));
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
    await expect(page.getByLabel("Message the Studio")).toBeVisible();

    // 6. The Studio never offers approve/publish/authority routes. The only
    //    export is the read-only transcript download.
    for (const name of [/approve/i, /publish/i]) {
      await expect(thread.getByRole("button", { name })).toHaveCount(0);
      await expect(thread.getByRole("link", { name })).toHaveCount(0);
    }
    expect(requested.filter((entry) => AUTHORITY_ROUTE.test(entry))).toEqual([]);
    expect(sql(environment.db, `select count(*) from output_versions where workspace_id='${merchant.workspaceId}';`)).toBe("0");

    // 7. Read-only transcript export downloads the conversation as Markdown.
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

  test("drafts an IG post, saves a version and hands off to the action page for approval and copy-ready delivery", async ({ page, merchant, environment }) => {
    const socialActionId = seedSocialAction(environment, merchant);
    await setSocialDraftScript(environment, socialActionId);
    await signIn(page, environment, merchant);

    await page.goto(`/en/owner/${merchant.slug}/conversation/studio?location=primary`);
    await waitForHydration(page);
    await page.getByRole("button", { name: "Plan this week's IG post" }).click();
    await expect(page.locator(".studio-artifact-card")).toBeVisible({ timeout: 90_000 });
    await expect(page.locator(".studio-artifact-card")).toContainText("This week at the shop");

    // Saving posts to the existing version route, not an authority route.
    const saves = page.waitForResponse((response) => response.url().endsWith(`/api/actions/${socialActionId}/versions`) && response.request().method() === "POST" && response.status() === 201);
    await page.getByRole("button", { name: "Save as a version" }).click();
    const saved = await saves;
    const { versionId } = await saved.json() as { versionId: string };
    expect(versionId).toMatch(/^[a-f0-9-]{36}$/);
    expect(sql(environment.db, `select count(*) from output_versions where action_id='${socialActionId}';`)).toBe("1");

    // The review link selects that exact version and marks the Studio handoff.
    const review = page.getByRole("link", { name: "Review version" });
    const href = await review.getAttribute("href");
    expect(href).toContain(`version=${versionId}`);
    expect(href).toContain("from=studio");
    await review.click();
    await page.waitForURL(new RegExp(`/actions/${socialActionId}\\?`));
    await expect(page.getByTestId("studio-handoff-banner")).toContainText("Studio draft saved");
    await expect(page.getByTestId("studio-handoff-banner")).toContainText("Back to Conversation Studio");

    // B: approve the exact version on the action page; the Instagram delivery is
    // then available as Copy text (export-ready, never auto-published).
    await page.locator(".approval-panel").getByRole("button", { name: "Confirm this version" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Confirm this version" }).click();
    await expect.poll(() => sql(environment.db, `select approval_state from output_versions where id='${versionId}';`)).toBe("approved");
    await expect(page.getByRole("button", { name: "Copy text" })).toBeVisible();

    // Returning keeps the same persistent conversation.
    await page.getByTestId("studio-handoff-banner").getByRole("link", { name: "Back to Conversation Studio" }).click();
    await expect(page).toHaveURL(new RegExp(`/conversation/studio\\?.*location=primary`));
    await expect(page.locator(".studio-message-user").first()).toContainText("Help me plan and draft this week's Instagram post");
    await expect(page.locator(".studio-artifact-card")).toContainText("This week at the shop");
  });

  test("promotes a browser-local note thread into a persistent Studio conversation", async ({ page, merchant, environment }) => {
    await signIn(page, environment, merchant, "owner");
    await page.goto(`/en/owner/${merchant.slug}/conversation`);

    // The workbench is server-first; reveal the browser-only notes to create one.
    await page.getByRole("button", { name: "Browser-only notes" }).click();
    await page.getByLabel("Your note").fill("First local note");
    await page.getByRole("button", { name: "Save local note" }).click();
    await expect(page.locator(".conversation-note").first()).toContainText("First local note");

    // The convergence bridge imports the notes as opening user turns.
    await page.getByRole("button", { name: "Continue in Studio" }).click();
    await expect(page).toHaveURL(new RegExp(`/conversation/studio\\?.*chat=`));
    await expect(page.locator(".studio-message-user").first()).toContainText("First local note");
    const conversationId = new URL(page.url()).searchParams.get("chat")!;
    expect(sql(environment.db, `select count(*) from studio_messages where conversation_id='${conversationId}';`)).toBe("1");
    expect(sql(environment.db, `select count(*) from studio_conversations where id='${conversationId}' and workspace_id='${merchant.workspaceId}';`)).toBe("1");
  });

  test("imports all local note threads into persistent discussions in one click", async ({ page, merchant, environment }) => {
    await signIn(page, environment, merchant, "owner");
    await page.goto(`/en/owner/${merchant.slug}/conversation`);

    await page.getByRole("button", { name: "Browser-only notes" }).click();
    await page.getByLabel("Your note").fill("First local note");
    await page.getByRole("button", { name: "Save local note" }).click();
    await expect(page.locator(".conversation-note").first()).toContainText("First local note");
    await page.getByRole("button", { name: "New thread" }).click();
    await page.getByLabel("Your note").fill("Second local note");
    await page.getByRole("button", { name: "Save local note" }).click();
    await expect(page.locator(".conversation-note").first()).toContainText("Second local note");

    await page.getByRole("button", { name: /Import all to Studio/ }).click();
    await expect(page.getByText("Local threads are now in Studio.")).toBeVisible();
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
    await page.goto(`/en/owner/${merchant.slug}/conversation?location=primary`);

    const discuss = page.getByRole("link", { name: "Discuss this action" }).first();
    await expect(discuss).toBeVisible();
    await discuss.click();
    await expect(page).toHaveURL(new RegExp(`/en/owner/${merchant.slug}/conversation/studio\\?action=`));
    await expect(page.getByRole("heading", { name: "What should we work on?" })).toBeVisible();

    // The action is a contextual starter, not a prefilled answer or an authority.
    await page.getByRole("button", { name: "Help with: Reply to reviews" }).click();
    await expect(page.locator(".studio-message-assistant").last()).toContainText("Start with the unanswered reviews", { timeout: 90_000 });
    expect(new URL(page.url()).searchParams.get("chat")).toMatch(/^[a-f0-9-]{36}$/);
  });

  test("shares a conversation with an accepted teammate and enforces viewer read-only", async ({ page, merchant, environment }) => {
    await setModelScript(environment);
    await signIn(page, environment, merchant, "owner");
    await page.goto(`/en/owner/${merchant.slug}/conversation/studio`);
    await page.getByRole("button", { name: "What should I do first?" }).click();
    await expect(page.locator(".studio-message-assistant").last()).toContainText("Start with the unanswered reviews", { timeout: 90_000 });
    const conversationId = new URL(page.url()).searchParams.get("chat");
    expect(conversationId).toMatch(/^[a-f0-9-]{36}$/);

    // Make the fixture viewer an accepted member before sharing (the seed leaves
    // invitations pending; real owners share with accepted teammates).
    expect(sql(environment.db, `update workspace_members set user_id=(select id from app_users where email='${merchant.emails.viewer}'), accepted_at=now() where workspace_id='${merchant.workspaceId}' and email='${merchant.emails.viewer}'; select 'ok';`)).toBe("ok");

    await page.getByRole("button", { name: "Share" }).click();
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
    await page.goto(`/en/owner/${merchant.slug}/conversation/studio`);
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
    await page.goto(`/en/owner/${merchant.slug}/conversation/studio`);
    await page.getByRole("button", { name: "What should I do first?" }).click();
    await expect(page.locator(".studio-message-assistant").last()).toContainText("Start with the unanswered reviews", { timeout: 90_000 });
    const conversation = sql(environment.db, `select id from studio_conversations where workspace_id='${merchant.workspaceId}' and created_by=(select id from app_users where email='${merchant.emails.owner}');`);
    expect(conversation).toMatch(/^[a-f0-9-]{36}$/);

    expect((await page.request.post("/api/auth/sign-out")).status()).toBe(200);
    await signIn(page, environment, merchant, "viewer");

    // The rail is the viewer's own list: the owner's conversation is absent.
    await page.goto(`/en/owner/${merchant.slug}/conversation/studio`);
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
