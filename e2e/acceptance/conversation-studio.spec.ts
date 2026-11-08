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

    // 6. The Studio never offers approve/export/publish, and it called no such route.
    for (const name of [/approve/i, /export/i, /publish/i]) {
      await expect(thread.getByRole("button", { name })).toHaveCount(0);
      await expect(thread.getByRole("link", { name })).toHaveCount(0);
    }
    expect(requested.filter((entry) => AUTHORITY_ROUTE.test(entry))).toEqual([]);
    expect(sql(environment.db, `select count(*) from output_versions where workspace_id='${merchant.workspaceId}';`)).toBe("0");
  });

  test("promotes a browser-local note thread into a persistent Studio conversation", async ({ page, merchant, environment }) => {
    await signIn(page, environment, merchant, "owner");
    await page.goto(`/en/owner/${merchant.slug}/conversation`);

    // The workbench stays the local-notes surface.
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
