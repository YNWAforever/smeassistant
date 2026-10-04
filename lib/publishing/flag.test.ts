import { describe, expect, it } from "vitest";
import { gbpReplyPublishEnabled } from "./flag";

describe("gbpReplyPublishEnabled", () => {
  it('only "true" enables; "TRUE", "1", " true" and unset do not', () => {
    expect(gbpReplyPublishEnabled({ GBP_REPLY_PUBLISH_ENABLED: "true" })).toBe(true);
    expect(gbpReplyPublishEnabled({ GBP_REPLY_PUBLISH_ENABLED: "TRUE" })).toBe(false);
    expect(gbpReplyPublishEnabled({ GBP_REPLY_PUBLISH_ENABLED: "1" })).toBe(false);
    expect(gbpReplyPublishEnabled({ GBP_REPLY_PUBLISH_ENABLED: " true" })).toBe(false);
    expect(gbpReplyPublishEnabled({ GBP_REPLY_PUBLISH_ENABLED: undefined })).toBe(false);
    expect(gbpReplyPublishEnabled({})).toBe(false);
  });
});
