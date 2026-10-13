"use client";

/**
 * The Neon Auth client (with the zod and auth-js code it brings) was about
 * 105 kB gzipped on the sign-in page's first load, though it is only used once
 * a sign-in button is pressed. Load it on demand instead; `preloadAuthClient`
 * warms it when the page is idle or the pointer or focus nears the form, so
 * the press itself rarely waits.
 */
type AuthClient = (typeof import("./client"))["authClient"];

let pending: Promise<AuthClient> | null = null;

export function loadAuthClient(): Promise<AuthClient> {
  pending ??= import("./client").then((module) => module.authClient).catch((error: unknown) => {
    pending = null;
    throw error;
  });
  return pending;
}

export function preloadAuthClient(): void {
  void loadAuthClient().catch(() => undefined);
}
