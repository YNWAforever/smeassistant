import { describe, it, expect } from "vitest";
import { pickFinding, pickSummary } from "./localized-field";

const finding = { owner_message_zh: "粵", owner_message_en: "EN", owner_message_tw: "繁" };
const job = { summary_zh: "粵", summary_en: "EN", summary_tw: "繁" };

describe("localized-field selection", () => {
  it("zh-TW picks the _tw field, falling back to _zh", () => {
    expect(pickFinding(finding, "zh-TW")).toBe("繁");
    expect(pickFinding({ ...finding, owner_message_tw: null }, "zh-TW")).toBe("粵");
    expect(pickSummary(job, "zh-TW")).toBe("繁");
  });
  it("en picks _en, falling back to _zh", () => {
    expect(pickFinding(finding, "en")).toBe("EN");
    expect(pickFinding({ ...finding, owner_message_en: null }, "en")).toBe("粵");
  });
  it("zh-HK picks _zh", () => {
    expect(pickFinding(finding, "zh-HK")).toBe("粵");
    expect(pickSummary(job, "zh-HK")).toBe("粵");
  });
});
