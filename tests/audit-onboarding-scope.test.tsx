import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), job: vi.fn(), latest: vi.fn(), scoped: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.user }));
vi.mock("@/lib/repositories/claims", () => ({ claimsRepository: { jobBySlug: mocks.job } }));
vi.mock("@/lib/repositories/membership", () => ({ membershipRepository: { accepted: vi.fn() } }));
vi.mock("@/lib/repositories/access-requests", () => ({ accessRequestRepository: () => ({ latestForUser: mocks.latest, latestForUserAndReport: mocks.scoped }) }));
vi.mock("@/lib/repositories/workspace-read", () => ({ workspaceReadRepository: () => ({}) }));
vi.mock("@/lib/repositories/brand", () => ({ brandRepository: () => ({}) }));
vi.mock("@/components/onboarding-page", () => ({ OnboardingPage: () => null }));
vi.mock("@/components/workspace/access-request-form", () => ({ AccessRequestForm: () => null }));
vi.mock("@/components/workspace/access-request-status", () => ({ AccessRequestStatus: () => null }));

import Page from "@/app/[locale]/owner/onboarding/page";
import { AccessRequestForm } from "@/components/workspace/access-request-form";
import { AccessRequestStatus } from "@/components/workspace/access-request-status";

const currentSlug = "report_B_123";
const render = () => Page({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({ claim: currentSlug }) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "same-owner", email: "owner@example.test", verified: true });
  mocks.job.mockResolvedValue({ share_slug: currentSlug, business_name: "Second shop", region: "hk", workspace_id: null, input_snapshot: {} });
  mocks.latest.mockResolvedValue(null);
  mocks.scoped.mockImplementation(async (_userId: string, slug: string) => {
    const latest = await mocks.latest();
    return latest?.request.share_slug === slug ? latest : null;
  });
});

it("finds B's older pending request even when A's approved request is newer", async () => {
  mocks.latest.mockResolvedValue({ request: { share_slug: "report_A_123", business_name: "First shop", resolved_at: "2026-10-10T00:00:00Z" }, events: [{ event: "access_request.approved" }] });
  mocks.scoped.mockResolvedValue({ request: { share_slug: currentSlug, business_name: "Second shop", resolved_at: null }, events: [] });
  const page = await render();
  expect(page.props.accessRequest.type).toBe(AccessRequestStatus);
  expect(page.props.accessRequest.props).toMatchObject({ status: "pending", businessName: "Second shop" });
  expect(mocks.scoped).toHaveBeenCalledWith("same-owner", currentSlug);
  expect(page.props.ownsWorkspace).toBe(false);
});

it("shows a retryable read failure rather than inviting a duplicate application", async () => {
  mocks.scoped.mockRejectedValue(new Error("fixture read outage"));
  const page = await render();
  expect(page.props.accessRequest.type).not.toBe(AccessRequestForm);
  expect(page.props.accessRequest.type).not.toBe(AccessRequestStatus);
  expect(page.props.ownsWorkspace).toBe(false);
});

it("control: first claim without an earlier request receives a form", async () => {
  const page = await render();
  expect(page.props.accessRequest.type).toBe(AccessRequestForm);
  expect(page.props.accessRequest.props.slug).toBe(currentSlug);
  expect(page.props.ownsWorkspace).toBe(false);
});

it("control: an existing request for this report receives its own status", async () => {
  mocks.latest.mockResolvedValue({ request: { share_slug: currentSlug, business_name: "Second shop", resolved_at: null }, events: [] });
  const page = await render();
  expect(page.props.accessRequest.type).toBe(AccessRequestStatus);
  expect(page.props.accessRequest.props.status).toBe("pending");
});

it("desired behavior: an approved request for report A must not hide report B's request form", async () => {
  mocks.latest.mockResolvedValue({ request: { share_slug: "report_A_123", business_name: "First shop", resolved_at: "2026-10-10T00:00:00Z" }, events: [{ event: "access_request.approved" }] });
  const page = await render();
  console.info("AUDIT_ONBOARDING_SCOPE", JSON.stringify({ currentReport: page.props.evidence.shareSlug, currentBusiness: page.props.evidence.businessName, ownsWorkspace: page.props.ownsWorkspace, displayedRequest: page.props.accessRequest.props, formVisible: page.props.accessRequest.type === AccessRequestForm }));
  expect(page.props.accessRequest.type).toBe(AccessRequestForm);
  expect(page.props.accessRequest.props.slug).toBe(currentSlug);
});
