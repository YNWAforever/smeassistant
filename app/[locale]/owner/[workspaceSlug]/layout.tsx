import type { ReactNode } from "react";

import { WorkspacePageFrame } from "@/components/workspace-shell";
import { requireMembership } from "@/lib/auth";
import { normaliseLocale } from "@/lib/copy";
import { countUrgentActions, loadWorkspaceContext } from "@/lib/workspace/queries";
import { buildShellWorkspace } from "@/lib/workspace/shell";
import { themeBootScript } from "@/lib/theme";

/**
 * The workspace shell (CLAUDE.md Phase 2 item 6). `requireMembership` fails
 * closed — signed out → sign-in, not a member → select-workspace?denied= —
 * before any data is read; the shell then shows the real workspace name,
 * locations, usage, account and role. The EnvironmentBar appears only for
 * `is_demo` workspaces (§5 "Global").
 *
 * `WorkspacePageFrame` is a client component; everything passed to it here is
 * serialisable.
 */
export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string; workspaceSlug: string }>;
}) {
  const { locale: rawLocale, workspaceSlug } = await params;
  const locale = normaliseLocale(rawLocale);
  const membership = await requireMembership(workspaceSlug, locale);
  const context = await loadWorkspaceContext(membership);
  const urgentActions = await countUrgentActions(context.workspace.id);
  const workspace = buildShellWorkspace(context, locale, { urgentActions });
  return (
    <>
      {/* Applies the saved or device theme before first paint (lib/theme.ts). */}
      <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      <WorkspacePageFrame locale={locale} workspace={workspace} demo={context.workspace.isDemo}>
        {children}
      </WorkspacePageFrame>
    </>
  );
}
