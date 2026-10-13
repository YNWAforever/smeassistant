"use client";

/**
 * The Neon Auth client (with the zod and auth-js code it brings) was about
 * 105 kB gzipped on the sign-in page's first load, though it is only used once
 * a sign-in button is pressed. Load it on demand instead; `preloadAuthClient`
 * warms it when the page is idle or the pointer or focus nears the form, so
 * the press itself rarely waits.
 */
import { retryableLoad } from "@/lib/retryable-load";

type AuthClient = (typeof import("./client"))["authClient"];

export const loadAuthClient: () => Promise<AuthClient> = retryableLoad(() => import("./client").then((module) => module.authClient));

export function preloadAuthClient(): void {
  void loadAuthClient().catch(() => undefined);
}
