import { expect, test } from "@playwright/test";
import { waitForHydration } from "../../test/e2e/fixtures";

test("hydration readiness survives a missing document root and still requires the hydration marker", async ({ page }) => {
  type Probe = { hasRoot: boolean; ready?: boolean };
  let notifyMissing!: (probe: Probe) => void;
  let notifyRestored!: (probe: Probe) => void;
  const polledWithoutRoot = new Promise<Probe>(resolve => { notifyMissing = resolve; });
  const polledWithRoot = new Promise<Probe>(resolve => { notifyRestored = resolve; });
  await page.exposeFunction("notifyHydrationProbe", (probe: Probe) => {
    if (probe.hasRoot) notifyRestored(probe); else notifyMissing(probe);
  });
  await page.setContent("<html><body>Before navigation</body></html>");
  await page.evaluate(() => { document.documentElement.remove(); });
  // Notify only after the helper's actual predicate has run. Playwright itself
  // can read documentElement while preparing a poll, before that predicate runs.
  const observedPage = new Proxy(page, {
    get(target, property, receiver) {
      if (property === "waitForFunction") {
        return (predicate: () => boolean, argument: undefined, options: { timeout: number }) =>
          target.waitForFunction(`(() => { let ready; try { ready = (${predicate.toString()})(); return ready; } finally { void window.notifyHydrationProbe({ hasRoot: document.documentElement !== null, ready }); } })()`, argument, options);
      }
      return Reflect.get(target, property, receiver);
    },
  });

  const hydration = waitForHydration(observedPage).then(
    () => null,
    (error: Error) => error,
  );
  expect((await polledWithoutRoot).ready).toBe(false);
  await page.evaluate(() => { document.appendChild(document.createElement("html")); });
  expect((await polledWithRoot).ready).toBe(false);
  await page.evaluate(() => { document.documentElement.dataset.hydrated = "true"; });
  expect(await hydration).toBeNull();
});
