import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("not_found");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/workspace/page-context", () => ({ loadOwnerPage: mocks.load, ownerPageMetadata: vi.fn() }));
vi.mock("@/components/studio/studio-view", () => ({ StudioView: () => null }));
vi.mock("@/lib/repositories/studio", () => ({
  studioRepository: vi.fn(),
  toStudioConversation: vi.fn(),
  toStudioMessage: vi.fn(),
}));
vi.mock("@/lib/studio/context", () => ({ buildStudioBriefing: vi.fn() }));
vi.mock("@/lib/studio/chips", () => ({ ensureStudioStarter: vi.fn() }));

import Page from "./page";

const props = { params: Promise.resolve({ locale: "en", workspaceSlug: "shop" }), searchParams: Promise.resolve({}) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("VERCEL", undefined);
  vi.stubEnv("CONVERSATION_HOME_ENABLED", undefined);
  vi.stubEnv("CONVERSATION_STUDIO_ENABLED", undefined);
});

afterEach(() => vi.unstubAllEnvs());

it("returns not found before reading workspace data when either flag is off", async () => {
  vi.stubEnv("CONVERSATION_HOME_ENABLED", "true");
  vi.stubEnv("CONVERSATION_STUDIO_ENABLED", "false");
  await expect(Page(props)).rejects.toThrow("not_found");
  expect(mocks.notFound).toHaveBeenCalledOnce();
  expect(mocks.load).not.toHaveBeenCalled();
});

it("returns not found when Home is off even if Studio is on", async () => {
  vi.stubEnv("CONVERSATION_HOME_ENABLED", "false");
  vi.stubEnv("CONVERSATION_STUDIO_ENABLED", "true");
  await expect(Page(props)).rejects.toThrow("not_found");
  expect(mocks.load).not.toHaveBeenCalled();
});

it("loads the conversation page only when both flags are exactly true", async () => {
  vi.stubEnv("CONVERSATION_HOME_ENABLED", "true");
  vi.stubEnv("CONVERSATION_STUDIO_ENABLED", "true");
  mocks.load.mockRejectedValue(new Error("load_reached"));
  await expect(Page(props)).rejects.toThrow("load_reached");
  expect(mocks.notFound).not.toHaveBeenCalled();
  expect(mocks.load).toHaveBeenCalledWith(props);
});
