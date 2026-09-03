import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/unlock", () => {
  it("redirects with 307 so the method and body survive", async () => {
    const req = new Request("https://scanner.test/api/unlock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "abc" }),
    });

    const response = await POST(req);

    // 307 specifically: a 301/302 would let the client downgrade POST to GET
    // and silently drop the body, which is the whole reason this shim exists.
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://scanner.test/api/report-access/unlock",
    );
  });
});
