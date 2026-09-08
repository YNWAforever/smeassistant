import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createCompletionPorts: vi.fn(), completeSignIn: vi.fn() }));
vi.mock("@/lib/identity/complete-sign-in-ports", () => ({ createCompletionPorts: mocks.createCompletionPorts }));
vi.mock("@/lib/identity/complete-sign-in", () => ({ completeSignIn: mocks.completeSignIn }));

import { POST } from "./route";

it("accepts only the JSON media type before loading identity ports", async () => {
  const response = await POST(new Request("https://app.test/api/owner/sign-in/complete", {
    method: "POST",
    headers: { origin: "https://app.test", "content-type": "application/jsonp", "sec-fetch-site": "same-origin" },
    body: JSON.stringify({ locale: "en" }),
  }));
  expect(response.status).toBe(400);
  expect(mocks.createCompletionPorts).not.toHaveBeenCalled();
});
