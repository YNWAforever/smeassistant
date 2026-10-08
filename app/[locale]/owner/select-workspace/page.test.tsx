import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ user: vi.fn(), cards: vi.fn(), latest: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.user }));
vi.mock("@/lib/workspace/queries", () => ({ listWorkspaceCards: mocks.cards }));
vi.mock("@/lib/repositories/access-requests", () => ({ accessRequestRepository: () => ({ latestForUser: mocks.latest }) }));
vi.mock("@/lib/oauth/claim-flow-flag", () => ({ claimViaOAuthEnabled: () => false }));
vi.mock("../actions", () => ({ signOutAction: vi.fn() }));
vi.mock("@/components/select-workspace-page", () => ({ SelectWorkspacePage: () => null }));
import Page from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "session-user", email: "own@example.test", verified: true });
  mocks.cards.mockResolvedValue([]);
  mocks.latest.mockResolvedValue(null);
});

it.each([
  ["pending", [], "Your request is recorded"],
  ["awaiting_information", [{ event: "access_request.information_requested" }], "more information"],
  ["no_request", null, null],
] as const)("reads only the verified caller's %s status", async (_state, events, visible) => {
  if (events) mocks.latest.mockResolvedValue({ request: { resolved_at: null, business_name: "Own shop", share_slug: "Ab_cd-12" }, events });
  const result = await Page({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({ userId: "other-user", email: "other@example.test" }) });
  expect(mocks.user).toHaveBeenCalledWith("en", "/en/owner/select-workspace");
  expect(mocks.cards).toHaveBeenCalledWith("session-user");
  expect(mocks.latest).toHaveBeenCalledWith("session-user");
  expect(result.props.cards).toEqual([]);
  if (visible) expect(renderToStaticMarkup(result.props.accessRequest)).toContain(visible);
  else expect(result.props.accessRequest).toBeUndefined();
});
