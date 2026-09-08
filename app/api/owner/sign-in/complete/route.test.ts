import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createCompletionPorts: vi.fn(), completeSignIn: vi.fn() }));
vi.mock("@/lib/identity/complete-sign-in-ports", () => ({ createCompletionPorts: mocks.createCompletionPorts }));
vi.mock("@/lib/identity/complete-sign-in", () => ({ completeSignIn: mocks.completeSignIn }));

import { POST } from "./route";

function request(body: unknown, headers: HeadersInit = {}) {
  return new Request("https://app.test/api/owner/sign-in/complete", {
    method: "POST",
    headers: { origin: "https://app.test", "content-type": "application/json", "sec-fetch-site": "same-origin", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/owner/sign-in/complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createCompletionPorts.mockResolvedValue({});
    mocks.completeSignIn.mockResolvedValue({ kind: "redirect", destination: "/en/owner/select-workspace" });
  });

  it.each([
    ["missing origin", request({ locale: "en" }, { origin: "" })],
    ["foreign origin", request({ locale: "en" }, { origin: "https://evil.test" })],
    ["null origin", request({ locale: "en" }, { origin: "null" })],
    ["same-site fetch", request({ locale: "en" }, { "sec-fetch-site": "same-site" })],
    ["wrong content type", request({ locale: "en" }, { "content-type": "text/plain" })],
    ["malformed JSON", request("{", {})],
    ["oversized JSON", request({ locale: "en", returnTo: `/${"a".repeat(4100)}` })],
  ])("rejects %s before resolving identity ports", async (_name, input) => {
    const response = await POST(input);
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.createCompletionPorts).not.toHaveBeenCalled();
  });

  it("returns a fixed successful redirect response", async () => {
    mocks.completeSignIn.mockResolvedValue({ kind: "redirect", destination: "/en/owner/select-workspace" });
    const response = await POST(request({ locale: "en", method: "google" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ kind: "redirect", destination: "/en/owner/select-workspace" });
  });

  it("maps invalid sessions and outages to fixed responses", async () => {
    mocks.completeSignIn.mockResolvedValueOnce({ kind: "recover", reason: "invalid_session", correlationId: "id-1" });
    expect((await POST(request({ locale: "en" }))).status).toBe(401);
    mocks.completeSignIn.mockResolvedValueOnce({ kind: "recover", reason: "unavailable", correlationId: "id-2" });
    const response = await POST(request({ locale: "en" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ kind: "recover", reason: "unavailable" });
  });
});
