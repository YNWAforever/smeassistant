// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyToClipboard, downloadText } from "./download";

afterEach(() => vi.restoreAllMocks());

describe("downloadText", () => {
  it("creates an object URL, clicks a download anchor and revokes the URL", () => {
    const create = vi.fn(() => "blob:mock");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadText("draft.md", "# Hello", "text/markdown;charset=utf-8");

    expect(create).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:mock");
  });
});

describe("copyToClipboard", () => {
  it("uses the async clipboard when available", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    expect(await copyToClipboard("hi")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hi");
  });

  it("falls back to execCommand and reports false when everything fails", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    document.execCommand = vi.fn(() => true);
    expect(await copyToClipboard("hi")).toBe(true);
    document.execCommand = vi.fn(() => { throw new Error("nope"); });
    expect(await copyToClipboard("hi")).toBe(false);
  });
});
