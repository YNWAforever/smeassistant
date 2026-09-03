import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { BrandView } from "@/components/workspace/brand-view";
import { EvidenceGallery } from "@/components/workspace/evidence-gallery";
import { RescanButton } from "@/components/workspace/rescan-button";
import { TeamView } from "@/components/workspace/team-view";
import type { EvidenceGalleryItem } from "@/lib/report/view-model";
import type { BrandProfile } from "@/lib/workspace/brand";
import type { TeamModel } from "@/lib/workspace/team";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

/**
 * Phase 6 UI contracts (CONTRACT-6 "Stream B"): the real role drives every
 * control, tier gates carry the billing link, and nothing renders demo rows.
 */
const item: EvidenceGalleryItem = { id: "ev-1", provider: "instagram", evidenceType: "post", sourceUrl: "https://instagram.com/p/1", mediaUrl: "https://signed.example/1.jpg", capturedAt: "2026-09-01T10:00:00Z", publishedAt: null, text: "Lunch set", metadata: {}, status: "stored", limitationCode: null };

describe("EvidenceGallery", () => {
  it("renders nothing without items and the report's gallery markup with them", () => {
    expect(renderToStaticMarkup(<EvidenceGallery locale="en" items={[]} />)).toBe("");
    expect(renderToStaticMarkup(<EvidenceGallery locale="en" items={undefined} />)).toBe("");
    const html = renderToStaticMarkup(<EvidenceGallery locale="zh-HK" items={[item]} />);
    expect(html).toContain('class="evidence-passport"');
    expect(html).toContain('src="https://signed.example/1.jpg"');
    expect(html).toContain("instagram · post");
  });
});

describe("RescanButton", () => {
  const base = { locale: "en" as const, workspaceId: "ws", workspaceSlug: "shop", locationId: "loc-1" };
  it("is hidden for viewers", () => {
    expect(renderToStaticMarkup(<RescanButton {...base} tier="paid" role="viewer" />)).toBe("");
  });
  it("is disabled with the tier copy and billing link on lite", () => {
    const html = renderToStaticMarkup(<RescanButton {...base} tier="lite" role="owner" />);
    expect(html).toContain('disabled=""');
    expect(html).toContain("Growth Workspace plan");
    expect(html).toContain('href="/en/owner/shop/settings/billing"');
  });
  it("is enabled for a paid owner with a location, disabled for the all-locations scope", () => {
    expect(renderToStaticMarkup(<RescanButton {...base} tier="paid" role="manager" />)).not.toContain('disabled=""');
    expect(renderToStaticMarkup(<RescanButton {...base} locationId={null} tier="paid" role="owner" />)).toContain('disabled=""');
  });
});

const team: TeamModel = {
  members: [
    { id: "m-owner", email: "owner@example.com", role: "owner", userId: "u1", acceptedAt: "2026-08-01T00:00:00Z", invitedAt: null, locationScope: null },
    { id: "m-mgr", email: "may@example.com", role: "manager", userId: "u2", acceptedAt: "2026-08-02T00:00:00Z", invitedAt: "2026-08-01T00:00:00Z", locationScope: ["loc-1"] },
    { id: "m-view", email: "ken@example.com", role: "viewer", userId: null, acceptedAt: null, invitedAt: "2026-08-03T00:00:00Z", locationScope: null },
  ],
  locations: [
    { id: "loc-1", slug: "yik-yam", name: "Yik Yam Street", address: null, district: null, isPrimary: true, placeId: null },
    { id: "loc-2", slug: "tin-hau", name: "Tin Hau", address: null, district: null, isPrimary: false, placeId: null },
  ],
};

describe("TeamView", () => {
  it("gives owners the invite sheet and remove buttons, never a preview-role select", () => {
    const html = renderToStaticMarkup(<TeamView locale="en" workspaceId="ws" role="owner" timezone="Asia/Hong_Kong" model={team} />);
    expect(html).toContain("Invite member");
    expect(html).toContain("Remove may@example.com");
    expect(html).toContain("Remove ken@example.com");
    expect(html).not.toContain("Remove owner@example.com");
    expect(html).not.toContain("Preview as");
    expect(html).not.toContain("permission-banner");
    expect(html).toContain("Invite pending");
  });
  it("shows managers and viewers the read-only table behind the permission banner", () => {
    const html = renderToStaticMarkup(<TeamView locale="zh-HK" workspaceId="ws" role="viewer" timezone="Asia/Hong_Kong" model={team} />);
    expect(html).toContain("permission-banner");
    expect(html).not.toContain("邀請成員");
    expect(html).not.toContain("移除");
    expect(html).toContain("Yik Yam Street");
    expect(html).toContain("所有地點");
  });
});

const brand: BrandProfile = { workspaceId: "ws", voice: "professional", approvedClaims: ["20 seats"], prohibitedTerms: ["best"], languages: ["zh-HK", "en"], facts: { seats: "20" }, updatedAt: "2026-09-01T00:00:00Z" };

describe("BrandView", () => {
  it("binds the prototype layout to the profile and gates saving on the owner role", () => {
    const owner = renderToStaticMarkup(<BrandView locale="en" workspaceId="ws" role="owner" brand={brand} />);
    expect(owner).toContain('type="submit"');
    expect(owner).toContain("Save new version");
    expect(owner).not.toContain("permission-banner");
    expect(owner).toContain("Clear and professional");
    expect(owner).toContain("20 seats");
    expect(owner).toContain('value="seats"');
    expect(owner).toContain("Updated 2026-09-01");
    const viewer = renderToStaticMarkup(<BrandView locale="zh-TW" workspaceId="ws" role="viewer" brand={brand} />);
    expect(viewer).not.toContain('type="submit"');
    expect(viewer).toContain("permission-banner");
    expect(viewer).toContain('readOnly=""');
  });
});
