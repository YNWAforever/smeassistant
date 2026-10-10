import { describe, expect, it } from "vitest";
import { providerErrorDetail } from "./provider-error";

describe("providerErrorDetail", () => {
  it("keeps a plain status and an UPPER_SNAKE code", () => {
    expect(providerErrorDetail({ status: 404, code: "NOT_FOUND", message: "x" })).toEqual({ status: 404, code: "NOT_FOUND" });
  });

  it("never returns the message, and drops a code that could carry free text", () => {
    const detail = providerErrorDetail({ status: 400, code: "invalid email a@b.example", message: "a@b.example" });
    expect(detail).toEqual({ status: 400, code: null });
    expect(JSON.stringify(detail)).not.toContain("a@b.example");
  });

  it("returns nulls for anything that is not a provider error object", () => {
    expect(providerErrorDetail(null)).toEqual({ status: null, code: null });
    expect(providerErrorDetail("boom")).toEqual({ status: null, code: null });
    expect(providerErrorDetail({ status: "404", code: 7 })).toEqual({ status: null, code: null });
    expect(providerErrorDetail({ status: 42 })).toEqual({ status: null, code: null });
  });
});
