import { redirect } from "next/navigation";

import { DEFAULT_LOCALE } from "@/lib/locale";

/**
 * Every route in this app is locale-prefixed (CLAUDE.md §3.1). `proxy.ts`
 * already redirects "/" to "/zh-HK"; this page repeats the same decision for
 * the requests that never reach the proxy (a direct render, a test harness),
 * so the two can never disagree.
 */
export default function RootRedirect() {
  redirect(`/${DEFAULT_LOCALE}`);
}
