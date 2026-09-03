import type { Metadata } from "next";

import { SelectWorkspacePage } from "@/components/select-workspace-page";
import { requireUser } from "@/lib/auth";
import { copy, normaliseLocale } from "@/lib/copy";
import { listWorkspaceCards } from "@/lib/workspace/queries";

import { publicMetadata } from "../../_meta";
import { firstParam } from "../../_params";
import { signOutAction } from "../actions";

/** Session-bound: reads cookies and the caller's memberships on every request. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = normaliseLocale((await params).locale);
  const isChinese = locale !== "en";
  return {
    ...publicMetadata({
      locale,
      path: "/owner/select-workspace",
      title: isChinese ? "選擇工作台" : "Choose a workspace",
      description: copy[locale].funnel.trust.intro,
    }),
    robots: { index: false, follow: false },
  };
}

export default async function OwnerSelectWorkspace({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = normaliseLocale((await params).locale);
  const user = await requireUser(locale, `/${locale}/owner/select-workspace`);
  const query = await searchParams;
  const cards = await listWorkspaceCards(user.id);
  const denied = firstParam(query.denied);
  return (
    <SelectWorkspacePage
      locale={locale}
      cards={cards}
      email={user.email}
      denied={denied && denied.length <= 120 ? denied : undefined}
      signOutAction={signOutAction.bind(null, locale)}
    />
  );
}
