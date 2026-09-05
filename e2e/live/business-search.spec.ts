import { test, expect } from "@playwright/test";
test("authorized live business search", async ({ request }) => {
  if (process.env.E2E_AUTHORIZE_PAID_SEARCH !== "true") throw new Error("Paid search requires explicit authorization and E2E_AUTHORIZE_PAID_SEARCH=true");
  const response = await request.post("/api/business/search", { data: { query: "錦汶館", market: "HK", sessionId: crypto.randomUUID() } });
  expect(response.status()).toBe(200);
  expect(["SUCCESS", "NO_RESULTS"]).toContain((await response.json()).outcome);
});
