import { PageSkeleton } from "@/components/states/page-skeleton"

/** Shown inside the shell while a workspace page loads (client navigation and first stream). */
export default function WorkspaceLoading() {
  return <PageSkeleton variant="today" />
}
