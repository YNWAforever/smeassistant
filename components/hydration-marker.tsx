"use client";

import { useEffect } from "react";

/**
 * Sets `<html data-hydrated="true">` once React has hydrated the page. It renders nothing and changes
 * nothing a visitor sees.
 *
 * The acceptance suite waits for it after every full page load (`test/e2e/fixtures.ts`). Under
 * `next dev`, hydration can lag the `load` event by seconds. A test that clicks or types in that window
 * acts on server-rendered HTML: a `<Link>` click becomes a full browser navigation, and a value typed
 * into a controlled input is wiped when React takes over. That was a local acceptance flake
 * (`preview-draft`: the unlock email was lost, so the form never submitted).
 */
export function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return null;
}
