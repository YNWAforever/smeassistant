// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

import { signUnsubscribeToken } from "@/lib/mail/unsubscribe-token";

const mocks = vi.hoisted(() => ({ optOut: vi.fn() }));
// Never imported by the page (it only verifies the token), but mocked here so
// that if a later edit ever wired the page to the repository, this test would
// catch it immediately rather than silently hitting a real pool.
vi.mock("@/lib/repositories/mail-outbox", () => ({ mailOutboxRepository: () => ({ optOut: mocks.optOut }) }));
// components/product-ui's PublicPageFrame calls next/navigation hooks via
// PublicHeader -> LocaleSelect (components/unlock-page.test.tsx precedent);
// stub it down to its children so this test exercises UnsubscribeClient's own
// markup, not the whole public shell.
vi.mock("@/components/product-ui", () => ({
  PublicPageFrame: ({ children }: { children: ReactNode }) => children,
  SectionCard: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));

import Unsubscribe, { generateMetadata } from "./page";

const SECRET = "p".repeat(32);

function render(searchParams: Record<string, string>) {
  return Unsubscribe({
    params: Promise.resolve({ locale: "en" }),
    searchParams: Promise.resolve(searchParams),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MAIL_UNSUBSCRIBE_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/unsubscribe page", () => {
  it("renders the confirm button for a valid token and never touches the outbox repository", async () => {
    const token = signUnsubscribeToken(
      { userId: "user-1", workspaceId: "workspace-1", kind: "rescan_complete", expiresAt: Date.now() + 60_000 },
      SECRET,
    );
    const element = await render({ token });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("Unsubscribe");
    expect(html).not.toContain("no longer valid");
    expect(mocks.optOut).not.toHaveBeenCalled();
  });

  it("renders the neutral invalid view for a tampered or expired token", async () => {
    const element = await render({ token: "not-a-real-token" });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("no longer valid");
    expect(mocks.optOut).not.toHaveBeenCalled();
  });

  it("renders the invalid view when no token is present at all", async () => {
    const element = await render({});
    const html = renderToStaticMarkup(element);
    expect(html).toContain("no longer valid");
    expect(mocks.optOut).not.toHaveBeenCalled();
  });

  it("renders the invalid view when the secret is unusable, even for a well-formed token", async () => {
    vi.stubEnv("MAIL_UNSUBSCRIBE_SECRET", "too-short");
    const token = signUnsubscribeToken(
      { userId: "user-1", workspaceId: "workspace-1", kind: "rescan_complete", expiresAt: Date.now() + 60_000 },
      SECRET,
    );
    const element = await render({ token });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("no longer valid");
  });

  it("sets noindex, nofollow metadata -- this belongs to one specific mailed link", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "en" }) });
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
