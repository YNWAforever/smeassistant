// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReportEvidenceItem } from "@/lib/funnel/report-props";
import { EvidenceGallery } from "./evidence-gallery";

afterEach(cleanup);
const item = (id: string, extra: Partial<ReportEvidenceItem> = {}): ReportEvidenceItem => ({ id, provider: "instagram", evidenceType: "post", sourceUrl: "https://example.com/post", mediaUrl: `/authorized/${id}`, capturedAt: "2026-09-07T12:00:00Z", publishedAt: "2026-09-06T12:00:00Z", text: `Caption ${id}`, status: "stored", limitationCode: null, ...extra });

describe("authorized evidence gallery", () => {
  it("renders only stored photos with an authorized URL and retains metadata and failures", () => {
    render(<EvidenceGallery locale="en" items={[item("stored"), item("metadata", { status: "metadata_only" }), item("failed", { status: "failed" }), item("missing", { mediaUrl: null })]} />);
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByRole("img")).toHaveAttribute("loading", "lazy");
    expect(screen.getByText("Metadata only · snapshot not stored")).toBeVisible();
    expect(screen.getAllByText("Snapshot unavailable")).toHaveLength(1);
    expect(screen.getByText("Stored image unavailable")).toBeVisible();
    expect(screen.getAllByRole("link", { name: "View source" })).toHaveLength(4);
  });
  it.each([
    ["en", "Metadata only · snapshot not stored", "Snapshot unavailable", "Stored image unavailable"],
    ["zh-HK", "只有中繼資料 · 未儲存快照", "快照未能取得", "已儲存相片暫時未能顯示"],
    ["zh-TW", "僅有中繼資料 · 未儲存快照", "快照無法取得", "已儲存相片暫時無法顯示"],
  ] as const)("keeps stored, metadata-only and failed labels distinct for %s", (locale, metadataLabel, failedLabel, storedUnavailableLabel) => {
    render(<EvidenceGallery locale={locale} items={[item("metadata", { status: "metadata_only" }), item("failed", { status: "failed" }), item("missing", { mediaUrl: null })]} />);
    expect(screen.getByText(metadataLabel)).toBeVisible();
    expect(screen.getByText(failedLabel)).toBeVisible();
    expect(screen.getByText(storedUnavailableLabel)).toBeVisible();
  });
  it.each([
    ["en", "Stored image unavailable"],
    ["zh-HK", "已儲存相片暫時未能顯示"],
    ["zh-TW", "已儲存相片暫時無法顯示"],
  ] as const)("uses the stored-image-unavailable fallback after a preview error for %s", async (locale, storedUnavailableLabel) => {
    render(<EvidenceGallery locale={locale} items={[item("preview")]} />);
    fireEvent.click(screen.getByRole("button", { name: /Open photo|開啟相片/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.error(within(dialog).getByRole("img"));
    expect(within(dialog).getByText(storedUnavailableLabel)).toBeVisible();
  });
  it("limits each provider to six items and reveals the remaining count without dropping other providers", () => {
    render(<EvidenceGallery locale="en" items={[...Array.from({ length: 8 }, (_, i) => item(`${i}`)), item("maps", { provider: "google_maps" }), item("other", { provider: "website" })]} />);
    expect(screen.getAllByRole("img")).toHaveLength(8);
    expect(screen.getByRole("heading", { name: "Google Maps (1)" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "website (1)" })).toBeVisible();
    const reveal = screen.getByRole("button", { name: "Show 2 more" });
    expect(reveal).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(reveal);
    expect(screen.getAllByRole("img")).toHaveLength(10);
    expect(reveal).toHaveAttribute("aria-expanded", "true");
  });
  it("uses the actual modal, traps focus, closes with Escape and restores trigger focus", async () => {
    render(<EvidenceGallery locale="en" items={[item("one")]} />);
    const trigger = screen.getByRole("button", { name: "Open photo: Instagram · post 1" });
    trigger.focus();
    // Native button activation is synthesized by click in jsdom; browser keyboard activation is covered by E2E.
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Instagram · post 1" });
    const close = within(dialog).getByRole("button", { name: "Close photo" });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    close.focus();
    fireEvent.keyDown(close, { key: "Tab" });
    expect(within(dialog).getByRole("link", { name: "View source" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
  it("keeps source and capture/publication metadata in previews and captions in a disclosure", async () => {
    render(<EvidenceGallery locale="en" items={[item("long", { text: "Long caption ".repeat(50) })]} />);
    fireEvent.click(screen.getByRole("button", { name: /Open photo/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Captured 2026-09-07T12:00:00Z")).toBeVisible();
    expect(within(dialog).getByText("Published 2026-09-06T12:00:00Z")).toBeVisible();
    expect(within(dialog).getByRole("link", { name: "View source" })).toHaveAttribute("href", "https://example.com/post");
    expect(dialog.querySelector("details")).not.toHaveAttribute("open");
  });
  it("turns a broken thumbnail into useful metadata without opening a source image", () => {
    render(<EvidenceGallery locale="en" items={[item("broken")]} />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open photo/ })).not.toBeInTheDocument();
    expect(screen.getByText("Stored image unavailable")).toBeVisible();
    expect(screen.getByRole("link", { name: "View source" })).toBeVisible();
  });
  it("keeps an errored preview open with metadata and a working close/focus return", async () => {
    render(<EvidenceGallery locale="en" items={[item("preview")]} />);
    const trigger = screen.getByRole("button", { name: /Open photo/ });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    fireEvent.error(within(dialog).getByRole("img"));
    expect(within(dialog).getByText("Stored image unavailable")).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close photo" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
  it.each(["zh-HK", "zh-TW"] as const)("localizes preview close for %s", async (locale) => {
    render(<EvidenceGallery locale={locale} items={[item("local")]} />);
    fireEvent.click(screen.getByRole("button", { name: /開啟相片/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "關閉相片" })).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });
  it("omits empty galleries and unsafe source links", () => {
    const { rerender, container } = render(<EvidenceGallery locale="en" items={[]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<EvidenceGallery locale="en" items={[item("unsafe", { sourceUrl: "javascript:alert(1)" }), item("credentials", { sourceUrl: "https://user:pass@example.com" })]} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});