import { describe, expect, it } from "vitest";
import { deriveRequestStatus } from "./my-access-request";

describe("deriveRequestStatus", () => {
  it("is pending when nothing has closed it", () => {
    expect(deriveRequestStatus({ resolved_at: null }, [])).toBe("pending");
  });

  it("is awaiting_information when that was the last thing said", () => {
    expect(
      deriveRequestStatus({ resolved_at: null }, [
        { event: "access_request.submitted" },
        { event: "access_request.information_requested" },
      ]),
    ).toBe("awaiting_information");
  });

  it("returns to pending after the requester submits again", () => {
    expect(
      deriveRequestStatus({ resolved_at: null }, [
        { event: "access_request.information_requested" },
        { event: "access_request.submitted" },
      ]),
    ).toBe("pending");
  });

  it.each([
    ["access_request.approved", "approved"],
    ["access_request.rejected", "rejected"],
  ])("reads %s from the log, because the row cannot tell them apart", (event, expected) => {
    expect(deriveRequestStatus({ resolved_at: "2026-09-11T00:00:00Z" }, [{ event }])).toBe(expected);
  });

  it("is closed when the row is resolved but no terminal event is readable", () => {
    expect(deriveRequestStatus({ resolved_at: "2026-09-11T00:00:00Z" }, [])).toBe("closed");
  });

  // An operator who opens the request must not change what the owner is told.
  it("ignores a reviewed event, which is not an outcome", () => {
    expect(
      deriveRequestStatus({ resolved_at: null }, [
        { event: "access_request.submitted" },
        { event: "access_request.reviewed" },
      ]),
    ).toBe("pending");
  });
});
