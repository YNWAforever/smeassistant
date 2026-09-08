import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createCompletionPorts: vi.fn(), completeSignIn: vi.fn() }));
vi.mock("@/lib/identity/complete-sign-in-ports", () => ({ createCompletionPorts: mocks.createCompletionPorts }));
vi.mock("@/lib/identity/complete-sign-in", () => ({ completeSignIn: mocks.completeSignIn }));

import { POST } from "./route";

it("contains a production port initialization failure behind a no-store unavailable response", async () => {
  mocks.createCompletionPorts.mockRejectedValue(new Error("database connection string secret"));
  const response = await POST(new Request("https://app.test/api/owner/sign-in/complete", {
    method: "POST",
    headers: { origin: "https://app.test", "content-type": "application/json", "sec-fetch-site": "same-origin" },
    body: JSON.stringify({ locale: "en" }),
  }));
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ kind: "recover", reason: "unavailable" });
});
