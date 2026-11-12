import { permanentRedirect } from "next/navigation";

import type { OwnerPageProps } from "@/lib/workspace/page-context";

export const dynamic = "force-dynamic";

/**
 * `/conversation` is now the only Kinnso chat surface. The old Studio URL stays
 * addressable for bookmarks and links: preserve its query (`location`, `chat`,
 * `action`) and permanently redirect to the canonical route.
 */
export default async function ConversationStudioRedirect(props: OwnerPageProps) {
  const { locale, workspaceSlug } = await props.params;
  const raw = props.searchParams ? await props.searchParams : {};
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string" && first.length > 0) query.set(key, first);
  }
  const suffix = query.toString();
  permanentRedirect(`/${locale}/owner/${workspaceSlug}/conversation${suffix ? `?${suffix}` : ""}`);
}
