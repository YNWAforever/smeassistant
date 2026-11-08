import { describe, expect, it } from "vitest";
import { conversationHomeEnabled } from "./conversation-flag";

describe("conversation home gate", () => {
  it("defaults off and requires exactly true", () => {
    for (const flag of [undefined, "", "false", "TRUE", "1"]) {
      expect(conversationHomeEnabled({ NODE_ENV: "development", CONVERSATION_HOME_ENABLED: flag })).toBe(false);
    }
  });
  it("allows an explicit flag in preview, production or local development/test", () => {
    for (const env of [{ VERCEL_ENV: "preview", NODE_ENV: "production" }, { VERCEL_ENV: "development" }, { VERCEL_ENV: "production", NODE_ENV: "production" }, { NODE_ENV: "development" }, { NODE_ENV: "test" }]) {
      expect(conversationHomeEnabled({ ...env, CONVERSATION_HOME_ENABLED: "true" })).toBe(true);
    }
  });
  it("keeps production disabled unless the flag is exactly true", () => {
    for (const flag of [undefined, "", "false", "TRUE", "1"]) {
      expect(conversationHomeEnabled({ VERCEL_ENV: "production", NODE_ENV: "production", CONVERSATION_HOME_ENABLED: flag })).toBe(false);
    }
  });
  it("forces unknown hosted configurations off", () => {
    for (const env of [{ VERCEL_ENV: "other", NODE_ENV: "test" }, { VERCEL: "1", NODE_ENV: "development" }, { NODE_ENV: "production" }, {}]) {
      expect(conversationHomeEnabled({ ...env, CONVERSATION_HOME_ENABLED: "true" })).toBe(false);
    }
  });
});
